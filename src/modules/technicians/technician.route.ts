import { Router } from 'express';
import { getTechnicians, getTechnicianById } from './technician.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();

router.get('/', authenticate, getTechnicians);
router.get('/:id', authenticate, getTechnicianById);

export default router;
