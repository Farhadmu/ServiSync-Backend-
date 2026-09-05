import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  image: z.string().url().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const getMe = asyncHandler(async (req: any, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      image: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
      customerProfile: true,
      technicianProfile: {
        include: {
          skills: { include: { skill: true } },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  sendSuccess(res, user, 'Profile retrieved successfully');
});

export const updateMe = [
  validateRequest({ body: updateProfileSchema }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const { name, image, phone, address } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;

    if (phone !== undefined || address !== undefined) {
      updateData.customerProfile = {
        upsert: {
          create: { phone, address },
          update: {
            ...(phone !== undefined && { phone }),
            ...(address !== undefined && { address }),
          },
        },
      };
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        customerProfile: true,
      },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      newValues: req.body,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, user, 'Profile updated successfully');
  }),
];

export const changePassword = [
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user || !user.password) {
      throw new ApiError(404, 'User not found');
    }

    const isCurrentValid = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new ApiError(400, 'Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { password: hashedPassword },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, null, 'Password changed successfully');
  }),
];
