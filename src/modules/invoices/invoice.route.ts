import { Router } from 'express';
import { getInvoices, getInvoiceById, generateInvoice, generateInvoiceSchema } from './invoice.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';

const router = Router();

router.get('/', authenticate, getInvoices);
router.get('/:id', authenticate, getInvoiceById);
router.post(
  '/work-orders/:workOrderId/invoice',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  validateRequest({ body: generateInvoiceSchema }),
  generateInvoice
);

export default router;
