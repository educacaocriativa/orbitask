import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'

export async function notificationRoutes(app: FastifyInstance) {
  // ── GET /notifications ────────────────────────────────────
  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const { limit = '20', page = '1' } = request.query as Record<string, string>
    const take = Math.min(Number(limit), 50)
    const skip = (Number(page) - 1) * take

    const [notifications, unread] = await prisma.$transaction([
      prisma.notificationQueue.findMany({
        where:   { recipientId: request.user.id },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          card: { select: { id: true, title: true } },
        },
      }),
      prisma.notificationQueue.count({
        where: {
          recipientId: request.user.id,
          status:      'PENDING',
        },
      }),
    ])

    return reply.send({ notifications, unread })
  })

  // ── PATCH /notifications/read-all ─────────────────────────
  app.patch('/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    await prisma.notificationQueue.updateMany({
      where: { recipientId: request.user.id, status: 'PENDING' },
      data:  { status: 'SENT', sentAt: new Date() },
    })
    return reply.send({ ok: true })
  })

  // ── PATCH /notifications/:id/read ─────────────────────────
  app.patch('/notifications/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.notificationQueue.updateMany({
      where: { id, recipientId: request.user.id },
      data:  { status: 'SENT', sentAt: new Date() },
    })
    return reply.send({ ok: true })
  })
}

