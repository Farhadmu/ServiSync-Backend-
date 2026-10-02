import { Response, NextFunction } from 'express';
import { Request } from 'express';
import { Prisma, AssignmentStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { ASSIGNMENT_STATUS_TRANSITIONS } from '../../constants';
import { createNotification } from '../../utils/notification';
import { getTechnicianRecommendations } from './recommendation.service';

const assignSchema = z.object({
  serviceRequestId: z.string().min(1, 'Service request ID is required'),
  technicianId: z.string().min(1, 'Technician ID is required'),
  scheduledStartAt: z.string().datetime().optional(),
  scheduledEndAt: z.string().datetime().optional(),
  technicianNotes: z.string().optional(),
  overrideReason: z.string().optional(),
});

const respondSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  reason: z.string().optional(),
});

const rescheduleSchema = z.object({
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
});

export const assignTechnician = [
  validateRequest({ body: assignSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const { serviceRequestId, technicianId, scheduledStartAt, scheduledEndAt, technicianNotes } = req.body;

    const serviceRequest = await prisma.serviceRequest.findFirst({
      where: { id: serviceRequestId, deletedAt: null },
    });

    if (!serviceRequest) throw new ApiError(404, 'Service request not found');
    if (serviceRequest.status !== 'APPROVED') {
      throw new ApiError(400, 'Service request is not in an assignable state');
    }

    const technician = await prisma.technicianProfile.findFirst({
      where: { id: technicianId, user: { isActive: true, deletedAt: null } },
    });

    if (!technician) throw new ApiError(404, 'Technician not found');
    if (!technician.isAvailable) throw new ApiError(400, 'Technician is not available');

    const start = scheduledStartAt ? new Date(scheduledStartAt) : null;
    const end = scheduledEndAt ? new Date(scheduledEndAt) : null;

    if (start && end && start >= end) {
      throw new ApiError(400, 'Invalid schedule: start must be before end');
    }

    const assignment = await prisma.$transaction(async (tx) => {
      // 1. Concurrency guard: Re-validate service request status inside atomic transaction
      const currentReq = await tx.serviceRequest.findUnique({
        where: { id: serviceRequestId },
        select: { id: true, status: true, title: true, customerId: true },
      });

      if (!currentReq || currentReq.status !== 'APPROVED') {
        throw new ApiError(409, 'Service request is no longer in an assignable state (already assigned or modified)');
      }

      // 2. Concurrency guard: Prevent duplicate active assignment race conditions
      const existingAssignment = await tx.assignment.findFirst({
        where: {
          serviceRequestId,
          status: { in: ['PENDING', 'SCHEDULED', 'ACCEPTED'] },
        },
      });

      if (existingAssignment) {
        throw new ApiError(409, 'Service request already has an active assignment');
      }

      // 3. Concurrency guard: Re-validate schedule conflicts inside atomic transaction
      if (start && end) {
        const conflicting = await tx.schedule.findFirst({
          where: {
            technicianId,
            cancelledAt: null,
            startAt: { lt: end },
            endAt: { gt: start },
          },
        });

        if (conflicting) {
          throw new ApiError(409, 'Technician is already booked for the selected time slot');
        }
      }

      const created = await tx.assignment.create({
        data: {
          serviceRequestId,
          technicianId,
          managerId: req.user!.userId,
          status: 'SCHEDULED',
          technicianNotes,
        },
        include: { serviceRequest: true, technician: { include: { user: true } } },
      });

      await tx.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { status: 'ASSIGNED' },
      });

      if (start && end) {
        await tx.schedule.create({
          data: {
            assignmentId: created.id,
            technicianId,
            startAt: start,
            endAt: end,
          },
        });
      }

      await createAuditLog({
        userId: req.user!.userId,
        action: 'ASSIGNMENT_CREATED',
        entityType: 'ASSIGNMENT',
        entityId: created.id,
        newValues: {
          ...created,
          overrideReason: req.body.overrideReason || null,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      // Automated workflow notifications
      try {
        // 1. Notify Technician
        await createNotification({
          userId: technician.userId,
          type: 'STATUS_CHANGE',
          title: 'New Service Dispatch',
          message: `You have been assigned to service request: "${serviceRequest.title}".`,
          entityType: 'ASSIGNMENT',
          entityId: created.id,
        });

        // 2. Notify Customer
        await createNotification({
          userId: serviceRequest.customerId,
          type: 'STATUS_CHANGE',
          title: 'Technician Assigned',
          message: `Certified technician ${created.technician?.user?.name || 'assigned'} has been dispatched to your service request.`,
          entityType: 'ASSIGNMENT',
          entityId: created.id,
        });
      } catch (notifErr) {
        console.warn('Failed to send assignment notification non-fatally:', notifErr);
      }

      return created;
    });

    sendCreated(res, assignment, 'Technician assigned successfully');
  }),
];

export const respondToAssignment = asyncHandler(async (req: any, res: Response) => {
  let technicianProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });

  if (!technicianProfile) {
    technicianProfile = await prisma.technicianProfile.create({
      data: {
        userId: req.user!.userId,
        isAvailable: true,
        hourlyRate: 50,
        experienceYears: 1,
      },
    });
  }

  const assignment = await prisma.assignment.findFirst({
    where: { id: req.params.id, technicianId: technicianProfile.id },
    include: { serviceRequest: true },
  });

  if (!assignment) throw new ApiError(404, 'Assignment not found');
  if (assignment.status !== 'SCHEDULED') {
    throw new ApiError(400, `Assignment is already ${assignment.status.toLowerCase()}`);
  }

  const action = req.body.action;
  if (!['ACCEPT', 'REJECT'].includes(action)) {
    throw new ApiError(400, 'Invalid action');
  }

  const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
  const allowed = ASSIGNMENT_STATUS_TRANSITIONS['SCHEDULED'] || [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `Cannot transition from SCHEDULED to ${newStatus}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.assignment.update({
      where: { id: req.params.id },
      data: {
        status: newStatus as any,
        ...(action === 'REJECT' ? { rejectedAt: new Date(), rejectedReason: req.body.reason } : { acceptedAt: new Date() }),
      },
      include: { serviceRequest: true, technician: { include: { user: true } } },
    });

    if (action === 'ACCEPT') {
      await tx.workOrder.upsert({
        where: { assignmentId: changed.id },
        update: {},
        create: { assignmentId: changed.id, status: 'SCHEDULED' },
      });
      await tx.serviceRequest.update({
        where: { id: changed.serviceRequestId },
        data: { status: 'SCHEDULED' },
      });
    }

    return changed;
  });

  try {
    await createNotification({
      userId: updated.serviceRequest.customerId,
      type: 'STATUS_CHANGE',
      title: 'Assignment updated',
      message: `Your assignment was ${newStatus.toLowerCase()}.`,
      entityType: 'ASSIGNMENT',
      entityId: updated.id,
    });
  } catch (notifErr) {
    console.warn('Failed to send notification non-fatally:', notifErr);
  }

  try {
    await createAuditLog({
      userId: req.user!.userId,
      action: action === 'ACCEPT' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED',
      entityType: 'ASSIGNMENT',
      entityId: updated.id,
      newValues: { status: newStatus },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  } catch (auditErr) {
    console.warn('Failed to create audit log non-fatally:', auditErr);
  }

  sendSuccess(res, updated, `Assignment ${newStatus.toLowerCase()} successfully`);
});

export const rescheduleAssignment = asyncHandler(async (req: any, res: Response) => {
  const assignment = await prisma.assignment.findFirst({
    where: { id: req.params.id, status: 'SCHEDULED' },
    include: { schedule: true },
  });

  if (!assignment) throw new ApiError(404, 'Assignment not found or not in scheduled state');

  const start = new Date(req.body.scheduledStartAt);
  const end = new Date(req.body.scheduledEndAt);

  if (start >= end) throw new ApiError(400, 'Invalid schedule: start must be before end');

  const conflicting = await prisma.schedule.findFirst({
    where: {
      technicianId: assignment.technicianId,
      cancelledAt: null,
      id: { not: assignment.schedule?.id },
      OR: [{ startAt: { lt: end }, endAt: { gt: start } }],
    },
  });

  if (conflicting) {
    throw new ApiError(409, 'Technician is already booked for the selected time slot');
  }

  const updated = await prisma.assignment.update({
    where: { id: req.params.id },
    data: {
      technicianNotes: assignment.technicianNotes,
    },
    include: { serviceRequest: true, technician: { include: { user: true } } },
  });

  if (assignment.schedule) {
    await prisma.schedule.update({
      where: { id: assignment.schedule.id },
      data: { startAt: start, endAt: end },
    });
  }

  await createAuditLog({
    userId: req.user!.userId,
    action: 'ASSIGNMENT_RESCHEDULED',
    entityType: 'ASSIGNMENT',
    entityId: updated.id,
    newValues: { scheduledStartAt: start, scheduledEndAt: end },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, updated, 'Assignment rescheduled successfully');
});

export const getRecommendations = asyncHandler(async (req: any, res: Response) => {
  const serviceRequestId = req.query.serviceRequestId as string;
  if (!serviceRequestId) {
    throw new ApiError(400, 'serviceRequestId query parameter is required');
  }

  const scheduledStartAt = req.query.scheduledStartAt as string | undefined;
  const scheduledEndAt = req.query.scheduledEndAt as string | undefined;

  const result = await getTechnicianRecommendations(serviceRequestId, scheduledStartAt, scheduledEndAt);
  sendSuccess(res, result, 'Technician recommendations generated successfully');
});

