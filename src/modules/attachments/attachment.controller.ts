import { Response, NextFunction, Request } from 'express';
import { AttachmentEntityType, AttachmentPurpose, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

export const uploadAttachment = asyncHandler(async (req: any, res: Response) => {
  const file = req.file as Express.Multer.File;
  if (!file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const { entityType, entityId, purpose = 'GENERAL' } = req.body;

  if (!entityType || !entityId) {
    throw new ApiError(400, 'entityType and entityId are required');
  }

  const validEntityTypes: AttachmentEntityType[] = ['SERVICE_REQUEST', 'WORK_ORDER', 'SERVICE_REPORT'];
  if (!validEntityTypes.includes(entityType as AttachmentEntityType)) {
    throw new ApiError(400, `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`);
  }

  const validPurposes: AttachmentPurpose[] = ['GENERAL', 'BEFORE', 'AFTER'];
  if (!validPurposes.includes(purpose as AttachmentPurpose)) {
    throw new ApiError(400, `Invalid purpose. Must be one of: ${validPurposes.join(', ')}`);
  }

  // Verify entity existence and permissions
  if (entityType === 'SERVICE_REQUEST') {
    const sr = await prisma.serviceRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { assignments: true },
    });
    if (!sr) throw new ApiError(404, 'Service request not found');

    if (req.user!.role === 'CUSTOMER' && sr.customerId !== req.user!.userId) {
      throw new ApiError(403, 'Forbidden: You do not own this service request');
    }
  } else if (entityType === 'WORK_ORDER') {
    const wo = await prisma.workOrder.findFirst({
      where: { id: entityId },
      include: { assignment: { include: { serviceRequest: true } } },
    });
    if (!wo) throw new ApiError(404, 'Work order not found');

    if (req.user!.role === 'CUSTOMER' && wo.assignment.serviceRequest.customerId !== req.user!.userId) {
      throw new ApiError(403, 'Forbidden: You do not own this work order');
    }
    if (req.user!.role === 'TECHNICIAN') {
      const tech = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
      if (!tech || wo.assignment.technicianId !== tech.id) {
        throw new ApiError(403, 'Forbidden: You are not assigned to this work order');
      }
    }
  } else if (entityType === 'SERVICE_REPORT') {
    const report = await prisma.serviceReport.findFirst({
      where: { id: entityId },
      include: { workOrder: { include: { assignment: { include: { serviceRequest: true } } } } },
    });
    if (!report) throw new ApiError(404, 'Service report not found');

    if (req.user!.role === 'TECHNICIAN') {
      const tech = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });
      if (!tech || report.technicianId !== tech.id) {
        throw new ApiError(403, 'Forbidden: You are not assigned to this service report');
      }
    }
  }

  // Upload to Cloudinary
  const folder = `${entityType.toLowerCase()}s`;
  let uploadResult: any;
  try {
    uploadResult = await uploadToCloudinary(file.buffer, file.originalname, folder);
  } catch (error: any) {
    throw new ApiError(500, `Failed to upload file to Cloudinary: ${error.message || 'Unknown error'}`);
  }

  const attachment = await prisma.attachment.create({
    data: {
      url: uploadResult.secure_url || uploadResult.url,
      publicId: uploadResult.public_id,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      width: uploadResult.width || null,
      height: uploadResult.height || null,
      entityType: entityType as AttachmentEntityType,
      entityId,
      purpose: purpose as AttachmentPurpose,
      uploadedById: req.user!.userId,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_REPORT_SUBMITTED',
    entityType: 'SERVICE_REPORT',
    entityId: attachment.id,
    newValues: { entityType, entityId, url: attachment.url, purpose },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendCreated(res, attachment, 'File uploaded and attachment created successfully');
});

export const getAttachmentsByEntity = asyncHandler(async (req: any, res: Response) => {
  const { entityType, entityId } = req.params;

  const validEntityTypes: AttachmentEntityType[] = ['SERVICE_REQUEST', 'WORK_ORDER', 'SERVICE_REPORT'];
  if (!validEntityTypes.includes(entityType as AttachmentEntityType)) {
    throw new ApiError(400, `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`);
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      entityType: entityType as AttachmentEntityType,
      entityId,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, attachments, 'Attachments fetched successfully');
});
