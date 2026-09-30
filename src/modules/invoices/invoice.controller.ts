import { Response, NextFunction } from 'express';
import { Prisma, InvoiceStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

const generateInvoiceSchema = z.object({
  items: z.array(z.object({
    description: z.string(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })),
  taxAmount: z.coerce.number().nonnegative().default(0),
  discountAmount: z.coerce.number().nonnegative().default(0),
});

export const getInvoices = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Prisma.InvoiceWhereInput = {};
  if (req.user!.role === 'CUSTOMER') {
    where.workOrder = { assignment: { serviceRequest: { customerId: req.user!.userId } } };
  }
  if (status) where.status = status as InvoiceStatus;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      include: {
        workOrder: { include: { assignment: { include: { serviceRequest: { include: { customer: true } } } } } },
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.count({ where }),
  ]);

  sendSuccess(res, invoices, 'Invoices fetched successfully', {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    total,
    totalPages: Math.ceil(total / parseInt(limit as string)),
  });
});

export const getInvoiceById = asyncHandler(async (req: any, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id },
    include: {
      workOrder: { include: { assignment: { include: { serviceRequest: { include: { customer: true } } } } } },
      items: true,
      payments: true,
    },
  });

  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (req.user!.role === 'CUSTOMER' && invoice.workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied');
  }

  sendSuccess(res, invoice, 'Invoice fetched successfully');
});

export const generateInvoice = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.workOrderId },
    include: { invoice: true, assignment: { include: { serviceRequest: true } } },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');
  if (workOrder.status !== 'COMPLETED') throw new ApiError(400, 'Work order must be completed to generate invoice');
  if (workOrder.invoice) throw new ApiError(409, 'Invoice already exists for this work order');

  if (req.body.items.length === 0) throw new ApiError(422, 'At least one invoice item is required');

  const items = req.body.items.map((item: any) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    return {
    description: item.description,
    quantity: quantity.toNumber(),
    unitPrice,
    amount: quantity.mul(unitPrice),
    };
  });

  const subtotal = items.reduce((sum: Prisma.Decimal, item: any) => sum.add(item.amount), new Prisma.Decimal(0));
  const taxAmount = new Prisma.Decimal(req.body.taxAmount || 0);
  const discountAmount = new Prisma.Decimal(req.body.discountAmount || 0);
  const totalAmount = subtotal.add(taxAmount).sub(discountAmount);
  if (totalAmount.lessThan(0)) throw new ApiError(422, 'Invoice total cannot be negative');

  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
      workOrderId: workOrder.id,
      invoiceNumber,
      status: 'PENDING',
      totalAmount,
      taxAmount,
      discountAmount,
      dueAmount: totalAmount,
      currency: 'BDT',
      items: { create: items },
      },
      include: { items: true, workOrder: true },
    });
    await tx.serviceRequest.update({
      where: { id: workOrder.assignment.serviceRequest.id },
      data: { status: 'INVOICED' },
    });
    return created;
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'INVOICE_GENERATED',
    entityType: 'INVOICE',
    entityId: invoice.id,
    newValues: { invoiceNumber, totalAmount },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendCreated(res, invoice, 'Invoice generated successfully');
});
