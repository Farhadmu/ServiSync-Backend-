import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

export const getQuotesForRequest = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { requestId } = req.params;

  const sr = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, customerId: true },
  });

  if (!sr) {
    throw new ApiError(404, 'Service request not found');
  }

  if (role === 'CUSTOMER' && sr.customerId !== userId) {
    throw new ApiError(403, 'Permission denied');
  }

  const quotes = await prisma.serviceQuote.findMany({
    where: { serviceRequestId: requestId },
    orderBy: { version: 'desc' },
  });

  sendSuccess(res, quotes, 'Quotes retrieved successfully');
});

export const getQuoteById = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { id } = req.params;

  const quote = await prisma.serviceQuote.findUnique({
    where: { id },
    include: {
      serviceRequest: {
        select: {
          id: true,
          title: true,
          customerId: true,
          status: true,
          serviceType: { select: { name: true } },
        },
      },
    },
  });

  if (!quote) {
    throw new ApiError(404, 'Quote not found');
  }

  if (role === 'CUSTOMER' && quote.serviceRequest.customerId !== userId) {
    throw new ApiError(403, 'Permission denied');
  }

  sendSuccess(res, quote, 'Quote retrieved successfully');
});

export const createQuote = asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.user;
  const {
    serviceRequestId,
    subtotal,
    taxAmount = 0,
    discountAmount = 0,
    totalAmount,
    currency = 'BDT',
    notes,
    expiresAt,
    items,
  } = req.body;

  const sr = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
  });

  if (!sr) {
    throw new ApiError(404, 'Service request not found');
  }

  // Find latest version if any
  const latestQuote = await prisma.serviceQuote.findFirst({
    where: { serviceRequestId },
    orderBy: { version: 'desc' },
  });

  const nextVersion = latestQuote ? latestQuote.version + 1 : 1;
  const count = await prisma.serviceQuote.count();
  const quoteNumber = `QUO-${(count + 1).toString().padStart(5, '0')}`;

  const quote = await prisma.serviceQuote.create({
    data: {
      serviceRequestId,
      quoteNumber,
      version: nextVersion,
      status: 'PENDING',
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      currency,
      notes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      items: items || [],
    },
  });

  // Notify customer
  await prisma.notification.create({
    data: {
      userId: sr.customerId,
      type: 'SYSTEM',
      title: 'New Service Quote Received',
      message: `A quote (${quoteNumber}) for ${sr.title} has been provided for your review.`,
      entityType: 'SERVICE_QUOTE',
      entityId: quote.id,
    },
  });

  await createAuditLog({
    userId,
    action: 'CREATE_QUOTE',
    entityType: 'SERVICE_QUOTE' as any,
    entityId: quote.id,
    newValues: quote,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendCreated(res, quote, 'Quote created successfully');
});

export const respondToQuote = asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.user;
  const { id } = req.params;
  const { action, comment } = req.body;

  const quote = await prisma.serviceQuote.findUnique({
    where: { id },
    include: {
      serviceRequest: true,
    },
  });

  if (!quote) {
    throw new ApiError(404, 'Quote not found');
  }

  if (quote.serviceRequest.customerId !== userId) {
    throw new ApiError(403, 'You do not have permission to respond to this quote');
  }

  if (quote.status !== 'PENDING') {
    throw new ApiError(400, `Quote has already been decided (${quote.status})`);
  }

  if (quote.expiresAt && new Date() > new Date(quote.expiresAt)) {
    await prisma.serviceQuote.update({
      where: { id },
      data: { status: 'EXPIRED' },
    });
    throw new ApiError(400, 'This quote has expired. Please contact support or request a new quote.');
  }

  let newStatus: 'ACCEPTED' | 'CHANGE_REQUESTED' | 'REJECTED' = 'ACCEPTED';
  if (action === 'REQUEST_CHANGE') newStatus = 'CHANGE_REQUESTED';
  if (action === 'REJECT') newStatus = 'REJECTED';

  const updatedQuote = await prisma.serviceQuote.update({
    where: { id },
    data: {
      status: newStatus,
      customerComment: comment || null,
      customerResponseAt: new Date(),
    },
  });

  await createAuditLog({
    userId,
    action: `QUOTE_${newStatus}`,
    entityType: 'SERVICE_QUOTE' as any,
    entityId: id,
    oldValues: { status: quote.status },
    newValues: { status: newStatus, customerComment: comment },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendSuccess(res, updatedQuote, `Quote successfully ${newStatus.toLowerCase().replace('_', ' ')}`);
});
