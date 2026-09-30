import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

const userStatusSchema = z.object({ isActive: z.boolean() });
const userRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'TECHNICIAN', 'MANAGER', 'ADMIN']) });

export const getAllUsers = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, role, search } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role: role as any } : {}),
    ...(search ? {
      OR: [
        { email: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } },
      ],
    } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      select: { id: true, email: true, name: true, role: true, isActive: true, image: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  sendSuccess(res, users, 'Users fetched successfully', {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    total,
    totalPages: Math.ceil(total / parseInt(limit as string)),
  });
});

export const updateUserStatus = [
  validateRequest({ body: userStatusSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new ApiError(404, 'User not found');

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: req.body.isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true, image: true, createdAt: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: user.id,
      newValues: { isActive: req.body.isActive },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, updated, 'User status updated successfully');
  }),
];

export const updateUserRole = [
  validateRequest({ body: userRoleSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new ApiError(404, 'User not found');

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: req.body.role },
      select: { id: true, email: true, name: true, role: true, isActive: true, image: true, createdAt: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_ROLE_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      oldValues: { role: user.role },
      newValues: { role: req.body.role },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, updated, 'User role updated successfully');
  }),
];

export const getDashboardStats = asyncHandler(async (req: any, res: Response) => {
  const [
    totalCustomers,
    totalTechnicians,
    totalServiceRequests,
    pendingRequests,
    activeJobs,
    completedJobs,
    totalInvoices,
    paidInvoices,
    totalRevenue,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
    prisma.user.count({ where: { role: 'TECHNICIAN', deletedAt: null } }),
    prisma.serviceRequest.count({ where: { deletedAt: null } }),
    prisma.serviceRequest.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.workOrder.count({ where: { status: { in: ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS'] } } }),
    prisma.workOrder.count({ where: { status: 'COMPLETED' } }),
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: 'PAID' } }),
    prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
  ]);

  const stats = {
    totalCustomers,
    totalTechnicians,
    totalServiceRequests,
    pendingRequests,
    activeJobs,
    completedJobs,
    totalInvoices,
    paidInvoices,
    totalRevenue: totalRevenue._sum.amount || 0,
  };

  sendSuccess(res, stats, 'Dashboard stats fetched successfully');
});

export const getAuditLogs = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, action, entityType } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: any = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  sendSuccess(res, logs, 'Audit logs fetched successfully', {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    total,
    totalPages: Math.ceil(total / parseInt(limit as string)),
  });
});
