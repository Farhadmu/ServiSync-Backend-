import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from './ApiError';

export type AuditAction =
  | 'USER_REGISTERED'
  | 'USER_LOGGED_IN'
  | 'USER_LOGGED_OUT'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'USER_ROLE_CHANGED'
  | 'SERVICE_REQUEST_CREATED'
  | 'SERVICE_REQUEST_REVIEWED'
  | 'SERVICE_REQUEST_CANCELLED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_ACCEPTED'
  | 'ASSIGNMENT_REJECTED'
  | 'ASSIGNMENT_RESCHEDULED'
  | 'ASSIGNMENT_REASSIGNED'
  | 'WORK_ORDER_STATUS_UPDATED'
  | 'SERVICE_REPORT_SUBMITTED'
  | 'SERVICE_REPORT_UPDATED'
  | 'INVOICE_GENERATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'FEEDBACK_SUBMITTED'
  | 'SERVICE_CATEGORY_CREATED'
  | 'SERVICE_CATEGORY_UPDATED'
  | 'SERVICE_CATEGORY_DELETED';

export async function createAuditLog(
  params: {
    userId?: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    oldValues?: Prisma.InputJsonValue;
    newValues?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  },
  dbClient?: Prisma.TransactionClient | typeof prisma
) {
  const client = dbClient || prisma;
  try {
    await (client as typeof prisma).auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType as any,
        entityId: params.entityId,
        oldValues: params.oldValues,
        newValues: params.newValues,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

export function getClientIp(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    undefined
  );
}
