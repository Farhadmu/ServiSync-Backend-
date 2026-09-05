import { Response, NextFunction } from 'express';
import { ApiError } from './ApiError';

export const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<any>) =>
  async (req: any, res: any, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

export const sendSuccess = <T>(
  res: Response,
  data?: T,
  message: string = 'Operation successful',
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number }
) => {
  const payload: any = { success: true, message, data };
  if (meta) payload.meta = meta;
  return res.status(200).json(payload);
};

export const sendCreated = <T>(res: Response, data: T, message: string = 'Resource created successfully') => {
  return res.status(201).json({ success: true, message, data });
};
