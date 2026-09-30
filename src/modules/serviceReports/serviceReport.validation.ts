import { z } from 'zod';

export const serviceReportParamsSchema = z.object({
  workOrderId: z.string().min(1),
});

export const serviceReportSchema = z.object({
  summary: z.string().min(1).optional(),
  findings: z.string().optional(),
  actionsTaken: z.string().optional(),
  beforeImages: z.array(z.string().url()).max(10).optional(),
  afterImages: z.array(z.string().url()).max(10).optional(),
}).refine((data) => data.summary || data.findings || data.actionsTaken, {
  message: 'At least one report field is required',
});
