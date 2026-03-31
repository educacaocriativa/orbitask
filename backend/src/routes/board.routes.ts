import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'

const BOARD_MEMBERS_INCLUDE = {
  include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
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
      title: string; description?: string; color?: string; memberIds?: string[]
    }

    const memberIds = [...new Set([...(body.memberIds ?? [])])]

    const board = await prisma.board.create({
      data: {
        title: body.title,
        description: body.description,
        color: body.color,
        ownerId: request.user.id,
        members: {
          create: memberIds.map((userId) => ({ userId })),
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
      title?: string; description?: string; color?: string; memberIds?: string[]
    }

    const board = await prisma.board.findUnique({ where: { id } })
    if (!board) throw new AppError('Board not found', 404)
    if (board.ownerId !== request.user.id && request.user.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403)
    }

    const { memberIds, ...rest } = body

    const updated = await prisma.board.update({
      where: { id },
      data: {
        ...rest,
        ...(memberIds !== undefined ? {
          members: {
            deleteMany: {},
            create: [...new Set(memberIds)].map((userId) => ({ userId })),
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
        columnMembers: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    })

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
}
