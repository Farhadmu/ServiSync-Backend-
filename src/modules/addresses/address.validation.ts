import { z } from 'zod';

export const createAddressSchema = z.object({
  label: z.enum(['HOME', 'OFFICE', 'OTHER']).default('HOME'),
  address: z.string().min(3, 'Address must be at least 3 characters long'),
  city: z.string().optional(),
  area: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = z.object({
  label: z.enum(['HOME', 'OFFICE', 'OTHER']).optional(),
  address: z.string().min(3, 'Address must be at least 3 characters long').optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isDefault: z.boolean().optional(),
});
