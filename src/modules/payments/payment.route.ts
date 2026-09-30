import { Router } from 'express';
import { initiatePayment, handlePaymentSuccess, handlePaymentFail, handlePaymentCancel, handlePaymentWebhook, getPaymentById } from './payment.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { authLimiter } from '../../middlewares/rateLimiter';

const router = Router();

const initiateSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
});

router.post('/initiate', authLimiter, authenticate, authorize('CUSTOMER'), validateRequest({ body: initiateSchema }), initiatePayment);
router.post('/success', handlePaymentSuccess);
router.post('/fail', handlePaymentFail);
router.post('/cancel', handlePaymentCancel);
router.post('/webhook', handlePaymentWebhook);
router.get('/:id', authenticate, getPaymentById);

export default router;
