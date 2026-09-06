import { Router } from 'express';
import {
  getWorkOrders,
  getWorkOrderById,
  updateWorkOrderStatus,
  submitServiceReport,
  getServiceReport,
  updateServiceReport,
  serviceReportSchema,
  updateServiceReportSchema,
} from './workOrder.controller';
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
router.patch(
  '/:id/status',
  authenticate,
  authorize('TECHNICIAN', 'MANAGER', 'ADMIN'),
  validateRequest({ body: statusUpdateSchema }),
  updateWorkOrderStatus
);

// Service report routes (Phase 7)
router.post(
  '/:id/report',
  authenticate,
  authorize('TECHNICIAN'),
  validateRequest({ body: serviceReportSchema }),
  submitServiceReport
);
router.get('/:id/report', authenticate, getServiceReport);
router.patch(
  '/:id/report',
  authenticate,
  authorize('TECHNICIAN'),
  validateRequest({ body: updateServiceReportSchema }),
  updateServiceReport
);

export default router;
