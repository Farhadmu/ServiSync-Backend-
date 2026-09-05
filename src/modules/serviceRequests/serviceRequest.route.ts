import { Router } from 'express';
import { createServiceRequest, getServiceRequests, getServiceRequestById, updateServiceRequest, deleteServiceRequest, reviewServiceRequest, cancelServiceRequest } from './serviceRequest.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const createServiceRequestSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  serviceTypeId: z.string().min(1, 'Service type is required'),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
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

router.post('/', authenticate, authorize('CUSTOMER'), validateRequest({ body: createServiceRequestSchema }), createServiceRequest);
router.get('/', authenticate, getServiceRequests);
router.get('/:id', authenticate, getServiceRequestById);
router.patch('/:id', authenticate, authorize('CUSTOMER'), validateRequest({ body: updateServiceRequestSchema }), updateServiceRequest);
router.delete('/:id', authenticate, authorize('CUSTOMER'), deleteServiceRequest);
router.post('/:id/review', authenticate, authorize('MANAGER', 'ADMIN'), validateRequest({ body: reviewSchema }), reviewServiceRequest);
router.post('/:id/cancel', authenticate, cancelServiceRequest);

export default router;
