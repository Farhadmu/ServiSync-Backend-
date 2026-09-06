import { Router } from 'express';
import { getAllUsers, updateUserStatus, updateUserRole, getDashboardStats, getAuditLogs } from './admin.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const userStatusSchema = z.object({ isActive: z.boolean() });
const userRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'TECHNICIAN', 'MANAGER', 'ADMIN']) });

router.get('/users', authenticate, authorize('ADMIN'), getAllUsers);
router.patch('/users/:id/status', authenticate, authorize('ADMIN'), validateRequest({ body: userStatusSchema }), updateUserStatus);
router.patch('/users/:id/role', authenticate, authorize('ADMIN'), validateRequest({ body: userRoleSchema }), updateUserRole);
router.get('/dashboard-stats', authenticate, authorize('ADMIN', 'MANAGER'), getDashboardStats);
router.get('/audit-logs', authenticate, authorize('ADMIN'), getAuditLogs);

export default router;
