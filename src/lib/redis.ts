import Redis from 'ioredis';
import { env } from '../config/env';

const MAX_RETRIES = 10;
let errorLogged = false;
let giveUpLogged = false;

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > MAX_RETRIES) {
      if (!giveUpLogged) {
        console.error(`Redis giving up after ${MAX_RETRIES} attempts`);
        giveUpLogged = true;
      }
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => {
  if (!errorLogged) {
    console.error('Redis error:', err.message);
    errorLogged = true;
  }
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
