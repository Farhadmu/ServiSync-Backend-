import { z } from 'zod';

export const quoteItemSchema = z.object({
  description: z.string().min(1, 'Item description is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  amount: z.number().nonnegative('Amount cannot be negative'),
});

export const createQuoteSchema = z.object({
  serviceRequestId: z.string().min(1, 'Service Request ID is required'),
  subtotal: z.number().nonnegative('Subtotal cannot be negative'),
  taxAmount: z.number().nonnegative().optional().default(0),
  discountAmount: z.number().nonnegative().optional().default(0),
  totalAmount: z.number().positive('Total amount must be greater than 0'),
  currency: z.string().default('BDT'),
  notes: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  items: z.array(quoteItemSchema).optional(),
});

export const customerDecisionSchema = z.object({
  action: z.enum(['ACCEPT', 'REQUEST_CHANGE', 'REJECT']),
  comment: z.string().max(500, 'Comment must not exceed 500 characters').optional(),
});
