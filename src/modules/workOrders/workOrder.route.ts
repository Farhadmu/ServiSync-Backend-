import { Router } from 'express';
import { getWorkOrders, getWorkOrderById, updateWorkOrderStatus } from './workOrder.controller';
import { authenticate } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { authorize } from '../../middlewares/authorize';
import { z } from 'zod';

const router = Router();

const statusUpdateSchema = z.object({
  status: z.enum(['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes: z.string().optional(),
});

router.get('/', authenticate, getWorkOrders);
router.get('/:id', authenticate, getWorkOrderById);
router.patch('/:id/status', authenticate, authorize('TECHNICIAN', 'MANAGER'), validateRequest({ body: statusUpdateSchema }), updateWorkOrderStatus);

export default router;
