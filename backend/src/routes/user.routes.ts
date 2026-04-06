import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { uploadAvatar, getPresignedUrl } from '../services/MinioService'

export async function userRoutes(app: FastifyInstance) {
  // ── GET /users — list for @mentions ──────────────────────
  app.get('/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { search } = request.query as { search?: string }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(search ? {
          OR: [
            { name:  { contains: search } },
            { email: { contains: search } },
          ],
        } : {}),
      },
      select: {
        id: true, name: true, email: true,
        avatarUrl: true, phoneWhatsapp: true, role: true,
      },
      take: 20,
      orderBy: { name: 'asc' },
    })

    return reply.send({ users })
  })

  // ── GET /users/me ─────────────────────────────────────────
  app.get('/users/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, phoneWhatsapp: true,
        lastAccessAt: true, createdAt: true,
        _count: { select: { createdCards: true, accessLogs: true } },
      },
    })
    if (!user) throw new AppError('User not found', 404)

    // Generate presigned URL for avatar if stored in MinIO
    let avatarUrl = user.avatarUrl
    if (avatarUrl && avatarUrl.startsWith('avatars/')) {
      avatarUrl = await getPresignedUrl(avatarUrl)
    }

    return reply.send({ user: { ...user, avatarUrl } })
  })

  // ── PATCH /users/me ───────────────────────────────────────
  app.patch('/users/me', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const body = request.body as { name?: string; phoneWhatsapp?: string | null }

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data:  {
        ...(body.name          !== undefined && { name: body.name }),
        ...(body.phoneWhatsapp !== undefined && { phoneWhatsapp: body.phoneWhatsapp }),
      },
      select: {
        id: true, name: true, email: true,
        avatarUrl: true, phoneWhatsapp: true, role: true,
      },
    })

    return reply.send({ user })
  })

  // ── POST /users/me/avatar ─────────────────────────────────
  app.post('/users/me/avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await request.file()
    if (!data) throw new AppError('No file uploaded', 400)

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(data.mimetype)) {
      throw new AppError('Avatar must be JPEG, PNG or WebP', 415)
    }

    const MAX = 5 * 1024 * 1024 // 5 MB
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX) throw new AppError('Avatar too large (max 5 MB)', 413)
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)
    const storagePath = await uploadAvatar(request.user.id, buffer, data.mimetype)

    await prisma.user.update({
      where: { id: request.user.id },
      data:  { avatarUrl: storagePath },
    })

    const presignedUrl = await getPresignedUrl(storagePath)

    return reply.send({ avatarUrl: presignedUrl })
  })

  // ── GET /users/me/tasks ───────────────────────────────────
  app.get('/users/me/tasks', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id

    const cards = await prisma.card.findMany({
      where: {
        isArchived: false,
        OR: [
          { currentColumn: { ownerId: userId } },
          { currentColumn: { columnMembers: { some: { userId } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        priority: true,
        deadline: true,
        isOverdue: true,
        board: { select: { id: true, title: true, color: true } },
        currentColumn: { select: { id: true, title: true, color: true } },
      },
      orderBy: [
        { isOverdue: 'desc' },
        { deadline: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 50,
    })

    return reply.send({ tasks: cards })
  })

  // ── GET /users/:id ────────────────────────────────────────
  app.get('/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true,
        avatarUrl: true, role: true,
        _count: { select: { createdCards: true } },
      },
    })
    if (!user) throw new AppError('User not found', 404)

    let avatarUrl = user.avatarUrl
    if (avatarUrl?.startsWith('avatars/')) {
      avatarUrl = await getPresignedUrl(avatarUrl)
    }

    return reply.send({ user: { ...user, avatarUrl } })
  })
}

