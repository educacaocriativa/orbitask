import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'

export async function searchRoutes(app: FastifyInstance) {
  // ── GET /search?q=&type=cards|boards|all ─────────────────
  app.get('/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { q = '', type = 'all', boardId } = request.query as {
      q?: string; type?: 'cards' | 'boards' | 'all'; boardId?: string
    }

    if (q.trim().length < 2) {
      return reply.send({ cards: [], boards: [], users: [] })
    }

    const term = q.trim()

    const [cards, boards] = await Promise.all([
      (type === 'all' || type === 'cards')
        ? prisma.card.findMany({
            where: {
              isArchived: false,
              ...(boardId ? { boardId } : {}),
              OR: [
                { title:       { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
                { tags:        { has: term.toLowerCase() } },
              ],
            },
            include: {
              currentColumn: { select: { id: true, title: true, color: true } },
              board:         { select: { id: true, title: true } },
              creator:       { select: { id: true, name: true } },
            },
            take: 15,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),

      (type === 'all' || type === 'boards')
        ? prisma.board.findMany({
            where: {
              isArchived: false,
              OR: [
                { title:       { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
              ],
            },
            include: {
              owner:  { select: { id: true, name: true } },
              _count: { select: { columns: true, cards: true } },
            },
            take: 8,
          })
        : Promise.resolve([]),
    ])

    return reply.send({ cards, boards })
  })

  // ── GET /boards/:id/cards/filter ──────────────────────────
  app.get('/boards/:id/cards/filter', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const {
      priority, isOverdue, creatorId, columnId,
      deadlineFrom, deadlineTo, tag,
    } = request.query as Record<string, string>

    const cards = await prisma.card.findMany({
      where: {
        boardId:    id,
        isArchived: false,
        ...(priority   && { priority }),
        ...(isOverdue  && { isOverdue: isOverdue === 'true' }),
        ...(creatorId  && { creatorId }),
        ...(columnId   && { currentColumnId: columnId }),
        ...(tag        && { tags: { has: tag } }),
        ...(deadlineFrom || deadlineTo ? {
          deadline: {
            ...(deadlineFrom && { gte: new Date(deadlineFrom) }),
            ...(deadlineTo   && { lte: new Date(deadlineTo) }),
          },
        } : {}),
      },
      include: {
        creator:       { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: { select: { id: true, title: true, color: true } },
        _count:        { select: { sections: true } },
      },
      orderBy: [{ isOverdue: 'desc' }, { deadline: 'asc' }, { position: 'asc' }],
    })

    return reply.send({ cards })
  })
}

