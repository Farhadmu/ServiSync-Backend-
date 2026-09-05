import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate, RequestUser } from '../../middlewares/authenticate';

export const getNotifications = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.NotificationWhereInput = { userId: req.user!.userId };
  if (unreadOnly === 'true') where.isRead = false;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.userId, isRead: false } });

  sendSuccess(res, { notifications, unreadCount }, 'Notifications fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const markNotificationAsRead = asyncHandler(async (req: any, res: Response) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });

  if (!notification) throw new ApiError(404, 'Notification not found');

  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true },
  });

  sendSuccess(res, updated, 'Notification marked as read');
});

export const markAllNotificationsAsRead = asyncHandler(async (req: any, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });

  sendSuccess(res, null, 'All notifications marked as read');
});
