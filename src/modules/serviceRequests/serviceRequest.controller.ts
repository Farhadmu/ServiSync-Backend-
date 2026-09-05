import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
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
import { SERVICE_REQUEST_STATUS_TRANSITIONS } from '../../constants';
import { createServiceRequestSchema, reviewSchema } from './serviceRequest.validation';

const updateServiceRequestSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
});

export const createServiceRequest = [
  validateRequest({ body: createServiceRequestSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const category = await prisma.serviceCategory.findFirst({
      where: { id: req.body.categoryId, deletedAt: null, isActive: true },
    });
    if (!category) throw new ApiError(404, 'Service category not found');

    const serviceType = await prisma.serviceType.findFirst({
      where: { id: req.body.serviceTypeId, deletedAt: null, isActive: true, categoryId: req.body.categoryId },
    });
    if (!serviceType) throw new ApiError(404, 'Service type not found');

    const request = await prisma.serviceRequest.create({
      data: {
        customerId: req.user!.userId,
        serviceTypeId: req.body.serviceTypeId,
        title: req.body.title,
        description: req.body.description,
        location: req.body.location,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        preferredDateTime: req.body.preferredDateTime ? new Date(req.body.preferredDateTime) : undefined,
        status: 'PENDING',
      },
      include: { serviceType: { include: { category: true } } },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'SERVICE_REQUEST_CREATED',
      entityType: 'SERVICE_REQUEST',
      entityId: request.id,
      newValues: request,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    // Notify customer
    await createNotification({
      userId: req.user!.userId,
      type: 'STATUS_CHANGE',
      title: 'Service Request Created',
      message: `Your request "${request.title}" has been submitted successfully and is pending review.`,
      entityType: 'SERVICE_REQUEST',
      entityId: request.id,
    });

    sendCreated(res, request, 'Service request created successfully');
  }),
];

export const getServiceRequests = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10, status, categoryId, search, sortBy, sortOrder } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.ServiceRequestWhereInput = {
    deletedAt: null,
    ...(req.user!.role === 'CUSTOMER' ? { customerId: req.user!.userId } : {}),
    ...(status ? { status: status as any } : {}),
    ...(categoryId ? { serviceType: { categoryId: categoryId as string } } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ],
    } : {}),
  };

  const allowedSort = ['createdAt', 'updatedAt', 'status', 'title', 'preferredDateTime'];
  const sortField = allowedSort.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
  const orderBy: any = { [sortField]: sortDirection };

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        serviceType: { include: { category: true } },
        assignments: { include: { technician: { include: { user: { select: { id: true, name: true, email: true } } } } } },
      },
    }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendSuccess(res, requests, 'Service requests fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getServiceRequestById = asyncHandler(async (req: any, res: Response) => {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      serviceType: { include: { category: true } },
      assignments: { include: { technician: { include: { user: { select: { id: true, name: true, email: true, image: true } } } } } },
    },
  });

  if (!request) throw new ApiError(404, 'Service request not found');

  if (req.user!.role === 'CUSTOMER' && request.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Forbidden: You do not own this service request');
  }

  if (req.user!.role === 'TECHNICIAN') {
    const techProfile = await prisma.technicianProfile.findFirst({
      where: { userId: req.user!.userId },
    });
    if (!techProfile || !request.assignments.some((a) => a.technicianId === techProfile.id)) {
      throw new ApiError(403, 'Forbidden: You are not assigned to this service request');
    }
  }

  sendSuccess(res, request, 'Service request fetched successfully');
});

export const updateServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
  });

  if (!existing) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(existing.status)) {
    throw new ApiError(400, 'Cannot update request in current status');
  }

  const { categoryId, ...updateData } = req.body;
  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: updateData,
    include: { serviceType: { include: { category: true } } },
  });

  sendSuccess(res, updated, 'Service request updated successfully');
});

export const deleteServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
  });

  if (!existing) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(existing.status)) {
    throw new ApiError(400, 'Cannot delete request in current status');
  }

  await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  sendSuccess(res, null, 'Service request deleted successfully');
});

export const reviewServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { assignments: true },
  });

  if (!serviceRequest) throw new ApiError(404, 'Service request not found');
  if (!['UNDER_REVIEW', 'PENDING'].includes(serviceRequest.status)) {
    throw new ApiError(400, 'Request is not in a reviewable state');
  }

  const action = req.body.action;
  let newStatus: string;
  if (action === 'APPROVE') {
    newStatus = 'APPROVED';
  } else if (action === 'REJECT') {
    newStatus = 'REJECTED';
  } else {
    throw new ApiError(400, 'Invalid action');
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: newStatus as any,
      adminNotes: req.body.adminNotes,
      rejectionReason: req.body.rejectionReason,
    },
    include: { customer: true, serviceType: { include: { category: true } } },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_REQUEST_REVIEWED',
    entityType: 'SERVICE_REQUEST',
    entityId: updated.id,
    oldValues: { status: serviceRequest.status },
    newValues: { status: newStatus, adminNotes: req.body.adminNotes },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  await createNotification({
    userId: serviceRequest.customerId,
    type: 'STATUS_CHANGE',
    title: `Service Request ${newStatus}`,
    message: `Your service request #${updated.id.slice(-6)} has been ${newStatus.toLowerCase()}. ${req.body.adminNotes || req.body.rejectionReason || ''}`.trim(),
    entityType: 'SERVICE_REQUEST',
    entityId: updated.id,
  });

  sendSuccess(res, updated, `Service request ${newStatus.toLowerCase()} successfully`);
});

export const cancelServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
    include: { assignments: { where: { status: { not: 'CANCELLED' } } } },
  });

  if (!serviceRequest) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW', 'APPROVED'].includes(serviceRequest.status)) {
    throw new ApiError(400, 'Cannot cancel request in current status');
  }
  if (serviceRequest.assignments.length > 0) {
    throw new ApiError(400, 'Cannot cancel request with active assignment');
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_REQUEST_CANCELLED',
    entityType: 'SERVICE_REQUEST',
    entityId: updated.id,
    oldValues: { status: serviceRequest.status },
    newValues: { status: 'CANCELLED' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, updated, 'Service request cancelled successfully');
});
