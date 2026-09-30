import { Router } from 'express';
import { submitFeedback, getFeedback } from './feedback.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

router.post('/work-orders/:workOrderId/feedback', authenticate, authorize('CUSTOMER'), validateRequest({ body: feedbackSchema }), submitFeedback);
router.get('/work-orders/:workOrderId/feedback', authenticate, getFeedback);
router.post('/work-orders/:workOrderId', authenticate, authorize('CUSTOMER'), validateRequest({ body: feedbackSchema }), submitFeedback);
router.get('/work-orders/:workOrderId', authenticate, getFeedback);

export default router;
