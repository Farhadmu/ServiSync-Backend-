import { Router } from 'express';
import { getMyProfile, updateMyProfile, updateMyAvailability, updateMySkills, getMyJobs, getMySchedule } from './technicianProfile.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';

const router = Router();

router.use(authenticate, authorize('TECHNICIAN'));

router.get('/me/profile', getMyProfile);
router.get('/me', getMyProfile);
router.patch('/me/profile', updateMyProfile);
router.patch('/me/availability', updateMyAvailability);
router.patch('/me/skills', updateMySkills);
router.get('/me/jobs', getMyJobs);
router.get('/me/schedule', getMySchedule);

export default router;
