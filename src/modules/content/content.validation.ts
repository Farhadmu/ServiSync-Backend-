import { z } from 'zod';

export const updateContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  content: z.record(z.any()).or(z.array(z.any())),
  order: z.coerce.number().int().optional(),
  isVisible: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

export const reorderContentSchema = z.object({
  sections: z.array(
    z.object({
      sectionKey: z.string().min(1),
      order: z.coerce.number().int(),
      isVisible: z.boolean().optional(),
    })
  ).min(1, 'At least one section is required'),
});

export const publishToggleSchema = z.object({
  isPublished: z.boolean(),
});

export const contactSubmissionSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().max(30).optional(),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(150),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
});

export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ReorderContentInput = z.infer<typeof reorderContentSchema>;
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
