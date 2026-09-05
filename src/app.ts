import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { env } from './config/env';
import { configureCors } from './config/cors';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { apiLimiter } from './middlewares/rateLimiter';
import authRoutes from './modules/auth/auth.route';
import userRoutes from './modules/users/user.route';
import serviceCategoryRoutes from './modules/serviceCategories/serviceCategory.route';
import serviceRequestRoutes from './modules/serviceRequests/serviceRequest.route';
import technicianRoutes from './modules/technicians/technician.route';
import technicianProfileRoutes from './modules/technicians/technicianProfile.route';
import assignmentRoutes from './modules/assignments/assignment.route';
import workOrderRoutes from './modules/workOrders/workOrder.route';
import invoiceRoutes from './modules/invoices/invoice.route';
import paymentRoutes from './modules/payments/payment.route';
import feedbackRoutes from './modules/feedback/feedback.route';
import notificationRoutes from './modules/notifications/notification.route';
import adminRoutes from './modules/admin/admin.route';
import attachmentRoutes from './modules/attachments/attachment.route';

const app: Express = express();

app.use(helmet());
app.use(configureCors(env));

// Stripe webhook signature verification needs the raw, unparsed request body.
// This MUST be registered before the global express.json() below, and only
// for this exact path — every other route still gets normal JSON parsing.
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(apiLimiter);

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ServiSync API is healthy', data: { status: 'UP' } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/service-categories', serviceCategoryRoutes);
app.use('/api/v1/service-requests', serviceRequestRoutes);
app.use('/api/v1/technicians', technicianRoutes);
app.use('/api/v1/technicians', technicianProfileRoutes);
app.use('/api/v1/assignments', assignmentRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/attachments', attachmentRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
