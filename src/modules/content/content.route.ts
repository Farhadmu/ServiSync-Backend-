import { Router } from 'express';
import {
  getPublishedContent,
  getAllAdminContent,
  getAdminSectionContent,
  updateSectionContent,
  togglePublishSection,
  reorderSections,
  resetDefaultContent,
  submitContactInquiry,
} from './content.controller';
import { authenticate, authorize, optionalAuthenticate } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  updateContentSchema,
  reorderContentSchema,
  publishToggleSchema,
  contactSubmissionSchema,
} from './content.validation';

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────
router.get('/published', getPublishedContent);
router.post(
  '/contact',
  optionalAuthenticate,
  validateRequest({ body: contactSubmissionSchema }),
  submitContactInquiry
);

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
