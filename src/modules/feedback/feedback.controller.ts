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
import { createNotification } from '../../utils/notification';

export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  comment: z.string().optional(),
});

export const submitFeedback = [
  validateRequest({ body: feedbackSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: req.params.workOrderId },
      include: {
        assignment: { include: { serviceRequest: true, technician: true } },
        invoice: true,
      },
    });

    if (!workOrder) throw new ApiError(404, 'Work order not found');
    if (workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
      throw new ApiError(403, 'Forbidden: You can only give feedback for your own service requests');
    }
    if (workOrder.status !== 'COMPLETED') {
      throw new ApiError(400, 'Work order must be completed before giving feedback');
    }
    if (!workOrder.invoice || workOrder.invoice.status !== 'PAID') {
      throw new ApiError(400, 'Invoice must be paid before submitting feedback');
    }

    const existing = await prisma.feedback.findFirst({ where: { workOrderId: workOrder.id } });
    if (existing) throw new ApiError(409, 'Feedback has already been submitted for this work order');

    const technicianUserId = workOrder.assignment.technician.userId;

    const feedback = await prisma.$transaction(async (tx) => {
      const created = await tx.feedback.create({
        data: {
          workOrderId: workOrder.id,
          customerId: req.user!.userId,
          technicianId: technicianUserId,
          rating: req.body.rating,
          comment: req.body.comment,
        },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          technician: { select: { id: true, name: true, email: true } },
        },
      });

      // Final closure of the service request
      await tx.serviceRequest.update({
        where: { id: workOrder.assignment.serviceRequestId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await createNotification(
        {
          userId: technicianUserId,
          type: 'FEEDBACK_REQUEST',
          title: 'New Customer Feedback',
          message: `You received a ${req.body.rating}-star review for your completed work.`,
          entityType: 'FEEDBACK',
          entityId: created.id,
        },
        tx
      );

      await createAuditLog(
        {
          userId: req.user!.userId,
          action: 'FEEDBACK_SUBMITTED',
          entityType: 'FEEDBACK',
          entityId: created.id,
          newValues: { rating: created.rating, comment: created.comment },
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] as string | undefined,
        },
        tx
      );

      return created;
    });

    sendCreated(res, feedback, 'Feedback submitted successfully');
  }),
];

export const getFeedback = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.workOrderId },
    include: { assignment: { include: { serviceRequest: true } } },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');

  if (req.user!.role === 'CUSTOMER' && workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied: You do not own this work order');
  }

  if (req.user!.role === 'TECHNICIAN') {
    const tech = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
    if (!tech || workOrder.assignment.technicianId !== tech.id) {
      throw new ApiError(403, 'Access denied: You are not assigned to this work order');
    }
  }

  const feedback = await prisma.feedback.findFirst({
    where: { workOrderId: req.params.workOrderId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      technician: { select: { id: true, name: true, email: true } },
    },
  });

  if (!feedback) throw new ApiError(404, 'Feedback not found');

  sendSuccess(res, feedback, 'Feedback fetched successfully');
});
