import { Router } from 'express';
import { getNotifications, markNotificationAsRead } from './notification.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();

router.get('/', authenticate, getNotifications);
router.patch('/:id/read', authenticate, markNotificationAsRead);

export default router;
