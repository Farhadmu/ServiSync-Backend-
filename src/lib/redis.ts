import Redis from 'ioredis';
import { env } from '../config/env';

const configuredUrl = (env.REDIS_URL || '').trim();
const hasValidRedis = configuredUrl.startsWith('redis://') || configuredUrl.startsWith('rediss://');
const redisUrl = hasValidRedis ? configuredUrl : 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 2) return null;
    return Math.min(times * 100, 1000);
  },
});

if (hasValidRedis || env.NODE_ENV === 'development') {
  redis.connect().catch(() => {
    // Gracefully handle redis unavailability
  });
}

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', () => {
  // Silent fallback so Redis unavailability does not crash HTTP server
});

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 60): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // ignore cache errors
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // ignore
  }
}

export default redis;
