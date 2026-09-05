import { Response, NextFunction } from 'express';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { createNotification } from '../../utils/notification';
import { WORK_ORDER_STATUS_TRANSITIONS } from '../../constants';

export const serviceReportSchema = z.object({
  summary: z.string().min(3, 'Summary must be at least 3 characters'),
  findings: z.string().optional(),
  actionsTaken: z.string().optional(),
  beforeImages: z.array(z.string().url()).default([]),
  afterImages: z.array(z.string().url()).default([]),
});

export const updateServiceReportSchema = z.object({
  summary: z.string().min(3).optional(),
  findings: z.string().optional(),
  actionsTaken: z.string().optional(),
  beforeImages: z.array(z.string().url()).optional(),
  afterImages: z.array(z.string().url()).optional(),
});

export const getWorkOrders = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10, status } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.WorkOrderWhereInput = {};
  if (status) {
    where.status = status as WorkOrderStatus;
  }

  if (req.user!.role === 'TECHNICIAN') {
    const techProfile = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
    if (!techProfile) throw new ApiError(404, 'Technician profile not found');
    where.assignment = { technicianId: techProfile.id };
  } else if (req.user!.role === 'CUSTOMER') {
    where.assignment = { serviceRequest: { customerId: req.user!.userId } };
  }

  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        assignment: {
          include: {
            serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } },
            technician: { include: { user: true } },
          },
        },
        serviceReport: true,
        invoice: true,
        feedback: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workOrder.count({ where }),
  ]);

  sendSuccess(res, workOrders, 'Work orders fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getWorkOrderById = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: {
      assignment: {
        include: {
          serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } },
          technician: { include: { user: true } },
        },
      },
      serviceReport: true,
      invoice: true,
      feedback: true,
    },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'TECHNICIAN') {
    const technicianProfile = await prisma.technicianProfile.findFirst({
      where: { userId: req.user!.userId },
    });
    if (!technicianProfile || workOrder.assignment.technicianId !== technicianProfile.id) {
      throw new ApiError(403, 'Access denied: You are not assigned to this work order');
    }
  }

  if (req.user!.role === 'CUSTOMER' && workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied: You do not own this work order');
  }

  sendSuccess(res, workOrder, 'Work order fetched successfully');
});

export const updateWorkOrderStatus = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: { assignment: { include: { serviceRequest: true } } },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'TECHNICIAN') {
    const technicianProfile = await prisma.technicianProfile.findFirst({
      where: { userId: req.user!.userId },
    });
    if (!technicianProfile || workOrder.assignment.technicianId !== technicianProfile.id) {
      throw new ApiError(403, 'Access denied: You are not assigned to this work order');
    }
  }

  const currentStatus = workOrder.status;
  const newStatus = req.body.status as WorkOrderStatus;
  const allowed = WORK_ORDER_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `Invalid transition from ${currentStatus} to ${newStatus}`);
  }

  const updateData: Prisma.WorkOrderUpdateInput = { status: newStatus };
  if (newStatus === 'ARRIVED') updateData.arrivedAt = new Date();
  if (newStatus === 'IN_PROGRESS') updateData.startedAt = new Date();
  if (newStatus === 'COMPLETED') updateData.completedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.update({
      where: { id: req.params.id },
      data: updateData,
      include: { assignment: { include: { serviceRequest: true } } },
    });

    if (newStatus === 'COMPLETED') {
      await tx.serviceRequest.update({
        where: { id: wo.assignment.serviceRequestId },
        data: { status: 'COMPLETED' },
      });
    }

    await createNotification(
      {
        userId: wo.assignment.serviceRequest.customerId,
        type: 'STATUS_CHANGE',
        title: `Work Order ${newStatus}`,
        message: `Your work order for "${wo.assignment.serviceRequest.title}" is now ${newStatus}.`,
        entityType: 'WORK_ORDER',
        entityId: wo.id,
      },
      tx
    );

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: 'WORK_ORDER_STATUS_UPDATED',
        entityType: 'WORK_ORDER',
        entityId: wo.id,
        oldValues: { status: currentStatus },
        newValues: { status: newStatus },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return wo;
  });

  sendSuccess(res, updated, `Work order status updated to ${newStatus}`);
});

// ==========================================
// SERVICE REPORT CONTROLLERS (Phase 7)
// ==========================================

export const submitServiceReport = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: { assignment: { include: { serviceRequest: true } }, serviceReport: true },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  const techProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });

  if (!techProfile || workOrder.assignment.technicianId !== techProfile.id) {
    throw new ApiError(403, 'Forbidden: Only the assigned technician can submit a service report');
  }

  if (workOrder.serviceReport) {
    throw new ApiError(409, 'Service report already exists for this work order');
  }

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceReport.create({
      data: {
        workOrderId: workOrder.id,
        technicianId: techProfile.id,
        summary: req.body.summary,
        findings: req.body.findings,
        actionsTaken: req.body.actionsTaken,
        beforeImages: req.body.beforeImages || [],
        afterImages: req.body.afterImages || [],
      },
    });

    await createNotification(
      {
        userId: workOrder.assignment.serviceRequest.customerId,
        type: 'STATUS_CHANGE',
        title: 'Service Report Submitted',
        message: `A service report has been submitted for your work order.`,
        entityType: 'SERVICE_REPORT',
        entityId: created.id,
      },
      tx
    );

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: 'SERVICE_REPORT_SUBMITTED',
        entityType: 'SERVICE_REPORT',
        entityId: created.id,
        newValues: req.body,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return created;
  });

  sendCreated(res, report, 'Service report submitted successfully');
});

export const getServiceReport = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: { assignment: { include: { serviceRequest: true } } },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'CUSTOMER' && workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied: You do not own this work order');
  }

  if (req.user!.role === 'TECHNICIAN') {
    const techProfile = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
    if (!techProfile || workOrder.assignment.technicianId !== techProfile.id) {
      throw new ApiError(403, 'Access denied: You are not assigned to this work order');
    }
  }

  const report = await prisma.serviceReport.findUnique({
    where: { workOrderId: req.params.id },
    include: { technician: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });

  if (!report) throw new ApiError(404, 'Service report not found');

  sendSuccess(res, report, 'Service report fetched successfully');
});

export const updateServiceReport = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.id },
    include: { assignment: true, serviceReport: true },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  const techProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });

  if (!techProfile || workOrder.assignment.technicianId !== techProfile.id) {
    throw new ApiError(403, 'Forbidden: Only the assigned technician can update the service report');
  }

  if (!workOrder.serviceReport) {
    throw new ApiError(404, 'Service report not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const rep = await tx.serviceReport.update({
      where: { workOrderId: req.params.id },
      data: req.body,
    });

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: 'SERVICE_REPORT_UPDATED',
        entityType: 'SERVICE_REPORT',
        entityId: rep.id,
        newValues: req.body,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return rep;
  });

  sendSuccess(res, updated, 'Service report updated successfully');
});
