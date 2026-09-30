import { Router } from 'express';
import {
  getQuotesForRequest,
  getQuoteById,
  createQuote,
  respondToQuote,
} from './quote.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { createQuoteSchema, customerDecisionSchema } from './quote.validation';

const router = Router();

router.use(authenticate);

router.get('/request/:requestId', getQuotesForRequest);
router.get('/:id', getQuoteById);
router.post(
  '/',
  authorize('MANAGER', 'ADMIN'),
  validateRequest({ body: createQuoteSchema }),
  createQuote
);
router.post(
  '/:id/respond',
  authorize('CUSTOMER'),
  validateRequest({ body: customerDecisionSchema }),
  respondToQuote
);

export default router;
