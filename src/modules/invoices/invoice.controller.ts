import { Response, NextFunction } from 'express';
import { Prisma, InvoiceStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize } from '../../middlewares/authenticate';
import type { RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { createNotification } from '../../utils/notification';

export const generateInvoiceSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1, 'Description is required'),
        quantity: z.coerce.number().positive('Quantity must be positive'),
        unitPrice: z.coerce.number().nonnegative('Unit price cannot be negative'),
      })
    )
    .min(1, 'At least one invoice item is required'),
  taxAmount: z.coerce.number().nonnegative('Tax amount cannot be negative').default(0),
  discountAmount: z.coerce.number().nonnegative('Discount amount cannot be negative').default(0),
});

export const getInvoices = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10, status } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.InvoiceWhereInput = {};
  if (req.user!.role === 'CUSTOMER') {
    where.workOrder = { assignment: { serviceRequest: { customerId: req.user!.userId } } };
  }
  if (status) where.status = status as InvoiceStatus;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        workOrder: {
          include: {
            assignment: {
              include: {
                serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } },
                technician: { include: { user: true } },
              },
            },
            serviceReport: true,
          },
        },
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.count({ where }),
  ]);

  sendSuccess(res, invoices, 'Invoices fetched successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getInvoiceById = asyncHandler(async (req: any, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id },
    include: {
      workOrder: {
        include: {
          assignment: {
            include: {
              serviceRequest: { include: { customer: true, serviceType: { include: { category: true } } } },
              technician: { include: { user: true } },
            },
          },
          serviceReport: true,
        },
      },
      items: true,
      payments: true,
    },
  });

  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (req.user!.role === 'CUSTOMER' && invoice.workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied: You do not own this invoice');
  }

  sendSuccess(res, invoice, 'Invoice fetched successfully');
});

export const generateInvoice = asyncHandler(async (req: any, res: Response) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: req.params.workOrderId },
    include: {
      invoice: true,
      serviceReport: true,
      assignment: { include: { serviceRequest: true } },
    },
  });

  if (!workOrder) throw new ApiError(404, 'Work order not found');
  if (workOrder.status !== 'COMPLETED') {
    throw new ApiError(400, 'Work order must be completed to generate invoice');
  }
  if (!workOrder.serviceReport) {
    throw new ApiError(400, 'A service report must be submitted before generating an invoice');
  }
  if (workOrder.invoice) {
    throw new ApiError(409, 'Invoice already exists for this work order');
  }

  let subtotal = new Prisma.Decimal(0);
  const items = req.body.items.map((item: any) => {
    const qty = new Prisma.Decimal(item.quantity);
    const price = new Prisma.Decimal(item.unitPrice);
    const amount = qty.mul(price);
    subtotal = subtotal.add(amount);
    return {
      description: item.description,
      quantity: Number(qty),
      unitPrice: price,
      amount,
    };
  });

  const taxAmount = new Prisma.Decimal(req.body.taxAmount || 0);
  const discountAmount = new Prisma.Decimal(req.body.discountAmount || 0);
  const totalAmount = subtotal.add(taxAmount).sub(discountAmount);

  if (totalAmount.lessThan(0)) {
    throw new ApiError(400, 'Total amount cannot be negative');
  }

  const dueAmount = totalAmount;
  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        workOrderId: workOrder.id,
        invoiceNumber,
        status: 'PENDING',
        totalAmount,
        taxAmount,
        discountAmount,
        dueAmount,
        currency: 'BDT',
        issuedAt: new Date(),
        items: { create: items },
      },
      include: { items: true, workOrder: true },
    });

    // Advance service request state to INVOICED
    await tx.serviceRequest.update({
      where: { id: workOrder.assignment.serviceRequestId },
      data: { status: 'INVOICED' },
    });

    await createNotification(
      {
        userId: workOrder.assignment.serviceRequest.customerId,
        type: 'INVOICE_GENERATED',
        title: 'Invoice Generated',
        message: `Invoice #${invoiceNumber} for BDT ${totalAmount.toFixed(2)} has been generated.`,
        entityType: 'INVOICE',
        entityId: created.id,
      },
      tx
    );

    await createAuditLog(
      {
        userId: req.user!.userId,
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: created.id,
        newValues: { invoiceNumber, totalAmount: totalAmount.toString(), dueAmount: dueAmount.toString() },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      tx
    );

    return created;
  });

  sendCreated(res, invoice, 'Invoice generated successfully');
});
