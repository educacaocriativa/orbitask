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
import { crmRoutes }          from './routes/crm.routes'
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
  await app.register(crmRoutes)
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

async function ensureCrmTables() {
  const stage = `'LEAD','PRIMEIRO_CONTATO','NIVEL_CONSCIENCIA_1','NIVEL_CONSCIENCIA_2','NIVEL_CONSCIENCIA_3','FINALIZADO','FECHADO'`
  const tables = [
    [`crm_products`, `CREATE TABLE IF NOT EXISTS crm_products (
      id VARCHAR(191) NOT NULL PRIMARY KEY, name VARCHAR(191) NOT NULL,
      description TEXT, price VARCHAR(191), video_url TEXT, features JSON,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_leads`, `CREATE TABLE IF NOT EXISTS crm_leads (
      id VARCHAR(191) NOT NULL PRIMARY KEY, company_name VARCHAR(191) NOT NULL,
      company_phone VARCHAR(191), segment VARCHAR(191), stage ENUM(${stage}) NOT NULL DEFAULT 'LEAD',
      position INT NOT NULL DEFAULT 0, apify_source_url VARCHAR(191), apify_raw_data JSON,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX crm_leads_stage_position_idx (stage, position)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_leads.segment (migration)`, `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS segment VARCHAR(191) NULL`],
    [`users.crm_access (migration)`, `ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_access TINYINT(1) NOT NULL DEFAULT 0`],
    [`crm_leads.company_website (migration)`, `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS company_website TEXT NULL`],
    [`boards.is_archived (migration)`, `ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) NOT NULL DEFAULT 0`],
    [`columns.is_archived (migration)`, `ALTER TABLE columns ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) NOT NULL DEFAULT 0`],
    [`cards.is_archived (migration)`, `ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) NOT NULL DEFAULT 0`],
    [`crm_messages`, `CREATE TABLE IF NOT EXISTS crm_messages (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      lead_id VARCHAR(191) NOT NULL,
      direction VARCHAR(16) NOT NULL,
      content LONGTEXT NOT NULL,
      sent_by VARCHAR(16),
      sender_name VARCHAR(191),
      sent_by_user_id VARCHAR(191),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX crm_messages_lead_idx (lead_id, created_at),
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_decision_makers`, `CREATE TABLE IF NOT EXISTS crm_decision_makers (
      id VARCHAR(191) NOT NULL PRIMARY KEY, lead_id VARCHAR(191) NOT NULL,
      name VARCHAR(191) NOT NULL, role VARCHAR(191), email VARCHAR(191),
      phone_company VARCHAR(191), phone_personal VARCHAR(191), linkedin VARCHAR(191),
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_stage_history`, `CREATE TABLE IF NOT EXISTS crm_stage_history (
      id VARCHAR(191) NOT NULL PRIMARY KEY, lead_id VARCHAR(191) NOT NULL,
      from_stage ENUM(${stage}), to_stage ENUM(${stage}) NOT NULL,
      notes TEXT, is_ai_move TINYINT(1) NOT NULL DEFAULT 0, ai_conversation JSON,
      moved_by_id VARCHAR(191),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (moved_by_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_lead_products`, `CREATE TABLE IF NOT EXISTS crm_lead_products (
      id VARCHAR(191) NOT NULL PRIMARY KEY, lead_id VARCHAR(191) NOT NULL,
      product_id VARCHAR(191) NOT NULL, suggested_by_ai TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY crm_lead_products_unique (lead_id, product_id),
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES crm_products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
    [`crm_skills`, `CREATE TABLE IF NOT EXISTS crm_skills (
      id VARCHAR(191) NOT NULL PRIMARY KEY, name VARCHAR(191) NOT NULL,
      description TEXT, content LONGTEXT NOT NULL, trigger VARCHAR(191),
      is_active TINYINT(1) NOT NULL DEFAULT 1, \`order\` INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  ]
  for (const [name, sql] of tables) {
    try {
      await prisma.$executeRawUnsafe(sql)
      console.log(`  ✅ ${name}`)
    } catch (err: any) {
      console.warn(`  ⚠️  ${name}: ${err?.message ?? err}`)
    }
  }
}

async function start() {
  const app = await buildApp()
  try {
    await prisma.$connect()

    console.log('🔄 Verificando tabelas CRM...')
    await ensureCrmTables()

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

