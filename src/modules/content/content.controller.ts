import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { ApiError } from '../../utils/ApiError';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { DEFAULT_WEBSITE_SECTIONS } from './defaultContent';

/**
 * Public: Get all published & visible sections ordered for homepage display
 */
export const getPublishedContent = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const sections = await prisma.websiteContent.findMany({
      where: {
        isPublished: true,
        isVisible: true,
      },
      orderBy: {
        order: 'asc',
      },
    });

    if (sections && sections.length > 0) {
      // Return map of sectionKey -> section as well as ordered array
      const sectionMap: Record<string, any> = {};
      sections.forEach((s) => {
        sectionMap[s.sectionKey] = s;
      });

      return sendSuccess(res, { sections, sectionMap }, 'Published content retrieved successfully');
    }
  } catch (error) {
    console.warn('[CMS] Database content read fallback to default templates:', error);
  }

  // Graceful fallback to default templates if database table is empty or unmigrated
  const fallbackSections = DEFAULT_WEBSITE_SECTIONS.filter((s) => s.isPublished && s.isVisible);
  const fallbackMap: Record<string, any> = {};
  fallbackSections.forEach((s) => {
    fallbackMap[s.sectionKey] = s;
  });

  return sendSuccess(
    res,
    { sections: fallbackSections, sectionMap: fallbackMap },
    'Default published content retrieved'
  );
});

/**
 * Admin: Get all sections (including drafts and hidden) for CMS management
 */
export const getAllAdminContent = asyncHandler(async (_req: any, res: Response) => {
  try {
    let sections = await prisma.websiteContent.findMany({
      orderBy: { order: 'asc' },
    });

    // If database is empty, seed defaults into DB
    if (!sections || sections.length === 0) {
      for (const def of DEFAULT_WEBSITE_SECTIONS) {
        await prisma.websiteContent.upsert({
          where: { sectionKey: def.sectionKey },
          update: {},
          create: {
            sectionKey: def.sectionKey,
            title: def.title,
            subtitle: def.subtitle,
            order: def.order,
            isVisible: def.isVisible,
            isPublished: def.isPublished,
            content: def.content,
          },
        });
      }
      sections = await prisma.websiteContent.findMany({
        orderBy: { order: 'asc' },
      });
    }

    return sendSuccess(res, sections, 'All CMS sections retrieved');
  } catch (error: any) {
    // If table doesn't exist yet, return defaults
    return sendSuccess(res, DEFAULT_WEBSITE_SECTIONS, 'Default CMS sections retrieved');
  }
});

/**
 * Admin: Get single section content
 */
export const getAdminSectionContent = asyncHandler(async (req: any, res: Response) => {
  const { sectionKey } = req.params;
  const section = await prisma.websiteContent.findUnique({
    where: { sectionKey },
  });

  if (!section) {
    const def = DEFAULT_WEBSITE_SECTIONS.find((s) => s.sectionKey === sectionKey);
    if (def) return sendSuccess(res, def, 'Default section content retrieved');
    throw new ApiError(404, `Section '${sectionKey}' not found`);
  }

  return sendSuccess(res, section, `Section '${sectionKey}' retrieved`);
});

/**
 * Admin: Update section content
 */
export const updateSectionContent = asyncHandler(async (req: any, res: Response) => {
  const { sectionKey } = req.params;
  const { title, subtitle, content, order, isVisible, isPublished } = req.body;

  const existing = await prisma.websiteContent.findUnique({ where: { sectionKey } });

  const updated = await prisma.websiteContent.upsert({
    where: { sectionKey },
    update: {
      ...(title !== undefined && { title }),
      ...(subtitle !== undefined && { subtitle }),
      ...(content !== undefined && { content }),
      ...(order !== undefined && { order }),
      ...(isVisible !== undefined && { isVisible }),
      ...(isPublished !== undefined && { isPublished }),
      updatedBy: req.user?.userId,
    },
    create: {
      sectionKey,
      title: title || '',
      subtitle: subtitle || '',
      content: content || {},
      order: order ?? 0,
      isVisible: isVisible ?? true,
      isPublished: isPublished ?? false,
      updatedBy: req.user?.userId,
    },
  });

  await createAuditLog({
    userId: req.user?.userId,
    action: 'WEBSITE_CONTENT_UPDATED',
    entityType: 'WEBSITE_CONTENT' as any,
    entityId: updated.id,
    oldValues: existing ? (existing as any) : undefined,
    newValues: updated as any,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  return sendSuccess(res, updated, `Section '${sectionKey}' updated successfully`);
});

/**
 * Admin: Toggle publish status
 */
export const togglePublishSection = asyncHandler(async (req: any, res: Response) => {
  const { sectionKey } = req.params;
  const { isPublished } = req.body;

  const section = await prisma.websiteContent.findUnique({ where: { sectionKey } });
  if (!section) {
    throw new ApiError(404, `Section '${sectionKey}' not found`);
  }

  const updated = await prisma.websiteContent.update({
    where: { sectionKey },
    data: {
      isPublished: isPublished !== undefined ? isPublished : !section.isPublished,
      updatedBy: req.user?.userId,
    },
  });

  await createAuditLog({
    userId: req.user?.userId,
    action: updated.isPublished ? 'WEBSITE_CONTENT_PUBLISHED' : 'WEBSITE_CONTENT_UNPUBLISHED',
    entityType: 'WEBSITE_CONTENT' as any,
    entityId: updated.id,
    newValues: { isPublished: updated.isPublished },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  return sendSuccess(
    res,
    updated,
    `Section '${sectionKey}' ${updated.isPublished ? 'published' : 'moved to draft'}`
  );
});

/**
 * Admin: Reorder sections in bulk
 */
export const reorderSections = asyncHandler(async (req: any, res: Response) => {
  const { sections } = req.body; // array of { sectionKey, order, isVisible }

  const updates = await Promise.all(
    sections.map((s: { sectionKey: string; order: number; isVisible?: boolean }) =>
      prisma.websiteContent.upsert({
        where: { sectionKey: s.sectionKey },
        update: {
          order: s.order,
          ...(s.isVisible !== undefined && { isVisible: s.isVisible }),
          updatedBy: req.user?.userId,
        },
        create: {
          sectionKey: s.sectionKey,
          order: s.order,
          isVisible: s.isVisible ?? true,
          isPublished: true,
          content: {},
          updatedBy: req.user?.userId,
        },
      })
    )
  );

  await createAuditLog({
    userId: req.user?.userId,
    action: 'WEBSITE_CONTENT_REORDERED',
    entityType: 'WEBSITE_CONTENT' as any,
    entityId: 'bulk',
    newValues: sections,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  return sendSuccess(res, updates, 'Sections reordered successfully');
});

/**
 * Admin: Reset to default templates
 */
export const resetDefaultContent = asyncHandler(async (req: any, res: Response) => {
  for (const def of DEFAULT_WEBSITE_SECTIONS) {
    await prisma.websiteContent.upsert({
      where: { sectionKey: def.sectionKey },
      update: {
        title: def.title,
        subtitle: def.subtitle,
        order: def.order,
        isVisible: def.isVisible,
        isPublished: def.isPublished,
        content: def.content,
        updatedBy: req.user?.userId,
      },
      create: {
        sectionKey: def.sectionKey,
        title: def.title,
        subtitle: def.subtitle,
        order: def.order,
        isVisible: def.isVisible,
        isPublished: def.isPublished,
        content: def.content,
        updatedBy: req.user?.userId,
      },
    });
  }

  const sections = await prisma.websiteContent.findMany({
    orderBy: { order: 'asc' },
  });

  return sendSuccess(res, sections, 'Website content reset to default templates');
});
