import { z } from 'zod';

export const createServiceRequestSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  serviceTypeId: z.string().min(1, 'Service type is required'),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
});

export const updateServiceRequestSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
});

export const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const serviceRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequestInput = z.infer<typeof updateServiceRequestSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ServiceRequestQueryInput = z.infer<typeof serviceRequestQuerySchema>;
