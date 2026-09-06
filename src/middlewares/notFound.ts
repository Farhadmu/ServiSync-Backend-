import { Request, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export const notFound = (req: Request, _res: any, next: NextFunction) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
};
