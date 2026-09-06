import { Router } from 'express';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from './notification.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();

router.get('/', authenticate, getNotifications);
router.patch('/read-all', authenticate, markAllNotificationsAsRead);
router.patch('/:id/read', authenticate, markNotificationAsRead);

export default router;
