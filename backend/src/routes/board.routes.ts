import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { WhatsAppService } from '../services/WhatsAppService'

const whatsapp = new WhatsAppService()

const BOARD_MEMBERS_INCLUDE = {
  select: { id: true, userId: true, role: true, user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
}

// Helper: check if a user is coordinator of a board
async function isCoordinator(userId: string, boardId: string): Promise<boolean> {
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
    select: { role: true },
  })
  return m?.role === 'COORDINATOR'
}

export async function boardRoutes(app: FastifyInstance) {
  // ── GET /boards ──────────────────────────────────────────
  // Returns boards where user is owner OR member
  app.get('/boards', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id

    const boards = await prisma.board.findMany({
      where: {
        isArchived: false,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        members: BOARD_MEMBERS_INCLUDE,
        _count: { select: { columns: true, cards: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ boards })
  })

  // ── POST /boards ─────────────────────────────────────────
  app.post('/boards', { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as {
      title: string; description?: string; color?: string; memberIds?: string[]; coordinatorIds?: string[]
    }

    const memberIds = [...new Set([...(body.memberIds ?? [])])]
    const coordSet  = new Set(body.coordinatorIds ?? [])

    const board = await prisma.board.create({
      data: {
        title: body.title,
        description: body.description,
        color: body.color,
        ownerId: request.user.id,
        members: {
          create: memberIds.map((userId) => ({ userId, role: coordSet.has(userId) ? 'COORDINATOR' : 'MEMBER' })),
        },
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        members: BOARD_MEMBERS_INCLUDE,
        _count: { select: { columns: true, cards: true } },
      },
    })

    return reply.status(201).send({ board })
  })

  // ── PATCH /boards/:id ────────────────────────────────────
  app.patch('/boards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string; description?: string; color?: string; memberIds?: string[]; coordinatorIds?: string[]
    }

    const board = await prisma.board.findUnique({ where: { id } })
    if (!board) throw new AppError('Board not found', 404)

    const userId  = request.user.id
    const isAdmin = request.user.role === 'ADMIN'
    const isCoord = await isCoordinator(userId, id)
    if (board.ownerId !== userId && !isAdmin && !isCoord) {
      throw new AppError('Not authorized', 403)
    }

    const { memberIds, coordinatorIds, ...rest } = body
    const coordSet = new Set(coordinatorIds ?? [])

    const updated = await prisma.board.update({
      where: { id },
      data: {
        ...rest,
        ...(memberIds !== undefined ? {
          members: {
            deleteMany: {},
            create: [...new Set(memberIds)].map((uid) => ({
              userId: uid,
              role: coordSet.has(uid) ? 'COORDINATOR' : 'MEMBER',
            })),
          },
        } : {}),
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        members: BOARD_MEMBERS_INCLUDE,
        _count: { select: { columns: true, cards: true } },
      },
    })

    return reply.send({ board: updated })
  })

  // ── GET /boards/:id ──────────────────────────────────────
  app.get('/boards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user.id

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        members: BOARD_MEMBERS_INCLUDE,
        columns: {
          where: { isArchived: false },
          orderBy: { position: 'asc' },
          include: {
            owner: { select: { id: true, name: true, avatarUrl: true } },
            columnMembers: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
            cards: {
              where: { isArchived: false },
              orderBy: { position: 'asc' },
              include: {
                creator: { select: { id: true, name: true, avatarUrl: true } },
                _count: { select: { sections: true } },
                sections: {
                  select: {
                    mentions: {
                      where: { mentionedUserId: userId, reply: null },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!board) throw new AppError('Board not found', 404)

    // Access check: owner, member or admin
    const isOwner  = board.ownerId === userId
    const isMember = board.members.some((m) => m.userId === userId)
    const isAdmin  = request.user.role === 'ADMIN'
    if (!isOwner && !isMember && !isAdmin) throw new AppError('Access denied', 403)

    return reply.send({ board })
  })

  // ── POST /boards/:boardId/columns ────────────────────────
  app.post('/boards/:boardId/columns', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    const body = request.body as { title: string; ownerId: string; ownerIds?: string[]; color?: string }

    const board = await prisma.board.findUnique({ where: { id: boardId } })
    if (!board) throw new AppError('Board not found', 404)

    const lastColumn = await prisma.column.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
    })

    const allOwnerIds = [...new Set([body.ownerId, ...(body.ownerIds ?? [])])]

    const column = await prisma.column.create({
      data: {
        title: body.title,
        color: body.color ?? '#818cf8',
        ownerId: body.ownerId,
        boardId,
        position: (lastColumn?.position ?? -1) + 1,
        columnMembers: {
          create: allOwnerIds.map((userId) => ({ userId })),
        },
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        columnMembers: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    })

    return reply.status(201).send({ column })
  })

  // ── PATCH /columns/:id ───────────────────────────────────
  app.patch('/columns/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { title?: string; ownerId?: string; ownerIds?: string[]; color?: string }

    // Fetch current column to detect owner change
    const prevColumn = await prisma.column.findUnique({
      where: { id },
      select: {
        ownerId: true,
        title: true,
        boardId: true,
        board: { select: { title: true } },
        columnMembers: { select: { userId: true } },
      },
    })

    const { ownerIds, ...rest } = body

    const column = await prisma.column.update({
      where: { id },
      data: {
        ...rest,
        ...(ownerIds && ownerIds.length > 0 ? {
          columnMembers: {
            deleteMany: {},
            create: [...new Set([...(body.ownerId ? [body.ownerId] : []), ...ownerIds])].map((userId) => ({ userId })),
          },
        } : {}),
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        columnMembers: { include: { user: { select: { id: true, name: true, avatarUrl: true, phoneWhatsapp: true } } } },
      },
    })

    // ── Notify new members added to the column ──────────────
    if (prevColumn && ownerIds && ownerIds.length > 0) {
      const prevMemberIds = new Set(prevColumn.columnMembers.map((m) => m.userId))
      const newMembers = column.columnMembers.filter((m) => !prevMemberIds.has(m.user.id))

      setImmediate(async () => {
        for (const m of newMembers) {
          if (!m.user.phoneWhatsapp) continue
          try {
            await whatsapp.notifyAnnouncement({
              recipientPhone: m.user.phoneWhatsapp,
              recipientName: m.user.name,
              title: `Você foi adicionado à etapa "${column.title}"`,
              content: `Você agora faz parte da etapa *"${column.title}"* no board *"${prevColumn.board.title}"*.\n\nCards movidos para essa etapa aparecerão no seu painel de tarefas.`,
              sentBy: request.user.name,
            })
          } catch (err) {
            console.error('WhatsApp column member notify error:', err)
          }
        }
      })
    }

    return reply.send({ column })
  })

  // ── PATCH /boards/:boardId/columns/reorder ───────────────
  app.patch('/boards/:boardId/columns/reorder', { preHandler: [authenticate] }, async (request, reply) => {
    const { columnIds } = request.body as { columnIds: string[] }

    await prisma.$transaction(
      columnIds.map((colId, index) =>
        prisma.column.update({ where: { id: colId }, data: { position: index } })
      )
    )

    return reply.send({ message: 'Columns reordered' })
  })

  // ── PATCH /boards/:boardId/members/:userId/role ──────────
  // Admin-only: set a board member's role (COORDINATOR | MEMBER)
  app.patch('/boards/:boardId/members/:userId/role', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId, userId } = request.params as { boardId: string; userId: string }
    const { role } = request.body as { role: 'COORDINATOR' | 'MEMBER' }

    if (request.user.role !== 'ADMIN') throw new AppError('Apenas o Admin pode definir coordenadores', 403)

    const member = await prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId } },
      data: { role },
      select: { id: true, userId: true, role: true, user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
    })

    return reply.send({ member })
  })

  // ── GET /boards/:id/overdue-cards ────────────────────────
  // Cards stuck in current column for more than 24h
  // Accessible by Admin or board Coordinator
  app.get('/boards/:id/overdue-cards', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId  = request.user.id
    const isAdmin = request.user.role === 'ADMIN'
    const isCoord = await isCoordinator(userId, id)

    if (!isAdmin && !isCoord) throw new AppError('Acesso negado', 403)

    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago

    const cards = await prisma.card.findMany({
      where: {
        boardId:        id,
        isArchived:     false,
        columnEnteredAt: { lt: threshold, not: null },
      },
      include: {
        currentColumn: {
          include: {
            owner: { select: { id: true, name: true, avatarUrl: true } },
            columnMembers: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { columnEnteredAt: 'asc' },
    })

    return reply.send({ cards })
  })
}
