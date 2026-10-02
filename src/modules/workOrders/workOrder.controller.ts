import { Response, NextFunction } from 'express';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { createNotification } from '../../utils/notification';
import { WORK_ORDER_STATUS_TRANSITIONS } from '../../constants';

const statusUpdateSchema = z.object({
  status: z.enum(['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes: z.string().optional(),
});

export const getWorkOrders = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Prisma.WorkOrderWhereInput = {};
  if (req.user!.role === 'TECHNICIAN') {
    let techProfile = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
    if (!techProfile) {
      techProfile = await prisma.technicianProfile.create({
        data: {
          userId: req.user!.userId,
          isAvailable: true,
          hourlyRate: 50,
          experienceYears: 1,
        },
      });
    }
    where.assignment = { technicianId: techProfile.id };
  } else if (req.user!.role === 'CUSTOMER') {
    where.assignment = { serviceRequest: { customerId: req.user!.userId } };
  }

  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      include: {
        assignment: { include: { serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } }, technician: { include: { user: true } } } },
        serviceReport: true,
        invoice: true,
        feedback: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workOrder.count({ where }),
  ]);

  sendSuccess(res, workOrders, 'Work orders fetched successfully', {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    total,
    totalPages: Math.ceil(total / parseInt(limit as string)),
  });
});

export const getWorkOrderById = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: {
      assignment: { include: { serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } }, technician: { include: { user: true } } } },
      serviceReport: true,
      invoice: true,
      feedback: true,
    },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'TECHNICIAN') {
    const techProfile = await prisma.technicianProfile.findUnique({ where: { userId: req.user!.userId } });
    if (!techProfile || workOrder.assignment.technicianId !== techProfile.id) throw new ApiError(403, 'Access denied');
  }
  if (req.user!.role === 'CUSTOMER' && workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied');
  }

  sendSuccess(res, workOrder, 'Work order fetched successfully');
});

export const updateWorkOrderStatus = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: { assignment: true },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'TECHNICIAN') {
    const techProfile = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
    if (!techProfile || workOrder.assignment.technicianId !== techProfile.id) throw new ApiError(403, 'Access denied');
  }

  const currentStatus = workOrder.status;
  const newStatus = req.body.status;
  const allowed = WORK_ORDER_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `Invalid transition from ${currentStatus} to ${newStatus}`);
  }

  const updateData: any = { status: newStatus };
  if (newStatus === 'ARRIVED') updateData.arrivedAt = new Date();
  if (newStatus === 'IN_PROGRESS') updateData.startedAt = new Date();
  if (newStatus === 'COMPLETED') updateData.completedAt = new Date();

  const updated = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: updateData,
    include: { assignment: { include: { serviceRequest: true } } },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'WORK_ORDER_STATUS_UPDATED',
    entityType: 'WORK_ORDER',
    entityId: updated.id,
    oldValues: { status: currentStatus },
    newValues: { status: newStatus },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  if (newStatus === 'COMPLETED') {
    await prisma.serviceRequest.update({
      where: { id: updated.assignment.serviceRequest.id },
      data: { status: 'COMPLETED' },
    });
  }

  // Automated notification to customer on status transition
  try {
    const customerId = updated.assignment?.serviceRequest?.customerId;
    if (customerId) {
      let notifTitle = 'Service Status Updated';
      let notifMsg = `Your service request is now ${newStatus.replace('_', ' ').toLowerCase()}.`;
      if (newStatus === 'ARRIVED') {
        notifTitle = 'Technician Arrived';
        notifMsg = 'Your assigned technician has arrived on site.';
      } else if (newStatus === 'IN_PROGRESS') {
        notifTitle = 'Work In Progress';
        notifMsg = 'Your maintenance work is actively in progress.';
      } else if (newStatus === 'COMPLETED') {
        notifTitle = 'Work Order Completed';
        notifMsg = 'The field work order has been completed by your technician.';
      }

      await createNotification({
        userId: customerId,
        type: 'STATUS_CHANGE',
        title: notifTitle,
        message: notifMsg,
        entityType: 'WORK_ORDER',
        entityId: updated.id,
      });
    }
  } catch (notifErr) {
    console.warn('Failed to send status update notification non-fatally:', notifErr);
  }

  sendSuccess(res, updated, `Work order status updated to ${newStatus}`);
});
