import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { prisma } from '../database/prisma'
import {
  getMonth,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  attachFile,
  removeFile,
  replyToMention,
  canAccessTimeline,
  MAX_FILE_BYTES,
} from '../services/TimelineService'

/** Barra quem não está na lista da timeline. ADMIN passa sempre. */
async function requireTimelineAccess(request: FastifyRequest) {
  if (!(await canAccessTimeline(request.user))) {
    throw new AppError('Você não tem acesso à Timeline.', 403)
  }
}

/** Só ADMIN gerencia quem entra e sai da lista. */
function requireAdminUser(request: FastifyRequest) {
  if (request.user.role !== 'ADMIN') {
    throw new AppError('Apenas administradores podem gerenciar o acesso à Timeline.', 403)
  }
}

export async function timelineRoutes(app: FastifyInstance) {
  // ── GET /timeline?year=&month= ───────────────────────────
  app.get('/timeline', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)

    const query = request.query as { year?: string; month?: string }
    const now   = new Date()
    const year  = query.year  ? Number(query.year)  : now.getFullYear()
    const month = query.month ? Number(query.month) : now.getMonth() + 1

    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new AppError('Ano ou mês inválido.', 400)
    }

    return reply.send(await getMonth(year, month))
  })

  // ── GET /timeline/people — quem pode ser marcado com @ ───
  app.get('/timeline/people', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)

    // Só quem tem acesso à timeline pode ser marcado — marcar alguém que não
    // consegue abrir a página seria mandar a pessoa para uma porta fechada.
    const people = await prisma.user.findMany({
      where:   { isActive: true, OR: [{ role: 'ADMIN' }, { timelineAccess: true }] },
      select:  { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({ people })
  })

  // ── GET /timeline/access — lista de quem tem acesso (ADMIN) ──
  // Vive aqui, e não em admin.routes, porque a tela que consome isso é a
  // própria Timeline: o admin gerencia as pessoas de dentro dela.
  app.get('/timeline/access', { preHandler: [authenticate] }, async (request, reply) => {
    requireAdminUser(request)

    const users = await prisma.user.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, email: true, role: true, avatarUrl: true, timelineAccess: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({ users })
  })

  // ── PATCH /timeline/access/:userId (ADMIN) ───────────────
  app.patch('/timeline/access/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    requireAdminUser(request)

    const { userId } = request.params as { userId: string }
    const { hasAccess } = request.body as { hasAccess?: boolean }
    if (typeof hasAccess !== 'boolean') throw new AppError('Informe hasAccess (true ou false).', 400)

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { timelineAccess: hasAccess },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, timelineAccess: true },
    })

    return reply.send({ user })
  })

  // ── GET /timeline/documents/:id ──────────────────────────
  app.get('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)
    const { id } = request.params as { id: string }
    return reply.send({ document: await getDocument(id) })
  })

  // ── POST /timeline/documents ─────────────────────────────
  app.post('/timeline/documents', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)

    const body = request.body as {
      name?: string; description?: string; date?: string; mentionedUserIds?: string[]
    }
    if (!body.name)  throw new AppError('Informe o nome do documento.', 400)
    if (!body.date)  throw new AppError('Informe a data do documento.', 400)

    const document = await createDocument({
      name:             body.name,
      description:      body.description,
      date:             body.date,
      mentionedUserIds: Array.isArray(body.mentionedUserIds) ? body.mentionedUserIds : [],
      author:           { id: request.user.id, name: request.user.name },
    })

    return reply.status(201).send({ document })
  })

  // ── POST /timeline/documents/:id/files ───────────────────
  app.post('/timeline/documents/:id/files', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)
    const { id } = request.params as { id: string }

    const data = await request.file()
    if (!data) throw new AppError('Nenhum arquivo enviado.', 400)

    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of data.file) {
      total += chunk.length
      if (total > MAX_FILE_BYTES) throw new AppError('Arquivo muito grande (máximo 50 MB).', 413)
      chunks.push(chunk)
    }
    if (total === 0) throw new AppError('O arquivo está vazio.', 400)

    const file = await attachFile({
      documentId:   id,
      originalName: data.filename,
      mimeType:     data.mimetype,
      content:      Buffer.concat(chunks),
      uploadedById: request.user.id,
    })

    return reply.status(201).send({ file })
  })

  // ── PATCH /timeline/documents/:id — editar texto ─────────
  // Autor ou ADMIN. A regra fica no serviço, não aqui.
  app.patch('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)

    const { id } = request.params as { id: string }
    const body   = request.body as { name?: string; description?: string | null }

    if (body.name === undefined && body.description === undefined) {
      throw new AppError('Nada para alterar.', 400)
    }

    const document = await updateDocument(id, body, request.user)
    return reply.send({ document })
  })

  // ── PATCH /timeline/mentions/:id/reply ───────────────────
  app.patch('/timeline/mentions/:id/reply', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)
    const { id }    = request.params as { id: string }
    const { reply: text } = request.body as { reply?: string }

    if (!text) throw new AppError('Escreva uma resposta.', 400)

    const document = await replyToMention(id, text, request.user)
    return reply.send({ document })
  })

  // ── DELETE /timeline/documents/:id (ADMIN) ───────────────
  app.delete('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)
    const { id } = request.params as { id: string }

    await deleteDocument(id, request.user)
    return reply.send({ message: 'Documento excluído. A pasta e os arquivos continuam no Drive.' })
  })

  // ── DELETE /timeline/documents/:id/files/:fileId (ADMIN) ──
  // Tira o arquivo da listagem. Não apaga nada do Google Drive.
  app.delete('/timeline/documents/:id/files/:fileId', { preHandler: [authenticate] }, async (request, reply) => {
    await requireTimelineAccess(request)
    const { fileId } = request.params as { id: string; fileId: string }

    const document = await removeFile(fileId, request.user)
    return reply.send({ document })
  })
}
