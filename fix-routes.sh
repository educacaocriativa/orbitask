#!/usr/bin/env bash
# ─────────────────────────────────────────
#  ORBITASK — Correção das rotas do backend
#  Execute dentro da pasta orbitask/
# ─────────────────────────────────────────
set -e

if [ ! -f "backend/src/server.ts" ]; then
  echo "❌ Execute este script DENTRO da pasta orbitask/"
  echo "   cd orbitask && bash ../fix-routes.sh"
  exit 1
fi

echo "🔧 Corrigindo rotas do backend..."

cat > 'backend/src/routes/auth.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from '../services/AuthService'
import { authenticate } from '../middlewares/auth'

const registerSchema = z.object({
  name:          z.string().min(2).max(100),
  email:         z.string().email(),
  password:      z.string().min(8),
  phoneWhatsapp: z.string().optional(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

const passwordSchema = z.object({
  currentPassword: z.string(),
  newPassword:     z.string().min(8),
})

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app)

  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const user = await authService.register(body)
    return reply.status(201).send({ message: 'User registered successfully', user })
  })

  app.post('/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)
    const result = await authService.login({
      email, password,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })
    return reply.send({ message: 'Login successful', ...result })
  })

  app.post('/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    await authService.logout(request.user.id, request.ip)
    return reply.send({ message: 'Logged out successfully' })
  })

  app.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await authService.getProfile(request.user.id)
    return reply.send({ user })
  })

  app.patch('/auth/password', { preHandler: [authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = passwordSchema.parse(request.body)
    await authService.changePassword(request.user.id, currentPassword, newPassword)
    return reply.send({ message: 'Password changed successfully' })
  })
}
EOF

cat > 'backend/src/routes/admin.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import { AdminService } from '../services/AdminService'
import { requireAdmin } from '../middlewares/auth'
import { WhatsAppService } from '../services/WhatsAppService'

const createUserSchema = z.object({
  name:          z.string().min(2),
  email:         z.string().email(),
  password:      z.string().min(8),
  role:          z.nativeEnum(UserRole).default(UserRole.MEMBER),
  phoneWhatsapp: z.string().optional(),
})

export async function adminRoutes(app: FastifyInstance) {
  const adminService = new AdminService()
  const whatsapp     = new WhatsAppService()
  const isAdmin      = requireAdmin(['ADMIN'])

  app.get('/admin/dashboard', { preHandler: [isAdmin] }, async (_req, reply) => {
    return reply.send(await adminService.getDashboardStats())
  })

  app.get('/admin/users', { preHandler: [isAdmin] }, async (request, reply) => {
    const q = request.query as { page?: string; limit?: string; search?: string }
    return reply.send(await adminService.listUsers(Number(q.page ?? 1), Number(q.limit ?? 20), q.search))
  })

  app.post('/admin/users', { preHandler: [isAdmin] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const user = await adminService.createUser(body)
    return reply.status(201).send({ user })
  })

  app.patch('/admin/users/:id/status', { preHandler: [isAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body)
    return reply.send({ user: await adminService.toggleUserStatus(id, isActive) })
  })

  app.patch('/admin/users/:id/role', { preHandler: [isAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { role } = z.object({ role: z.nativeEnum(UserRole) }).parse(request.body)
    return reply.send({ user: await adminService.updateUserRole(id, role) })
  })

  app.get('/admin/logs', { preHandler: [isAdmin] }, async (request, reply) => {
    const q = request.query as { userId?: string; action?: string; from?: string; to?: string; page?: string; limit?: string }
    return reply.send(await adminService.getAccessLogs({
      userId: q.userId, action: q.action,
      from: q.from ? new Date(q.from) : undefined,
      to:   q.to   ? new Date(q.to)   : undefined,
      page: Number(q.page ?? 1), limit: Number(q.limit ?? 50),
    }))
  })

  app.get('/admin/whatsapp/status', { preHandler: [isAdmin] }, async (_req, reply) => {
    return reply.send(await whatsapp.checkConnection())
  })
}
EOF

cat > 'backend/src/routes/board.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'

export async function boardRoutes(app: FastifyInstance) {
  app.get('/boards', { preHandler: [authenticate] }, async (request, reply) => {
    const boards = await prisma.board.findMany({
      where:   { isArchived: false, ownerId: request.user.id },
      include: { owner: { select: { id: true, name: true, avatarUrl: true } }, _count: { select: { columns: true, cards: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ boards })
  })

  app.post('/boards', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({ title: z.string().min(1).max(100), description: z.string().optional(), color: z.string().default('#6366f1') }).parse(request.body)
    const board = await prisma.board.create({
      data:    { ...body, ownerId: request.user.id },
      include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
    })
    return reply.status(201).send({ board })
  })

  app.get('/boards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const board  = await prisma.board.findUnique({
      where:   { id },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        columns: {
          where: { isArchived: false }, orderBy: { position: 'asc' },
          include: {
            owner: { select: { id: true, name: true, avatarUrl: true } },
            cards: {
              where: { isArchived: false }, orderBy: { position: 'asc' },
              include: { creator: { select: { id: true, name: true, avatarUrl: true } }, _count: { select: { sections: true } } },
            },
          },
        },
      },
    })
    if (!board) throw new AppError('Board not found', 404)
    return reply.send({ board })
  })

  app.post('/boards/:boardId/columns', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    const body = z.object({ title: z.string().min(1).max(100), ownerId: z.string().uuid(), color: z.string().default('#818cf8') }).parse(request.body)
    const board = await prisma.board.findUnique({ where: { id: boardId } })
    if (!board) throw new AppError('Board not found', 404)
    const last = await prisma.column.findFirst({ where: { boardId }, orderBy: { position: 'desc' } })
    const column = await prisma.column.create({
      data:    { ...body, boardId, position: (last?.position ?? -1) + 1 },
      include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
    })
    return reply.status(201).send({ column })
  })

  app.patch('/columns/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body   = z.object({ title: z.string().optional(), ownerId: z.string().uuid().optional(), color: z.string().optional() }).parse(request.body)
    const column = await prisma.column.update({
      where:   { id }, data: body,
      include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
    })
    return reply.send({ column })
  })

  app.patch('/boards/:boardId/columns/reorder', { preHandler: [authenticate] }, async (request, reply) => {
    const { columnIds } = z.object({ columnIds: z.array(z.string().uuid()) }).parse(request.body)
    await prisma.$transaction(columnIds.map((colId, i) => prisma.column.update({ where: { id: colId }, data: { position: i } })))
    return reply.send({ message: 'Columns reordered' })
  })
}
EOF

cat > 'backend/src/routes/card.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { enqueueNotification } from '../jobs/notificationQueue'
import { NotificationType } from '@prisma/client'

export async function cardRoutes(app: FastifyInstance) {
  app.post('/boards/:boardId/cards', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    const body = z.object({
      title: z.string().min(1).max(200), description: z.string().optional(),
      columnId: z.string().uuid(), priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).default('MEDIUM'),
      tags: z.array(z.string()).default([]), deadline: z.string().datetime().optional(),
    }).parse(request.body)

    const column = await prisma.column.findUnique({ where: { id: body.columnId }, include: { owner: true } })
    if (!column) throw new AppError('Column not found', 404)

    const last = await prisma.card.findFirst({ where: { currentColumnId: body.columnId }, orderBy: { position: 'desc' } })
    const card = await prisma.card.create({
      data: {
        title: body.title, description: body.description, priority: body.priority, tags: body.tags,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        deadlineAt: body.deadline ? new Date() : undefined,
        position: (last?.position ?? -1) + 1, currentColumnId: body.columnId, boardId, creatorId: request.user.id,
      },
      include: { creator: { select: { id: true, name: true, avatarUrl: true } }, currentColumn: { include: { owner: { select: { id: true, name: true, avatarUrl: true } } } } },
    })
    await prisma.cardSection.create({ data: { cardId: card.id, columnId: body.columnId, ownerId: column.owner.id, content: null } })
    return reply.status(201).send({ card })
  })

  app.get('/cards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentColumn: { include: { owner: { select: { id: true, name: true, avatarUrl: true } } } },
        board: { select: { id: true, title: true } },
        sections: {
          orderBy: { createdAt: 'asc' },
          include: {
            owner: { select: { id: true, name: true, avatarUrl: true } },
            column: { select: { id: true, title: true, color: true } },
            files: true,
            mentions: { include: { mentionedUser: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
      },
    })
    if (!card) throw new AppError('Card not found', 404)
    return reply.send({ card })
  })

  app.patch('/cards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body   = z.object({
      title: z.string().optional(), description: z.string().optional(),
      priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(),
      tags: z.array(z.string()).optional(), deadline: z.string().datetime().nullable().optional(),
    }).parse(request.body)

    const data: Record<string, unknown> = { ...body }
    if ('deadline' in body) {
      data.deadline  = body.deadline ? new Date(body.deadline) : null
      data.deadlineAt = body.deadline ? new Date() : null
      if (body.deadline) data.isOverdue = false
    }
    const card = await prisma.card.update({
      where: { id }, data,
      include: { creator: { select: { id: true, name: true, avatarUrl: true } }, currentColumn: { include: { owner: { select: { id: true, name: true } } } } },
    })
    return reply.send({ card })
  })

  app.post('/cards/:id/move', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { targetColumnId, targetPosition, deadline } = z.object({
      targetColumnId: z.string().uuid(), targetPosition: z.number().int().min(0),
      deadline: z.string().datetime({ message: 'Deadline is required to move a card' }),
    }).parse(request.body)

    const card = await prisma.card.findUnique({
      where: { id },
      include: { currentColumn: { include: { owner: { select: { id: true, name: true, phoneWhatsapp: true } } } }, creator: { select: { id: true, name: true } }, board: { select: { id: true, title: true } } },
    })
    if (!card) throw new AppError('Card not found', 404)
    if (card.currentColumnId === targetColumnId) throw new AppError('Card already in this column', 400)

    const targetColumn = await prisma.column.findUnique({ where: { id: targetColumnId }, include: { owner: { select: { id: true, name: true, phoneWhatsapp: true } } } })
    if (!targetColumn) throw new AppError('Target column not found', 404)

    await prisma.card.updateMany({ where: { currentColumnId: targetColumnId, position: { gte: targetPosition } }, data: { position: { increment: 1 } } })
    const updatedCard = await prisma.card.update({ where: { id }, data: { currentColumnId: targetColumnId, position: targetPosition, deadline: new Date(deadline), deadlineAt: new Date(), isOverdue: false } })
    await prisma.cardSection.upsert({ where: { cardId_columnId: { cardId: id, columnId: targetColumnId } }, update: {}, create: { cardId: id, columnId: targetColumnId, ownerId: targetColumn.owner.id, content: null } })

    if (targetColumn.owner.phoneWhatsapp) {
      const notif = await prisma.notificationQueue.create({ data: { type: NotificationType.CARD_MOVED, recipientId: targetColumn.owner.id, cardId: id, columnId: targetColumnId, scheduledFor: new Date(), payload: { fromColumn: card.currentColumn.title, toColumn: targetColumn.title, movedBy: request.user.name, deadline: new Date(deadline).toISOString() } } })
      await enqueueNotification(NotificationType.CARD_MOVED, notif.id)
    }
    return reply.send({ card: updatedCard, message: `Card moved to "${targetColumn.title}"` })
  })

  app.delete('/cards/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.card.update({ where: { id }, data: { isArchived: true } })
    return reply.send({ message: 'Card archived' })
  })

  app.patch('/cards/reorder', { preHandler: [authenticate] }, async (request, reply) => {
    const { columnId, cardIds } = z.object({ columnId: z.string().uuid(), cardIds: z.array(z.string().uuid()) }).parse(request.body)
    await prisma.$transaction(cardIds.map((cardId, i) => prisma.card.update({ where: { id: cardId }, data: { position: i, currentColumnId: columnId } })))
    return reply.send({ message: 'Cards reordered' })
  })
}
EOF

cat > 'backend/src/routes/section.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { enqueueNotification } from '../jobs/notificationQueue'
import { NotificationType } from '@prisma/client'

export async function sectionRoutes(app: FastifyInstance) {
  app.patch('/sections/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }      = request.params as { id: string }
    const { content } = z.object({ content: z.record(z.unknown()) }).parse(request.body)

    const section = await prisma.cardSection.findUnique({ where: { id }, include: { card: { include: { board: { select: { id: true, title: true } } } }, owner: { select: { id: true, name: true } } } })
    if (!section) throw new AppError('Section not found', 404)

    const updated = await prisma.cardSection.update({ where: { id }, data: { content } })

    await prisma.user.update({ where: { id: request.user.id }, data: { lastCommentAt: new Date(), lastCommentText: extractText(content).slice(0, 200) } })

    const mentionIds = extractMentions(content)
    if (mentionIds.length > 0) {
      const users = await prisma.user.findMany({ where: { id: { in: mentionIds }, isActive: true }, select: { id: true, phoneWhatsapp: true } })
      for (const u of users) {
        const m = await prisma.mention.create({ data: { cardSectionId: id, mentionedUserId: u.id, mentionedById: request.user.id } })
        if (u.phoneWhatsapp) {
          const n = await prisma.notificationQueue.create({ data: { type: NotificationType.MENTION, recipientId: u.id, cardId: section.card.id, scheduledFor: new Date(), payload: { mentionId: m.id, mentionedByName: request.user.name, cardTitle: section.card.title, boardTitle: section.card.board.title } } })
          await enqueueNotification(NotificationType.MENTION, n.id)
        }
      }
    }
    return reply.send({ section: updated })
  })

  app.post('/sections/:id/files', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const section = await prisma.cardSection.findUnique({ where: { id } })
    if (!section) throw new AppError('Section not found', 404)

    const data = await request.file()
    if (!data) throw new AppError('No file uploaded', 400)

    const allowed = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','image/jpeg','image/png','image/webp']
    if (!allowed.includes(data.mimetype)) throw new AppError('File type not allowed', 415)

    const chunks: Buffer[] = []
    let totalSize = 0
    for await (const chunk of data.file) {
      totalSize += chunk.length
      if (totalSize > 50 * 1024 * 1024) throw new AppError('File too large (max 50MB)', 413)
      chunks.push(chunk)
    }

    const ext  = data.filename.split('.').pop()
    const path = `cards/${section.cardId}/sections/${id}/${crypto.randomUUID()}.${ext}`
    const type = data.mimetype === 'application/pdf' ? 'PDF' : data.mimetype.includes('word') ? 'WORD' : data.mimetype.startsWith('image/') ? 'IMAGE' : 'OTHER'

    const file = await prisma.file.create({ data: { originalName: data.filename, storagePath: path, mimeType: data.mimetype, fileType: type as any, sizeBytes: totalSize, url: `/files/${path}`, cardSectionId: id, uploadedById: request.user.id } })
    return reply.status(201).send({ file })
  })

  app.delete('/sections/:sectionId/files/:fileId', { preHandler: [authenticate] }, async (request, reply) => {
    const { fileId } = request.params as { sectionId: string; fileId: string }
    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file) throw new AppError('File not found', 404)
    await prisma.file.delete({ where: { id: fileId } })
    return reply.send({ message: 'File deleted' })
  })
}

function extractMentions(c: Record<string, unknown>): string[] {
  const ids: string[] = []
  const t = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (o.type === 'mention' && (o.attrs as any)?.id) ids.push((o.attrs as any).id)
    if (Array.isArray(o.content)) o.content.forEach(t)
  }
  t(c); return [...new Set(ids)]
}

function extractText(c: Record<string, unknown>): string {
  const p: string[] = []
  const t = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (o.type === 'text' && typeof o.text === 'string') p.push(o.text)
    if (Array.isArray(o.content)) o.content.forEach(t)
  }
  t(c); return p.join(' ')
}
EOF

cat > 'backend/src/routes/user.routes.ts' << 'EOF'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { uploadAvatar, getPresignedUrl } from '../services/MinioService'

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { search } = request.query as { search?: string }
    const users = await prisma.user.findMany({
      where: { isActive: true, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) },
      select: { id: true, name: true, email: true, avatarUrl: true, phoneWhatsapp: true, role: true },
      take: 20, orderBy: { name: 'asc' },
    })
    return reply.send({ users })
  })

  app.get('/users/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, phoneWhatsapp: true, lastAccessAt: true, createdAt: true, _count: { select: { createdCards: true, accessLogs: true } } },
    })
    if (!user) throw new AppError('User not found', 404)
    let avatarUrl = user.avatarUrl
    if (avatarUrl?.startsWith('avatars/')) { try { avatarUrl = await getPresignedUrl(avatarUrl) } catch {} }
    return reply.send({ user: { ...user, avatarUrl } })
  })

  app.patch('/users/me', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({ name: z.string().min(2).max(100).optional(), phoneWhatsapp: z.string().optional().nullable() }).parse(request.body)
    const user = await prisma.user.update({
      where: { id: request.user.id }, data: { ...(body.name !== undefined && { name: body.name }), ...(body.phoneWhatsapp !== undefined && { phoneWhatsapp: body.phoneWhatsapp }) },
      select: { id: true, name: true, email: true, avatarUrl: true, phoneWhatsapp: true, role: true },
    })
    return reply.send({ user })
  })

  app.post('/users/me/avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await request.file()
    if (!data) throw new AppError('No file uploaded', 400)
    if (!['image/jpeg','image/png','image/webp'].includes(data.mimetype)) throw new AppError('Avatar must be JPEG, PNG or WebP', 415)
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of data.file) { size += chunk.length; if (size > 5*1024*1024) throw new AppError('Too large', 413); chunks.push(chunk) }
    const buffer = Buffer.concat(chunks)
    const path   = await uploadAvatar(request.user.id, buffer, data.mimetype)
    await prisma.user.update({ where: { id: request.user.id }, data: { avatarUrl: path } })
    let url = path; try { url = await getPresignedUrl(path) } catch {}
    return reply.send({ avatarUrl: url })
  })

  app.get('/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user   = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, avatarUrl: true, role: true, _count: { select: { createdCards: true } } } })
    if (!user) throw new AppError('User not found', 404)
    let avatarUrl = user.avatarUrl
    if (avatarUrl?.startsWith('avatars/')) { try { avatarUrl = await getPresignedUrl(avatarUrl) } catch {} }
    return reply.send({ user: { ...user, avatarUrl } })
  })
}
EOF

echo ""
echo "✅ Rotas corrigidas com sucesso!"
echo ""
echo "Reinicie o servidor:"
echo "  npm run dev"
