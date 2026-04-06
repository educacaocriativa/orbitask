import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { enqueueNotification } from '../jobs/notificationQueue'
import { NotificationType } from '@prisma/client'

export async function sectionRoutes(app: FastifyInstance) {
  // ── PATCH /sections/:id ──────────────────────────────────
  // Save rich text content (TipTap JSON)
  app.patch('/sections/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: Record<string, unknown> }

    const section = await prisma.cardSection.findUnique({
      where: { id },
      include: {
        card: { include: { board: { select: { id: true, title: true } } } },
        owner: { select: { id: true, name: true } },
        column: {
          include: {
            columnMembers: { select: { userId: true } },
          },
        },
      },
    })
    if (!section) throw new AppError('Section not found', 404)

    // Permission: section owner, any column member, or ADMIN
    const isAdmin = request.user.role === 'ADMIN'
    const isSectionOwner = section.ownerId === request.user.id
    const isColumnMember = section.column.columnMembers.some((m) => m.userId === request.user.id)

    if (!isAdmin && !isSectionOwner && !isColumnMember) {
      throw new AppError('Você só pode editar seções das suas colunas', 403)
    }

    // Extract @mentions from TipTap JSON
    const mentionIds = extractMentionIds(content)

    // Update section content
    const updated = await prisma.cardSection.update({
      where: { id },
      data: { content },
    })

    // Update last comment on user
    await prisma.user.update({
      where: { id: request.user.id },
      data: {
        lastCommentAt: new Date(),
        lastCommentText: extractPlainText(content).slice(0, 200),
      },
    })

    // Process new mentions
    if (mentionIds.length > 0) {
      await processMentions({
        sectionId: id,
        mentionedUserIds: mentionIds,
        mentionedById: request.user.id,
        mentionedByName: request.user.name,
        card: section.card,
      })
    }

    return reply.send({ section: updated })
  })

  // ── POST /sections/:id/files ─────────────────────────────
  app.post('/sections/:id/files', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const section = await prisma.cardSection.findUnique({
      where: { id },
      include: {
        column: { include: { columnMembers: { select: { userId: true } } } },
      },
    })
    if (!section) throw new AppError('Section not found', 404)

    // Only column members or admins can upload
    const isAdmin = request.user.role === 'ADMIN'
    const isColumnMember = section.column.columnMembers.some((m: { userId: string }) => m.userId === request.user.id)
    const isSectionOwner = section.ownerId === request.user.id
    if (!isAdmin && !isSectionOwner && !isColumnMember) {
      throw new AppError('Apenas membros da coluna podem fazer upload de arquivos', 403)
    }

    const data = await request.file()
    if (!data) throw new AppError('No file uploaded', 400)

    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedMimeTypes.includes(data.mimetype)) {
      throw new AppError('File type not allowed. Accepted: PDF, Word, Images', 415)
    }

    const MAX_SIZE = 50 * 1024 * 1024 // 50MB
    const chunks: Buffer[] = []
    let totalSize = 0

    for await (const chunk of data.file) {
      totalSize += chunk.length
      if (totalSize > MAX_SIZE) throw new AppError('File too large (max 50MB)', 413)
      chunks.push(chunk)
    }

    const fileBuffer = Buffer.concat(chunks)
    const fileId = crypto.randomUUID()
    const ext = data.filename.split('.').pop()
    const storagePath = `cards/${section.cardId}/sections/${id}/${fileId}.${ext}`

    // Determine file type
    const fileType = getFileType(data.mimetype)

    // TODO: Upload to MinIO/S3 here
    // await minioClient.putObject(MINIO_BUCKET, storagePath, fileBuffer, { 'Content-Type': data.mimetype })

    const file = await prisma.file.create({
      data: {
        originalName: data.filename,
        storagePath,
        mimeType: data.mimetype,
        fileType,
        sizeBytes: totalSize,
        url: `/files/${storagePath}`, // served via static or MinIO presigned URL
        cardSectionId: id,
        uploadedById: request.user.id,
      },
    })

    return reply.status(201).send({ file })
  })

  // ── PATCH /mentions/:id/reply ────────────────────────────
  // Only the mentioned user or an ADMIN can reply.
  // The reply accepts rich text JSON (TipTap), supports @mentions.
  // Any new @mentions in the reply create new Mention records in the same section.
  app.patch('/mentions/:id/reply', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: Record<string, unknown> }

    if (!content) throw new AppError('A resposta não pode estar vazia', 400)

    const mention = await prisma.mention.findUnique({
      where: { id },
      include: {
        mentionedUser: { select: { id: true, name: true } },
        mentionedBy:   { select: { id: true, name: true } },
        cardSection:   {
          include: {
            card: { include: { board: { select: { id: true, title: true } } } },
          },
        },
      },
    })
    if (!mention) throw new AppError('Marcação não encontrada', 404)

    const isAdmin     = request.user.role === 'ADMIN'
    const isMentioned = mention.mentionedUserId === request.user.id

    if (!isAdmin && !isMentioned) {
      throw new AppError('Apenas o usuário marcado ou o Admin podem responder a esta marcação', 403)
    }

    const plainText = extractPlainText(content)
    if (!plainText.trim()) throw new AppError('A resposta não pode estar vazia', 400)

    // Save the rich text reply
    const updated = await prisma.mention.update({
      where: { id },
      data: {
        reply:        plainText.slice(0, 500),
        replyContent: content,
        repliedAt:    new Date(),
        repliedById:  request.user.id,
      },
      include: {
        repliedBy:     { select: { id: true, name: true, avatarUrl: true } },
        mentionedUser: { select: { id: true, name: true, avatarUrl: true } },
        mentionedBy:   { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    // Create new Mention records for any @mentions inside the reply
    const mentionedIds = extractMentionIds(content)
    if (mentionedIds.length > 0) {
      await processMentions({
        sectionId:       mention.cardSectionId,
        mentionedUserIds: mentionedIds,
        mentionedById:   request.user.id,
        mentionedByName: request.user.name,
        card:            mention.cardSection.card,
      })
    }

    // Log
    await prisma.accessLog.create({
      data: {
        userId:    request.user.id,
        action:    'MENTION_REPLIED',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: {
          mentionId: id,
          cardId:    mention.cardSection.cardId,
          cardTitle: mention.cardSection.card.title,
        },
      },
    })

    return reply.send({ mention: updated })
  })

  // ── DELETE /sections/:sectionId/files/:fileId ────────────
  app.delete('/sections/:sectionId/files/:fileId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { fileId } = request.params as { sectionId: string; fileId: string }

    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file) throw new AppError('File not found', 404)

    // TODO: Delete from MinIO
    // await minioClient.removeObject(MINIO_BUCKET, file.storagePath)

    await prisma.file.delete({ where: { id: fileId } })

    return reply.send({ message: 'File deleted' })
  })
}

// ── Helpers ──────────────────────────────────────────────

function extractMentionIds(content: Record<string, unknown>): string[] {
  const ids: string[] = []

  function traverse(node: unknown) {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>

    if (obj.type === 'mention' && obj.attrs) {
      const attrs = obj.attrs as Record<string, unknown>
      if (attrs.id && typeof attrs.id === 'string') {
        ids.push(attrs.id)
      }
    }

    if (Array.isArray(obj.content)) {
      obj.content.forEach(traverse)
    }
  }

  traverse(content)
  return [...new Set(ids)] // deduplicate
}

function extractPlainText(content: Record<string, unknown>): string {
  const parts: string[] = []

  function traverse(node: unknown) {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>

    if (obj.type === 'text' && typeof obj.text === 'string') {
      parts.push(obj.text)
    }
    if (Array.isArray(obj.content)) {
      obj.content.forEach(traverse)
    }
  }

  traverse(content)
  return parts.join(' ')
}

function getFileType(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'WORD'
  if (mimeType.startsWith('image/')) return 'IMAGE'
  return 'OTHER'
}

async function processMentions(params: {
  sectionId: string
  mentionedUserIds: string[]
  mentionedById: string
  mentionedByName: string
  card: { id: string; title: string; board: { id: string; title: string } }
}) {
  const users = await prisma.user.findMany({
    where: { id: { in: params.mentionedUserIds }, isActive: true },
    select: { id: true, name: true, phoneWhatsapp: true },
  })

  for (const user of users) {
    // Record the mention
    const mention = await prisma.mention.create({
      data: {
        cardSectionId: params.sectionId,
        mentionedUserId: user.id,
        mentionedById: params.mentionedById,
      },
    })

    // Queue WhatsApp notification if the user has a phone
    if (user.phoneWhatsapp) {
      const notification = await prisma.notificationQueue.create({
        data: {
          type: NotificationType.MENTION,
          recipientId: user.id,
          cardId: params.card.id,
          scheduledFor: new Date(),
          payload: JSON.parse(JSON.stringify({
            mentionId: mention.id,
            mentionedByName: params.mentionedByName,
            cardTitle: params.card.title,
            boardTitle: params.card.board.title,
          })),
        },
      })

      await enqueueNotification(NotificationType.MENTION, notification.id)
    }
  }
}

