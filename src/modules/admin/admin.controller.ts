import { Response, NextFunction } from 'express';
import { Prisma, Role } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp, AuditAction } from '../../utils/auditLog';
import { getCached, setCache } from '../../lib/redis';

const DASHBOARD_STATS_CACHE_KEY = 'admin:dashboard-stats';
const DASHBOARD_STATS_TTL_SECONDS = 60;

const userStatusSchema = z.object({ isActive: z.boolean() });
const userRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'TECHNICIAN', 'MANAGER', 'ADMIN']) });

export const getAllUsers = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, role, search } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role: role as Role } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search as string, mode: 'insensitive' } },
            { name: { contains: search as string, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limitNum,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        image: true,
        createdAt: true,
        customerProfile: true,
        technicianProfile: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  sendSuccess(res, users, 'Users fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const updateUserStatus = [
  validateRequest({ body: userStatusSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!user) throw new ApiError(404, 'User not found');

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: req.params.id },
        data: { isActive: req.body.isActive },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      });

      // If deactivating user, revoke all active refresh tokens immediately (Phase 2 & 16)
      if (!req.body.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const action: AuditAction = req.body.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
      await createAuditLog(
        {
          userId: req.user!.userId,
          action,
          entityType: 'USER',
          entityId: user.id,
          oldValues: { isActive: user.isActive },
          newValues: { isActive: req.body.isActive },
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] as string | undefined,
        },
        tx
      );

      return u;
    });

    sendSuccess(res, updated, `User ${req.body.isActive ? 'activated' : 'deactivated'} successfully`);
  }),
];

export const updateUserRole = [
  validateRequest({ body: userRoleSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!user) throw new ApiError(404, 'User not found');

    const newRole = req.body.role as Role;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: req.params.id },
        data: { role: newRole },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      });

      // Profile consistency (Phase 16)
      if (newRole === 'TECHNICIAN') {
        await tx.technicianProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {},
        });
      } else if (newRole === 'CUSTOMER') {
        await tx.customerProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {},
        });
      }

      await createAuditLog(
        {
          userId: req.user!.userId,
          action: 'USER_ROLE_CHANGED',
          entityType: 'USER',
          entityId: user.id,
          oldValues: { role: user.role },
          newValues: { role: newRole },
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] as string | undefined,
        },
        tx
      );

      return u;
    });

    sendSuccess(res, updated, 'User role updated successfully');
  }),
];

export const getDashboardStats = asyncHandler(async (req: any, res: Response) => {
  const cached = await getCached<Record<string, unknown>>(DASHBOARD_STATS_CACHE_KEY);
  if (cached) {
    return sendSuccess(res, cached, 'Dashboard stats fetched successfully (cached)');
  }

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

  await setCache(DASHBOARD_STATS_CACHE_KEY, stats, DASHBOARD_STATS_TTL_SECONDS);

  sendSuccess(res, stats, 'Dashboard stats fetched successfully');
});

export const getAuditLogs = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, action, entityType } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limitNum,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  sendSuccess(res, logs, 'Audit logs fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});
