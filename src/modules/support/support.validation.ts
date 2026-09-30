import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200),
  category: z.enum(['BOOKING_ISSUE', 'TECHNICIAN_ISSUE', 'BILLING_ISSUE', 'PAYMENT_ISSUE', 'OTHER']),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  serviceRequestId: z.string().optional(),
});

export const addTicketMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED']),
});
