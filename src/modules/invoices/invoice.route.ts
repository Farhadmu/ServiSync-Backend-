import { Router } from 'express';
import { getInvoices, getInvoiceById, generateInvoice } from './invoice.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const generateInvoiceSchema = z.object({
  items: z.array(z.object({
    description: z.string(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })),
  taxAmount: z.coerce.number().nonnegative().default(0),
  discountAmount: z.coerce.number().nonnegative().default(0),
});

router.get('/', authenticate, getInvoices);
router.get('/:id', authenticate, getInvoiceById);
router.post('/work-orders/:workOrderId/invoice', authenticate, authorize('MANAGER', 'ADMIN'), validateRequest({ body: generateInvoiceSchema }), generateInvoice);

export default router;
