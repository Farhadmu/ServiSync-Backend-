import { Response, NextFunction } from 'express';
import { ApiError } from './ApiError';

export const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<any>) =>
  async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
