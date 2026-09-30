import Redis from 'ioredis';
import { env } from '../config/env';

const redisUrl = env.REDIS_URL && env.REDIS_URL.trim() !== '' ? env.REDIS_URL : 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 2000);
  },
});

redis.connect().catch((err) => {
  // Gracefully handle redis unavailability
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => {
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
