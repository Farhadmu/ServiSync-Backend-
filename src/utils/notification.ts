import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(
  params: CreateNotificationParams,
  dbClient?: Prisma.TransactionClient | typeof prisma
) {
  const client = dbClient || prisma;
  try {
    return await (client as typeof prisma).notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}
