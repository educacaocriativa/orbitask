import IORedis from 'ioredis'
import { env } from '../config/env'

const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
}

// Main Redis client (sessions, cache)
export const redis = new IORedis(redisConfig)

// BullMQ needs a separate connection
export const bullRedis = new IORedis(redisConfig)

redis.on('connect', () => console.log('✅ Redis connected'))
redis.on('error', (err) => console.error('❌ Redis error:', err))

export default redis

