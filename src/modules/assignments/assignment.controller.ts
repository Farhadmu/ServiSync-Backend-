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

const assignSchema = z.object({
  serviceRequestId: z.string().min(1, 'Service request ID is required'),
  technicianId: z.string().min(1, 'Technician ID is required'),
  scheduledStartAt: z.string().datetime().optional(),
  scheduledEndAt: z.string().datetime().optional(),
  technicianNotes: z.string().optional(),
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

    if (scheduledStartAt && scheduledEndAt) {
      const start = new Date(scheduledStartAt);
      const end = new Date(scheduledEndAt);

      if (start >= end) throw new ApiError(400, 'Invalid schedule: start must be before end');

      const conflicting = await prisma.schedule.findFirst({
        where: {
          technicianId,
          cancelledAt: null,
          OR: [
            { startAt: { lt: end }, endAt: { gt: start } },
          ],
        },
      });

      if (conflicting) {
        throw new ApiError(409, 'Technician is already booked for the selected time slot');
      }
    }

    const assignment = await prisma.$transaction(async (tx) => {
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

      if (scheduledStartAt && scheduledEndAt) {
        await tx.schedule.create({
          data: {
            assignmentId: created.id,
            technicianId,
            startAt: new Date(scheduledStartAt),
            endAt: new Date(scheduledEndAt),
          },
        });
      }

      await createAuditLog({
        userId: req.user!.userId,
        action: 'ASSIGNMENT_CREATED',
        entityType: 'ASSIGNMENT',
        entityId: created.id,
        newValues: created,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      return created;
    });

    sendCreated(res, assignment, 'Technician assigned successfully');
  }),
];

export const respondToAssignment = asyncHandler(async (req: any, res: Response) => {
  const technicianProfile = await prisma.technicianProfile.findUnique({
    where: { userId: req.user!.userId },
  });

  if (!technicianProfile) throw new ApiError(404, 'Technician profile not found');

  const assignment = await prisma.assignment.findFirst({
    where: { id: req.params.id, status: 'SCHEDULED', technicianId: technicianProfile.id },
    include: { serviceRequest: true },
  });

  if (!assignment) throw new ApiError(404, 'Assignment not found or not scheduled');

  const action = req.body.action;
  if (!['ACCEPT', 'REJECT'].includes(action)) {
    throw new ApiError(400, 'Invalid action');
  }

  const allowed = ASSIGNMENT_STATUS_TRANSITIONS['SCHEDULED'] || [];
  if (!allowed.includes(action)) {
    throw new ApiError(400, `Cannot transition from SCHEDULED to ${action}`);
  }

  const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.assignment.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
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

  await createNotification({
    userId: updated.serviceRequest.customerId,
    type: 'STATUS_CHANGE',
    title: 'Assignment updated',
    message: `Your assignment was ${newStatus.toLowerCase()}.`,
    entityType: 'ASSIGNMENT',
    entityId: updated.id,
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: action === 'ACCEPT' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED',
    entityType: 'ASSIGNMENT',
    entityId: updated.id,
    newValues: { status: newStatus },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

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
