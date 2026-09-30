import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const submitFeedback = [
  validateRequest({ body: feedbackSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: req.params.workOrderId },
      include: { assignment: { include: { serviceRequest: true } }, invoice: true },
    });

    if (!workOrder) throw new ApiError(404, 'Work order not found');
    if (workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
      throw new ApiError(403, 'You can only give feedback for your own service requests');
    }
    if (workOrder.status !== 'COMPLETED') {
      throw new ApiError(400, 'Work order must be completed to give feedback');
    }
    if (!workOrder.invoice || workOrder.invoice.status !== 'PAID') {
      throw new ApiError(400, 'Payment must be completed before giving feedback');
    }

    const existing = await prisma.feedback.findFirst({ where: { workOrderId: workOrder.id } });
    if (existing) throw new ApiError(409, 'Feedback already submitted for this work order');

    const feedback = await prisma.feedback.create({
      data: {
        workOrderId: workOrder.id,
        customerId: req.user!.userId,
        technicianId: workOrder.assignment.technicianId,
        rating: req.body.rating,
        comment: req.body.comment,
      },
      include: { customer: { select: { id: true, name: true } }, technician: { select: { id: true, name: true } } },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'FEEDBACK_SUBMITTED',
      entityType: 'FEEDBACK',
      entityId: feedback.id,
      newValues: { rating: feedback.rating },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendCreated(res, feedback, 'Feedback submitted successfully');
  }),
];

export const getFeedback = asyncHandler(async (req: any, res: Response) => {
  const feedback = await prisma.feedback.findFirst({
    where: { workOrderId: req.params.workOrderId },
    include: { customer: { select: { id: true, name: true } }, technician: { select: { id: true, name: true } } },
  });

  if (!feedback) throw new ApiError(404, 'Feedback not found');

  sendSuccess(res, feedback, 'Feedback fetched successfully');
});
