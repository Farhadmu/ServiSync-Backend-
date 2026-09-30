import { Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export const errorHandler = (err: any, _req: any, res: Response, _next: any) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong';
  const errors = err.errors || [];

  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    console.error('Internal server error:', err);
  } else {
    console.error('Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
