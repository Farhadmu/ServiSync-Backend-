import { Router } from 'express';
import { submitFeedback, getFeedback, feedbackSchema } from './feedback.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';

const router = Router();

router.post(
  '/work-orders/:workOrderId/feedback',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest({ body: feedbackSchema }),
  submitFeedback
);
router.get('/work-orders/:workOrderId/feedback', authenticate, getFeedback);

export default router;
