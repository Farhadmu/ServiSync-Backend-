import { Request, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { z } from 'zod';

export function validateRequest(schema: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) {
  return (req: Request, _res: any, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body) as any;
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query) as any;
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params) as any;
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(new ApiError(422, 'Validation failed', errors));
      } else {
        next(new ApiError(400, 'Invalid request', []));
      }
    }
  };
}
