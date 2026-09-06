import { Router } from 'express';
import { assignTechnician, respondToAssignment, rescheduleAssignment } from './assignment.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const assignSchema = z.object({
  serviceRequestId: z.string().min(1, 'Service request ID is required'),
  technicianId: z.string().min(1, 'Technician ID is required'),
  scheduledStartAt: z.string().datetime().optional(),
  scheduledEndAt: z.string().datetime().optional(),
  technicianNotes: z.string().optional(),
});

const respondSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  reason: z.string().optional(),
});

const rescheduleSchema = z.object({
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
});

router.post('/', authenticate, authorize('MANAGER', 'ADMIN'), validateRequest({ body: assignSchema }), assignTechnician);
router.patch('/:id/respond', authenticate, authorize('TECHNICIAN'), validateRequest({ body: respondSchema }), respondToAssignment);
router.patch('/:id/reschedule', authenticate, authorize('MANAGER', 'ADMIN'), validateRequest({ body: rescheduleSchema }), rescheduleAssignment);

export default router;
