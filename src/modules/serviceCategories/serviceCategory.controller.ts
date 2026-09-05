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

const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const createCategory = [
  validateRequest({ body: createCategorySchema }),
  asyncHandler(async (req: any, res: Response) => {
    const category = await prisma.serviceCategory.create({
      data: req.body,
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'SERVICE_CATEGORY_CREATED',
      entityType: 'SERVICE_CATEGORY',
      entityId: category.id,
      newValues: category,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendCreated(res, category, 'Service category created successfully');
  }),
];

export const getCategories = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Prisma.ServiceCategoryWhereInput = {
    deletedAt: null,
    ...(search ? { name: { contains: search as string, mode: 'insensitive' } } : {}),
  };

  const [categories, total] = await Promise.all([
    prisma.serviceCategory.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      orderBy: { name: 'asc' },
    }),
    prisma.serviceCategory.count({ where }),
  ]);

  sendSuccess(res, categories, 'Service categories fetched successfully', {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    total,
    totalPages: Math.ceil(total / parseInt(limit as string)),
  });
});

export const getCategoryById = asyncHandler(async (req: any, res: Response) => {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { serviceTypes: { where: { deletedAt: null, isActive: true } } },
  });

  if (!category) throw new ApiError(404, 'Service category not found');

  sendSuccess(res, category, 'Service category fetched successfully');
});

export const updateCategory = [
  validateRequest({ body: updateCategorySchema }),
  asyncHandler(async (req: any, res: Response) => {
    const category = await prisma.serviceCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'SERVICE_CATEGORY_UPDATED',
      entityType: 'SERVICE_CATEGORY',
      entityId: category.id,
      newValues: req.body,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, category, 'Service category updated successfully');
  }),
];

export const deleteCategory = asyncHandler(async (req: any, res: Response) => {
  const category = await prisma.serviceCategory.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_CATEGORY_DELETED',
    entityType: 'SERVICE_CATEGORY',
    entityId: category.id,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, null, 'Service category deleted successfully');
});
