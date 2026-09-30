import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export async function createNotification(params: {
  userId: string;
  type: Prisma.NotificationCreateInput['type'];
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.notification.create({ data: params });
}
