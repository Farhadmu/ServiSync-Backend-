import { Router } from 'express';
import { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory, createServiceType } from './serviceCategory.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), validateRequest({ body: createCategorySchema }), createCategory);
router.get('/', getCategories);
router.get('/:id', getCategoryById);
router.post('/:id/service-types', authenticate, authorize('ADMIN', 'MANAGER'), createServiceType);
router.patch('/:id', authenticate, authorize('ADMIN', 'MANAGER'), validateRequest({ body: updateCategorySchema }), updateCategory);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), deleteCategory);

export default router;
