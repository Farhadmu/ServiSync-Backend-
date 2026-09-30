import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { getServiceReport, upsertServiceReport } from './serviceReport.controller';

const router = Router();

router.get('/work-orders/:workOrderId', authenticate, getServiceReport);
router.put('/work-orders/:workOrderId', authenticate, authorize('TECHNICIAN'), upsertServiceReport);

export default router;
