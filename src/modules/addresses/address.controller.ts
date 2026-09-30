import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

export const getMyAddresses = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;

  const addresses = await prisma.customerAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  sendSuccess(res, addresses, 'Addresses retrieved successfully');
});

export const createAddress = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { label, address, city, area, latitude, longitude, isDefault } = req.body;

  const addressCount = await prisma.customerAddress.count({ where: { userId } });
  const shouldBeDefault = isDefault || addressCount === 0;

  const newAddress = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.customerAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.create({
      data: {
        userId,
        label: label || 'HOME',
        address,
        city,
        area,
        latitude,
        longitude,
        isDefault: shouldBeDefault,
      },
    });
  });

  await createAuditLog({
    userId,
    action: 'CREATE_ADDRESS',
    entityType: 'CUSTOMER_ADDRESS' as any,
    entityId: newAddress.id,
    newValues: newAddress,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendCreated(res, newAddress, 'Address created successfully');
});

export const updateAddress = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { label, address, city, area, latitude, longitude, isDefault } = req.body;

  const existing = await prisma.customerAddress.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== userId) {
    throw new ApiError(404, 'Address not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.customerAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.update({
      where: { id },
      data: {
        ...(label && { label }),
        ...(address && { address }),
        ...(city !== undefined && { city }),
        ...(area !== undefined && { area }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });
  });

  await createAuditLog({
    userId,
    action: 'UPDATE_ADDRESS',
    entityType: 'CUSTOMER_ADDRESS' as any,
    entityId: id,
    oldValues: existing,
    newValues: updated,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendSuccess(res, updated, 'Address updated successfully');
});

export const setDefaultAddress = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const existing = await prisma.customerAddress.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== userId) {
    throw new ApiError(404, 'Address not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.customerAddress.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return tx.customerAddress.update({
      where: { id },
      data: { isDefault: true },
    });
  });

  sendSuccess(res, updated, 'Default address set successfully');
});

export const deleteAddress = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const existing = await prisma.customerAddress.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== userId) {
    throw new ApiError(404, 'Address not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.delete({ where: { id } });

    if (existing.isDefault) {
      const another = await tx.customerAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (another) {
        await tx.customerAddress.update({
          where: { id: another.id },
          data: { isDefault: true },
        });
      }
    }
  });

  await createAuditLog({
    userId,
    action: 'DELETE_ADDRESS',
    entityType: 'CUSTOMER_ADDRESS' as any,
    entityId: id,
    oldValues: existing,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendSuccess(res, null, 'Address deleted successfully');
});
