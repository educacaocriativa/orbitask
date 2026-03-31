import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { enqueueNotification } from '../jobs/notificationQueue'
import { NotificationType } from '@prisma/client'

export async function cardRoutes(app: FastifyInstance) {
  // ── POST /boards/:boardId/cards ──────────────────────────
  app.post('/boards/:boardId/cards', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    const body = request.body as {
      title: string; description?: string; columnId: string
      priority: string; tags: string[]; deadline?: string
    }

    const column = await prisma.column.findUnique({
      where: { id: body.columnId },
      include: { owner: true },
    })
    if (!column) throw new AppError('Column not found', 404)

    const lastCard = await prisma.card.findFirst({
      where: { currentColumnId: body.columnId },
      orderBy: { position: 'desc' },
    })

    const card = await prisma.card.create({
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority,
        tags: body.tags,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        deadlineAt: body.deadline ? new Date() : undefined,
        position: (lastCard?.position ?? -1) + 1,
        currentColumnId: body.columnId,
        boardId,
        creatorId: request.user.id,
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: {
          include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    })

    // Auto-create section for this column's owner
    await prisma.cardSection.create({
      data: {
        cardId: card.id,
        columnId: body.columnId,
        ownerId: column.owner.id,
        content: null,
      },
    })

    return reply.status(201).send({ card })
  })

  // ── GET /cards/:id ───────────────────────────────────────
  app.get('/cards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: {
          include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
        },
        board: { select: { id: true, title: true } },
        sections: {
          orderBy: { createdAt: 'asc' },
          include: {
            owner: { select: { id: true, name: true, avatarUrl: true } },
            column: { select: { id: true, title: true, color: true } },
            files: true,
            mentions: {
              orderBy: { createdAt: 'asc' },
              include: {
                mentionedUser: { select: { id: true, name: true, avatarUrl: true } },
                mentionedBy:   { select: { id: true, name: true, avatarUrl: true } },
                repliedBy:     { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    })

    if (!card) throw new AppError('Card not found', 404)

    return reply.send({ card })
  })

  // ── PATCH /cards/:id ─────────────────────────────────────
  app.patch('/cards/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string; description?: string; priority?: string
      tags?: string[]; deadline?: string | null
    }

    const updateData: Record<string, unknown> = { ...body }

    if ('deadline' in body) {
      updateData.deadline = body.deadline ? new Date(body.deadline) : null
      updateData.deadlineAt = body.deadline ? new Date() : null
      // Reset overdue when a new deadline is set
      if (body.deadline) updateData.isOverdue = false
    }

    const card = await prisma.card.update({
      where: { id },
      data: updateData,
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: {
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    })

    return reply.send({ card })
  })

  // ── POST /cards/:id/move ─────────────────────────────────
  // Core business rule: requires deadline + auto-creates section
  app.post('/cards/:id/move', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { targetColumnId, targetPosition, deadline } = request.body as {
      targetColumnId: string; targetPosition: number; deadline: string
    }

    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        currentColumn: {
          include: { owner: { select: { id: true, name: true, phoneWhatsapp: true } } },
        },
        creator: { select: { id: true, name: true } },
        board: { select: { id: true, title: true } },
      },
    })

    if (!card) throw new AppError('Card not found', 404)
    if (card.currentColumnId === targetColumnId) {
      throw new AppError('Card is already in this column', 400)
    }

    // ── Permission check ─────────────────────────────────────────────────────
    const userId = request.user.id
    const isAdmin = request.user.role === 'ADMIN'

    if (!isAdmin) {
      // Rule 1: user already moved this card — must wait for someone else to move it back
      if (card.lastMovedByUserId === userId) {
        await prisma.accessLog.create({
          data: {
            userId,
            action: 'MOVE_BLOCKED',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            metadata: {
              cardId: id,
              cardTitle: card.title,
              reason: 'already_moved',
              fromColumnId: card.currentColumnId,
              fromColumnTitle: card.currentColumn.title,
              targetColumnId,
            },
          },
        })
        throw new AppError(
          'Você já moveu este card. Para movê-lo novamente, outro usuário ou o Admin precisa devolvê-lo à sua etapa.',
          403,
        )
      }

      // Rule 2: user must be owner or member of the source column
      const sourceColumn = await prisma.column.findUnique({
        where: { id: card.currentColumnId },
        include: { columnMembers: { select: { userId: true } } },
      })
      const isOwner  = sourceColumn?.ownerId === userId
      const isMember = sourceColumn?.columnMembers.some((m) => m.userId === userId) ?? false

      if (!isOwner && !isMember) {
        await prisma.accessLog.create({
          data: {
            userId,
            action: 'MOVE_BLOCKED',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            metadata: {
              cardId: id,
              cardTitle: card.title,
              reason: 'not_column_member',
              fromColumnId: card.currentColumnId,
              fromColumnTitle: card.currentColumn.title,
              targetColumnId,
            },
          },
        })
        throw new AppError('Você não tem permissão para mover este card. Ele pertence a uma etapa da qual você não faz parte.', 403)
      }
    }

    const targetColumn = await prisma.column.findUnique({
      where: { id: targetColumnId },
      include: { owner: { select: { id: true, name: true, phoneWhatsapp: true } } },
    })
    if (!targetColumn) throw new AppError('Target column not found', 404)

    const fromColumnTitle = card.currentColumn.title

    // Shift other cards in target column
    await prisma.card.updateMany({
      where: {
        currentColumnId: targetColumnId,
        position: { gte: targetPosition },
      },
      data: { position: { increment: 1 } },
    })

    // Move card and set new deadline; record who moved it for one-move-per-user enforcement
    const updatedCard = await prisma.card.update({
      where: { id },
      data: {
        currentColumnId: targetColumnId,
        position: targetPosition,
        deadline: new Date(deadline),
        deadlineAt: new Date(),
        isOverdue: false,
        lastMovedByUserId: userId,
      },
    })

    // Auto-create section for the new column's owner (if not already exists)
    await prisma.cardSection.upsert({
      where: { cardId_columnId: { cardId: id, columnId: targetColumnId } },
      update: {},
      create: {
        cardId: id,
        columnId: targetColumnId,
        ownerId: targetColumn.owner.id,
        content: null,
      },
    })

    // Enqueue WhatsApp notification for the column owner
    if (targetColumn.owner.phoneWhatsapp) {
      const notification = await prisma.notificationQueue.create({
        data: {
          type: NotificationType.CARD_MOVED,
          recipientId: targetColumn.owner.id,
          cardId: id,
          columnId: targetColumnId,
          scheduledFor: new Date(),
          payload: {
            fromColumn: fromColumnTitle,
            toColumn: targetColumn.title,
            movedBy: request.user.name,
            deadline: new Date(deadline).toISOString(),
          },
        },
      })
      await enqueueNotification(NotificationType.CARD_MOVED, notification.id)
    }

    return reply.send({
      card: updatedCard,
      message: `Card moved to "${targetColumn.title}"`,
    })
  })

  // ── DELETE /cards/:id — Archive (Admin only) ─────────────
  app.delete('/cards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    if (request.user.role !== 'ADMIN') {
      throw new AppError('Apenas o Admin pode arquivar cards', 403)
    }

    const card = await prisma.card.findUnique({ where: { id } })
    if (!card) throw new AppError('Card not found', 404)

    await prisma.card.update({
      where: { id },
      data: {
        isArchived:           true,
        archivedFromColumnId: card.currentColumnId,
        archivedFromPosition: card.position,
        archivedAt:           new Date(),
      },
    })

    await prisma.accessLog.create({
      data: {
        userId:    request.user.id,
        action:    'CARD_ARCHIVED',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata:  { cardId: id, cardTitle: card.title, fromColumnId: card.currentColumnId },
      },
    })

    return reply.send({ message: 'Card archived successfully' })
  })

  // ── POST /cards/:id/restore — Restore archived card (Admin only) ─
  app.post('/cards/:id/restore', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    if (request.user.role !== 'ADMIN') {
      throw new AppError('Apenas o Admin pode restaurar cards', 403)
    }

    const card = await prisma.card.findUnique({ where: { id } })
    if (!card) throw new AppError('Card not found', 404)
    if (!card.isArchived) throw new AppError('Card is not archived', 400)

    // Restore to original column (if it still exists), otherwise keep current
    const targetColumnId = card.archivedFromColumnId ?? card.currentColumnId
    const column = await prisma.column.findUnique({ where: { id: targetColumnId } })
    const columnExists = !!column && !column.isArchived

    await prisma.card.update({
      where: { id },
      data: {
        isArchived:           false,
        currentColumnId:      columnExists ? targetColumnId : card.currentColumnId,
        position:             card.archivedFromPosition ?? 0,
        archivedFromColumnId: null,
        archivedFromPosition: null,
        archivedAt:           null,
      },
    })

    await prisma.accessLog.create({
      data: {
        userId:    request.user.id,
        action:    'CARD_RESTORED',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata:  { cardId: id, cardTitle: card.title, toColumnId: targetColumnId },
      },
    })

    return reply.send({ message: 'Card restored successfully' })
  })

  // ── GET /boards/:boardId/archived-cards (Admin only) ─────
  app.get('/boards/:boardId/archived-cards', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }

    if (request.user.role !== 'ADMIN') {
      throw new AppError('Apenas o Admin pode ver cards arquivados', 403)
    }

    const cards = await prisma.card.findMany({
      where:   { boardId, isArchived: true },
      orderBy: { archivedAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: { select: { id: true, title: true, color: true } },
        _count: { select: { sections: true } },
      },
    })

    // Attach the original column info for display
    const columnIds = cards
      .map((c) => c.archivedFromColumnId)
      .filter(Boolean) as string[]

    const columns = await prisma.column.findMany({
      where: { id: { in: columnIds } },
      select: { id: true, title: true, color: true },
    })
    const colMap = Object.fromEntries(columns.map((c) => [c.id, c]))

    const enriched = cards.map((c) => ({
      ...c,
      archivedFromColumn: c.archivedFromColumnId ? colMap[c.archivedFromColumnId] : null,
    }))

    return reply.send({ cards: enriched })
  })

  // ── PATCH /cards/reorder ─────────────────────────────────
  app.patch('/cards/reorder', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { columnId, cardIds } = request.body as { columnId: string; cardIds: string[] }

    await prisma.$transaction(
      cardIds.map((cardId, index) =>
        prisma.card.update({
          where: { id: cardId },
          data: { position: index, currentColumnId: columnId },
        })
      )
    )

    return reply.send({ message: 'Cards reordered' })
  })
}

