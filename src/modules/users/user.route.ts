import { Router } from 'express';
import { getMe, updateMe, changePassword } from './user.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.patch('/me/password', authenticate, changePassword);

export default router;
