import { Router } from 'express';
import { getTechnicians, getTechnicianById } from './technician.controller';
import { getMyProfile, updateMyProfile, updateMyAvailability, updateMySkills, getMyJobs, getMySchedule } from './technicianProfile.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';

const router = Router();

const techOnly = [authenticate, authorize('TECHNICIAN')];

// Technician private /me endpoints (MUST come before /:id)
router.get('/me/profile', techOnly, getMyProfile);
router.get('/me', techOnly, getMyProfile);
router.patch('/me/profile', techOnly, updateMyProfile);
router.patch('/me/availability', techOnly, updateMyAvailability);
router.patch('/me/skills', techOnly, updateMySkills);
router.get('/me/jobs', techOnly, getMyJobs);
router.get('/me/schedule', techOnly, getMySchedule);

// General technician endpoints (accessible by Managers, Admins, etc.)
router.get('/', authenticate, getTechnicians);
router.get('/:id', authenticate, getTechnicianById);

export default router;
