import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  image: z.string().url().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const updateTechnicianProfileSchema = z.object({
  bio: z.string().optional(),
  experienceYears: z.coerce.number().int().positive().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  baseLatitude: z.coerce.number().optional(),
  baseLongitude: z.coerce.number().optional(),
});

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const updateSkillsSchema = z.object({
  skills: z.array(z.object({
    id: z.string(),
    proficiency: z.string().optional(),
  })).optional(),
  newSkills: z.array(z.object({
    name: z.string(),
    proficiency: z.string().optional(),
  })).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateTechnicianProfileInput = z.infer<typeof updateTechnicianProfileSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type UpdateSkillsInput = z.infer<typeof updateSkillsSchema>;
