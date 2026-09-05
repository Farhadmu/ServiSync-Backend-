import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Prisma ORM 7 requires a driver adapter for all databases — the client no
// longer talks to Postgres directly. The connection string that used to live
// in schema.prisma's datasource block now lives in prisma.config.ts (for the
// CLI/migrations) and here (for the running app).
const isLocalDb = env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});

const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error', 'warn'],
});

export { prisma };
export default prisma;
