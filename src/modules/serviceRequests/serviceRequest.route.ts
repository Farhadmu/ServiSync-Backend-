import { Router } from 'express';
import {
  createServiceRequest,
  getServiceRequests,
  getServiceRequestById,
  updateServiceRequest,
  deleteServiceRequest,
  reviewServiceRequest,
  cancelServiceRequest,
  uploadServiceRequestAttachment,
  getAvailableSlots,
  getServiceTimeline,
  rescheduleServiceRequest,
  rebookServiceRequest,
} from './serviceRequest.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { singleUpload } from '../../middlewares/upload';
import { uploadLimiter } from '../../middlewares/rateLimiter';

const router = Router();

const createServiceRequestSchema = z.object({
  categoryId: z.string().optional(),
  serviceTypeId: z.string().min(1, 'Service type is required'),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().optional(),
});

const updateServiceRequestSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
});

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

// Available slots lookup (MUST come before /:id)
router.get('/available-slots', authenticate, getAvailableSlots);

router.post('/', authenticate, authorize('CUSTOMER'), validateRequest({ body: createServiceRequestSchema }), createServiceRequest);
router.get('/', authenticate, getServiceRequests);
router.get('/:id', authenticate, getServiceRequestById);
router.get('/:id/timeline', authenticate, getServiceTimeline);
router.patch('/:id', authenticate, authorize('CUSTOMER'), validateRequest({ body: updateServiceRequestSchema }), updateServiceRequest);
router.delete('/:id', authenticate, authorize('CUSTOMER'), deleteServiceRequest);
router.post('/:id/review', authenticate, authorize('MANAGER', 'ADMIN'), validateRequest({ body: reviewSchema }), reviewServiceRequest);
router.post('/:id/cancel', authenticate, cancelServiceRequest);
router.post('/:id/reschedule', authenticate, authorize('CUSTOMER'), rescheduleServiceRequest);
router.post('/:id/rebook', authenticate, authorize('CUSTOMER'), rebookServiceRequest);
router.post('/:id/attachments', authenticate, authorize('CUSTOMER'), uploadLimiter, singleUpload('file'), uploadServiceRequestAttachment);

export default router;

