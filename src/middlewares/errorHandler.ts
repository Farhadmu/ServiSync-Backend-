import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { ZodError } from 'zod';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let errors = err.errors || [];

  // Zod Validation Errors
  if (err instanceof ZodError || err.name === 'ZodError') {
    statusCode = 422;
    message = 'Validation failed';
    errors = err.errors?.map((e: any) => ({
      path: e.path?.join('.') || 'body',
      message: e.message,
    })) || [];
  }
  // Prisma Known Request Errors
  else if (err.code) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = `Unique constraint failed on field(s): ${Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target || 'unknown'}`;
        break;
      case 'P2025':
        statusCode = 404;
        message = (typeof err.meta?.cause === 'string' ? err.meta.cause : null) || 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = `Foreign key constraint failed on field: ${err.meta?.field_name || 'unknown'}`;
        break;
      case 'P2014':
        statusCode = 400;
        message = 'The change you are trying to make would violate the required relation.';
        break;
      default:
        if (err.name?.startsWith('Prisma')) {
          statusCode = 400;
          message = 'Database operation failed';
        }
    }
  }
  // JWT Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
  }
  // Stripe Errors
  else if (err.type?.startsWith('Stripe') || err.rawType || err.name === 'StripeError') {
    statusCode = 400;
    message = err.message || 'Payment processing error';
  }
  // JSON body parsing errors
  else if (err instanceof SyntaxError && 'body' in err && (err as any).status === 400) {
    statusCode = 400;
    message = 'Malformed JSON request body';
  }

  // Hide internal server error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    console.error('Internal Server Error:', err);
    message = 'Internal server error';
  } else if (statusCode === 500) {
    console.error('Server Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

