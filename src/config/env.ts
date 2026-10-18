import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/servisync_test'),
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
  // ── AI Provider Configurations (Free-Tier Prioritized) ───────────────────
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  CEREBRAS_API_KEY: z.string().optional(),
  CEREBRAS_MODEL: z.string().default('llama3.1-8b'),
  HUGGINGFACE_API_KEY: z.string().optional(),
  HUGGINGFACE_MODEL: z.string().default('meta-llama/Llama-3.2-3B-Instruct'),
  HUGGINGFACE_PROVIDER: z.string().optional(),
  AI_PRIMARY_PROVIDER: z.enum(['gemini', 'groq', 'cerebras', 'huggingface']).default('gemini'),
  AI_FALLBACK_ENABLED: z.coerce.boolean().default(true),
  AI_ALLOW_PAID_USAGE: z.coerce.boolean().default(false),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().default(800),
});

export type EnvSchema = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
