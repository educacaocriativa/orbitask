import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'

export async function announcementRoutes(app: FastifyInstance) {

  // ── POST /announcements — Admin cria comunicado ──────────
  app.post('/announcements', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Forbidden', 403)

    const { title, content, targetType, targetId } = request.body as {
      title: string
      content: string
      targetType: 'ALL' | 'BOARD' | 'CARD' | 'USER'
      targetId?: string
    }

    if (!title || !content || !targetType) throw new AppError('title, content and targetType are required', 400)
    if (['BOARD', 'CARD', 'USER'].includes(targetType) && !targetId) {
      throw new AppError('targetId is required for this targetType', 400)
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        targetType,
        targetId: targetId ?? null,
        createdById: request.user.id,
      },
      include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
    })

    return reply.status(201).send({ announcement })
  })

  // ── GET /announcements — Admin lista todos ───────────────
  app.get('/announcements', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Forbidden', 403)

    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { replies: true, reads: true } },
      },
    })

    return reply.send({ announcements })
  })

  // ── GET /announcements/me — Comunicados do usuário logado ─
  app.get('/announcements/me', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id

    // Busca membros de boards e cards do usuário
    const userBoards = await prisma.boardMember.findMany({
      where: { userId },
      select: { boardId: true },
    })
    const boardIds = userBoards.map((b) => b.boardId)

    const userCards = await prisma.card.findMany({
      where: { boardId: { in: boardIds }, isArchived: false },
      select: { id: true },
    })
    const cardIds = userCards.map((c) => c.id)

    const announcements = await prisma.announcement.findMany({
      where: {
        OR: [
          { targetType: 'ALL' },
          { targetType: 'USER', targetId: userId },
          { targetType: 'BOARD', targetId: { in: boardIds } },
          { targetType: 'CARD', targetId: { in: cardIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        reads: { where: { userId }, select: { id: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, avatarUrl: true, role: true } } },
        },
      },
    })

    const result = announcements.map((a) => ({
      ...a,
      isRead: a.reads.length > 0,
      reads: undefined,
    }))

    return reply.send({ announcements: result })
  })

  // ── POST /announcements/:id/read — Marcar como lido ──────
  app.post('/announcements/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId: request.user.id } },
      create: { announcementId: id, userId: request.user.id },
      update: {},
    })

    return reply.send({ ok: true })
  })

  // ── POST /announcements/:id/replies — Responder ──────────
  app.post('/announcements/:id/replies', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: string }

    if (!content?.trim()) throw new AppError('content is required', 400)

    const announcement = await prisma.announcement.findUnique({ where: { id } })
    if (!announcement) throw new AppError('Announcement not found', 404)

    const reply_ = await prisma.announcementReply.create({
      data: { announcementId: id, authorId: request.user.id, content: content.trim() },
      include: { author: { select: { id: true, name: true, avatarUrl: true, role: true } } },
    })

    return reply.status(201).send({ reply: reply_ })
  })

  // ── DELETE /announcements/:id — Admin remove ─────────────
  app.delete('/announcements/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Forbidden', 403)
    const { id } = request.params as { id: string }

    await prisma.announcement.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}
