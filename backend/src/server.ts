import Fastify from 'fastify'
import cors        from '@fastify/cors'
import helmet      from '@fastify/helmet'
import jwt         from '@fastify/jwt'
import rateLimit   from '@fastify/rate-limit'
import multipart   from '@fastify/multipart'
import websocket   from '@fastify/websocket'

import { env }          from './config/env'
import { prisma }       from './database/prisma'
import { redis }        from './database/redis'
import { ensureBucket } from './services/MinioService'

import { authRoutes }      from './routes/auth.routes'
import { adminRoutes }     from './routes/admin.routes'
import { boardRoutes }     from './routes/board.routes'
import { cardRoutes }      from './routes/card.routes'
import { sectionRoutes }   from './routes/section.routes'
import { userRoutes }      from './routes/user.routes'
import { searchRoutes }    from './routes/search.routes'
import { notificationRoutes } from './routes/notification.routes'
import { announcementRoutes } from './routes/announcement.routes'
import { websocketRoutes } from './websocket/boardSocket'

import { AppError }          from './utils/AppError'
import { startDeadlineCron } from './jobs/notificationQueue'
import { startDriveSyncCron } from './jobs/driveSync'
import { googleDrive }       from './services/GoogleDriveService'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport: env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,
  })

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })
  await app.register(cors, { origin: [env.FRONTEND_URL], credentials: true, methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'] })
  await app.register(jwt, { secret: env.JWT_SECRET })
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW, redis })
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 5 } })
  await app.register(websocket)

  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(boardRoutes)
  await app.register(cardRoutes)
  await app.register(sectionRoutes)
  await app.register(userRoutes)
  await app.register(searchRoutes)
  await app.register(notificationRoutes)
  await app.register(announcementRoutes)
  await app.register(websocketRoutes)

  app.get('/health', async () => ({
    status: 'ok', environment: env.NODE_ENV, timestamp: new Date().toISOString(),
    services: { database: 'connected', redis: 'connected', minio: 'connected' },
  }))

  app.get('/health/drive', async () => {
    const testResult = await googleDrive.testConnection()
    return {
      configured: googleDrive.isConfigured,
      sharedDriveId: env.GOOGLE_SHARED_DRIVE_ID ?? null,
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
      hasPrivateKey: !!(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
      privateKeyStart: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.substring(0, 40) ?? null,
      connectionTest: testResult,
    }
  })

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.message, statusCode: error.statusCode })
    if (error.validation) return reply.status(400).send({ error: 'Validation error', details: error.validation, statusCode: 400 })
    if (error.statusCode === 401) return reply.status(401).send({ error: 'Unauthorized', statusCode: 401 })
    app.log.error(error)
    return reply.status(500).send({ error: env.NODE_ENV === 'production' ? 'Internal server error' : error.message, statusCode: 500 })
  })

  return app
}

async function start() {
  const app = await buildApp()
  try {
    await prisma.$connect()
    await redis.connect()
    await ensureBucket().catch((err) => {
      console.warn('⚠️  MinIO/S3 unavailable at startup — file uploads disabled:', err.message)
    })
    startDeadlineCron()
    startDriveSyncCron()
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`\n🚀 Orbitask API  →  http://localhost:${env.PORT}`)
    console.log(`   WS Board       →  ws://localhost:${env.PORT}/ws/board/:id\n`)
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

process.on('SIGTERM', async () => { await prisma.$disconnect(); await redis.quit(); process.exit(0) })

start()

