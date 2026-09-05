import { Response, NextFunction } from 'express';
import { Request } from 'express';
import { Prisma, AssignmentStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize } from '../../middlewares/authenticate';
import type { RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { createNotification } from '../../utils/notification';
import { ASSIGNMENT_STATUS_TRANSITIONS } from '../../constants';

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
      include: {
        serviceType: {
          include: { requiredSkills: true },
        },
      },
    });

    if (!serviceRequest) throw new ApiError(404, 'Service request not found');
    if (serviceRequest.status !== 'APPROVED') {
      throw new ApiError(400, 'Service request is not in an assignable state (must be APPROVED)');
    }

    const technician = await prisma.technicianProfile.findFirst({
      where: { id: technicianId, user: { isActive: true, deletedAt: null } },
      include: { skills: true, user: true },
    });

    if (!technician) throw new ApiError(404, 'Technician not found or inactive');
    if (!technician.isAvailable) throw new ApiError(400, 'Technician is not available');

    // Verify technician possesses ALL required skills for the service type
    const requiredSkillIds = serviceRequest.serviceType.requiredSkills.map((s) => s.skillId);
    if (requiredSkillIds.length > 0) {
      const techSkillIds = new Set(technician.skills.map((s) => s.skillId));
      const hasAllSkills = requiredSkillIds.every((skillId) => techSkillIds.has(skillId));
      if (!hasAllSkills) {
        throw new ApiError(400, 'Technician does not have all required skills for this service type');
      }
    }

    if (scheduledStartAt && scheduledEndAt) {
      const start = new Date(scheduledStartAt);
      const end = new Date(scheduledEndAt);

      if (start >= end) throw new ApiError(400, 'Invalid schedule: start must be before end');

      const conflicting = await prisma.schedule.findFirst({
        where: {
          technicianId,
          cancelledAt: null,
          OR: [{ startAt: { lt: end }, endAt: { gt: start } }],
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

      await createNotification(
        {
          userId: technician.userId,
          type: 'ASSIGNMENT',
          title: 'New Service Assignment',
          message: `You have been assigned to service request "${serviceRequest.title}".`,
          entityType: 'ASSIGNMENT',
          entityId: created.id,
        },
        tx
      );

      await createNotification(
        {
          userId: serviceRequest.customerId,
          type: 'STATUS_CHANGE',
          title: 'Technician Assigned',
          message: `Technician ${technician.user.name} has been assigned to your service request "${serviceRequest.title}".`,
          entityType: 'SERVICE_REQUEST',
          entityId: serviceRequest.id,
        },
        tx
      );

      await createAuditLog(
        {
          userId: req.user!.userId,
          action: 'ASSIGNMENT_CREATED',
          entityType: 'ASSIGNMENT',
          entityId: created.id,
          newValues: created,
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] as string | undefined,
        },
        tx
      );

      return created;
    });

    sendCreated(res, assignment, 'Technician assigned successfully');
  }),
];

export const respondToAssignment = asyncHandler(async (req: any, res: Response) => {
  const technicianProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });
  if (!technicianProfile) throw new ApiError(404, 'Technician profile not found');

  const assignment = await prisma.assignment.findFirst({
    where: { id: req.params.id, status: 'SCHEDULED', technicianId: technicianProfile.id },
    include: { serviceRequest: true, schedule: true },
  });

  if (!assignment) throw new ApiError(404, 'Assignment not found or not in scheduled state');

  const action = req.body.action;
  if (!['ACCEPT', 'REJECT'].includes(action)) {
    throw new ApiError(400, 'Invalid action');
  }

  const allowed = ASSIGNMENT_STATUS_TRANSITIONS['SCHEDULED'] || [];
  if (!allowed.includes(action)) {
    throw new ApiError(400, `Cannot transition from SCHEDULED to ${action}`);
  }

  const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.assignment.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
        ...(action === 'REJECT'
          ? { rejectedAt: new Date(), rejectedReason: req.body.reason }
          : { acceptedAt: new Date() }),
      },
      include: { serviceRequest: true, technician: { include: { user: true } } },
    });

    if (action === 'ACCEPT') {
      // Create work order if it doesn't already exist
      await tx.workOrder.upsert({
        where: { assignmentId: assignment.id },
        update: {},
        create: {
          assignmentId: assignment.id,
          status: 'SCHEDULED',
        },
      });

      // Advance service request to SCHEDULED
      await tx.serviceRequest.update({
        where: { id: assignment.serviceRequestId },
        data: { status: 'SCHEDULED' },
      });

      await createNotification(
        {
          userId: assignment.managerId,
          type: 'ASSIGNMENT',
          title: 'Assignment Accepted',
          message: `Technician accepted assignment for request #${assignment.serviceRequestId.slice(-6)}. Work order created.`,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
        },
        tx
      );

      await createNotification(
        {
          userId: assignment.serviceRequest.customerId,
          type: 'STATUS_CHANGE',
          title: 'Service Request Scheduled',
          message: `Your service request "${assignment.serviceRequest.title}" has been confirmed and scheduled.`,
          entityType: 'SERVICE_REQUEST',
          entityId: assignment.serviceRequestId,
        },
        tx
      );
    } else {
      await createNotification(
        {
          userId: assignment.managerId,
          type: 'ASSIGNMENT',
          title: 'Assignment Rejected',
          message: `Technician rejected assignment for request #${assignment.serviceRequestId.slice(-6)}. Reason: ${req.body.reason || 'None provided'}`,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
        },
        tx
      );
    }

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: action === 'ACCEPT' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED',
        entityType: 'ASSIGNMENT',
        entityId: updated.id,
        newValues: { status: newStatus },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return updated;
  });

  sendSuccess(res, result, `Assignment ${newStatus.toLowerCase()} successfully`);
});

export const rescheduleAssignment = asyncHandler(async (req: any, res: Response) => {
  const assignment = await prisma.assignment.findFirst({
    where: { id: req.params.id, status: 'SCHEDULED' },
    include: { schedule: true, serviceRequest: true },
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

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.assignment.update({
      where: { id: req.params.id },
      data: {
        technicianNotes: assignment.technicianNotes,
      },
      include: { serviceRequest: true, technician: { include: { user: true } } },
    });

    if (assignment.schedule) {
      await tx.schedule.update({
        where: { id: assignment.schedule.id },
        data: { startAt: start, endAt: end },
      });
    } else {
      await tx.schedule.create({
        data: {
          assignmentId: assignment.id,
          technicianId: assignment.technicianId,
          startAt: start,
          endAt: end,
        },
      });
    }

    const technician = await tx.technicianProfile.findUnique({
      where: { id: assignment.technicianId },
    });

    if (technician) {
      await createNotification(
        {
          userId: technician.userId,
          type: 'SCHEDULE_CHANGE',
          title: 'Schedule Updated',
          message: `Your schedule for request #${assignment.serviceRequestId.slice(-6)} has been rescheduled.`,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
        },
        tx
      );
    }

    await createNotification(
      {
        userId: assignment.serviceRequest.customerId,
        type: 'SCHEDULE_CHANGE',
        title: 'Service Rescheduled',
        message: `Your service request "${assignment.serviceRequest.title}" has been rescheduled to ${start.toLocaleString()}.`,
        entityType: 'SERVICE_REQUEST',
        entityId: assignment.serviceRequestId,
      },
      tx
    );

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: 'ASSIGNMENT_RESCHEDULED',
        entityType: 'ASSIGNMENT',
        entityId: updated.id,
        newValues: { scheduledStartAt: start, scheduledEndAt: end },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return updated;
  });

  sendSuccess(res, result, 'Assignment rescheduled successfully');
});
