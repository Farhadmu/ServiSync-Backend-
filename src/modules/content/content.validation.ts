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

export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ReorderContentInput = z.infer<typeof reorderContentSchema>;
