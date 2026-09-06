import { Router } from 'express';
import { getMyProfile, updateMyProfile, updateMyAvailability, updateMySkills, getMyJobs, getMySchedule } from './technicianProfile.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

router.use(authenticate, authorize('TECHNICIAN'));

const updateProfileSchema = z.object({
  bio: z.string().optional(),
  experienceYears: z.coerce.number().int().positive().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  baseLatitude: z.coerce.number().optional(),
  baseLongitude: z.coerce.number().optional(),
});

const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const updateSkillsSchema = z.object({
  skills: z.array(z.object({ id: z.string(), proficiency: z.string().optional() })).optional(),
  newSkills: z.array(z.object({ name: z.string(), proficiency: z.string().optional() })).optional(),
});

router.patch('/me/profile', validateRequest({ body: updateProfileSchema }), updateMyProfile);
router.patch('/me/availability', validateRequest({ body: updateAvailabilitySchema }), updateMyAvailability);
router.patch('/me/skills', validateRequest({ body: updateSkillsSchema }), updateMySkills);
router.get('/me/jobs', getMyJobs);
router.get('/me/schedule', getMySchedule);

export default router;
