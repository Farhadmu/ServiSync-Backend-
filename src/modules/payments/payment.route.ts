import { Router } from 'express';
import { initiatePayment, handlePaymentSuccess, handlePaymentFail, handlePaymentCancel, handlePaymentWebhook, getPaymentById } from './payment.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { paymentLimiter } from '../../middlewares/rateLimiter';
import { z } from 'zod';

const router = Router();

const initiateSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
});

router.post('/initiate', paymentLimiter, authenticate, authorize('CUSTOMER'), validateRequest({ body: initiateSchema }), initiatePayment);
router.post('/success', paymentLimiter, handlePaymentSuccess);
router.post('/fail', paymentLimiter, handlePaymentFail);
router.post('/cancel', paymentLimiter, handlePaymentCancel);
router.post('/webhook', handlePaymentWebhook);
router.get('/:id', authenticate, getPaymentById);

export default router;
