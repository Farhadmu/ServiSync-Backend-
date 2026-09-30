import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  ACCESS_TOKEN_SECRET: z.string().min(1).default('default_access_token_secret_min_32_characters_long'),
  REFRESH_TOKEN_SECRET: z.string().min(1).default('default_refresh_token_secret_min_32_characters_long'),
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['stripe', 'sslcommerz']).default('stripe'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_IS_LIVE: z.coerce.boolean().default(false),
  FRONTEND_URL: z.string().optional().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type EnvSchema = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
