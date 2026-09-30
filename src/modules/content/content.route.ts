import { Router } from 'express';
import {
  getPublishedContent,
  getAllAdminContent,
  getAdminSectionContent,
  updateSectionContent,
  togglePublishSection,
  reorderSections,
  resetDefaultContent,
} from './content.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  updateContentSchema,
  reorderContentSchema,
  publishToggleSchema,
} from './content.validation';

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────
router.get('/published', getPublishedContent);

// ── Admin-Only CMS Routes ────────────────────────────────────────────────
router.get('/admin', authenticate, authorize('ADMIN'), getAllAdminContent);
router.get('/admin/:sectionKey', authenticate, authorize('ADMIN'), getAdminSectionContent);
router.put(
  '/admin/:sectionKey',
  authenticate,
  authorize('ADMIN'),
  validateRequest({ body: updateContentSchema }),
  updateSectionContent
);
router.patch(
  '/admin/:sectionKey/publish',
  authenticate,
  authorize('ADMIN'),
  validateRequest({ body: publishToggleSchema }),
  togglePublishSection
);
router.post(
  '/admin/reorder',
  authenticate,
  authorize('ADMIN'),
  validateRequest({ body: reorderContentSchema }),
  reorderSections
);
router.post('/admin/reset', authenticate, authorize('ADMIN'), resetDefaultContent);

export default router;
