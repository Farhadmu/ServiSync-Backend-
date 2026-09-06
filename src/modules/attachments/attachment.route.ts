import { Router } from 'express';
import { uploadAttachment, getAttachmentsByEntity } from './attachment.controller';
import { authenticate } from '../../middlewares/authenticate';
import { uploadLimiter } from '../../middlewares/rateLimiter';
import { singleUpload } from '../../middlewares/upload';

const router = Router();

router.post('/upload', authenticate, uploadLimiter, singleUpload('file'), uploadAttachment);
router.get('/:entityType/:entityId', authenticate, getAttachmentsByEntity);

export default router;
