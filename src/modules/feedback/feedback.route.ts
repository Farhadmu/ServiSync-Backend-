import { Router } from 'express';
import { submitFeedback, getFeedback, getMyReviews, getPublicReviews } from './feedback.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

// Public customer reviews for homepage Trust & Quality Center
router.get('/public', getPublicReviews);

router.get('/my-reviews', authenticate, authorize('CUSTOMER'), getMyReviews);

router.post('/work-orders/:workOrderId/feedback', authenticate, authorize('CUSTOMER'), validateRequest({ body: feedbackSchema }), submitFeedback);
router.get('/work-orders/:workOrderId/feedback', authenticate, getFeedback);
router.post('/work-orders/:workOrderId', authenticate, authorize('CUSTOMER'), validateRequest({ body: feedbackSchema }), submitFeedback);
router.get('/work-orders/:workOrderId', authenticate, getFeedback);

export default router;
