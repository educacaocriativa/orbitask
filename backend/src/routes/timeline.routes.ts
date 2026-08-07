import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import {
  getMonth,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  attachFile,
  removeFile,
  decideApproval,
  listTimelineBoards,
  createTimelineBoard,
  listBoardPeople,
  setBoardMembership,
  addPersonToBoard,
  listOrphanDocuments,
  assertTimelineMember,
  assertAdmin,
  MAX_FILE_BYTES,
} from '../services/TimelineService'
import { prisma } from '../database/prisma'

/**
 * Rotas da Timeline.
 *
 * Não há mais permissão global: qualquer usuário logado abre a tela e enxerga
 * os projetos onde foi incluído. O controle é por projeto, via
 * `assertTimelineMember`.
 */
export async function timelineRoutes(app: FastifyInstance) {
  // ── GET /timeline/boards — tela de seleção ───────────────
  app.get('/timeline/boards', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send(await listTimelineBoards(request.user))
  })

  // ── POST /timeline/boards — projeto só da timeline (ADMIN) ──
  app.post('/timeline/boards', { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as { title?: string; description?: string; color?: string; memberIds?: string[] }
    if (!body.title) throw new AppError('Informe o nome do projeto.', 400)

    const board = await createTimelineBoard({
      title:       body.title,
      description: body.description,
      color:       body.color,
      memberIds:   Array.isArray(body.memberIds) ? body.memberIds : [],
    }, request.user)

    return reply.status(201).send({ board })
  })

  // ── GET /timeline/boards/:boardId/people (ADMIN) ─────────
  app.get('/timeline/boards/:boardId/people', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    return reply.send(await listBoardPeople(boardId, request.user))
  })

  // ── PATCH /timeline/boards/:boardId/people/:userId (ADMIN) ──
  app.patch('/timeline/boards/:boardId/people/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId, userId } = request.params as { boardId: string; userId: string }
    const { isMember } = request.body as { isMember?: boolean }
    if (typeof isMember !== 'boolean') throw new AppError('Informe isMember (true ou false).', 400)

    return reply.send(await setBoardMembership(boardId, userId, isMember, request.user))
  })

  // ── POST /timeline/boards/:boardId/people (ADMIN) ────────
  // Inclui a pessoa no projeto E na timeline. É o único caminho para um
  // projeto criado pela Timeline, que não tem quadro de missões.
  app.post('/timeline/boards/:boardId/people', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string }
    const { userId }  = request.body as { userId?: string }
    if (!userId) throw new AppError('Informe a pessoa.', 400)

    return reply.status(201).send(await addPersonToBoard(boardId, userId, request.user))
  })

  // ── GET /timeline/orphans — documentos sem projeto (ADMIN) ──
  app.get('/timeline/orphans', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send({ documents: await listOrphanDocuments(request.user) })
  })

  // ── GET /timeline?boardId=&year=&month= ──────────────────
  app.get('/timeline', { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as { boardId?: string; year?: string; month?: string; orphans?: string }

    // Sem boardId, devolve os órfãos — a área de realocação do admin.
    const wantsOrphans = query.orphans === 'true' || !query.boardId
    if (wantsOrphans) {
      assertAdmin(request.user, 'ver documentos sem projeto')
    } else {
      await assertTimelineMember(query.boardId!, request.user)
    }

    const now   = new Date()
    const year  = query.year  ? Number(query.year)  : now.getFullYear()
    const month = query.month ? Number(query.month) : now.getMonth() + 1
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new AppError('Ano ou mês inválido.', 400)
    }

    return reply.send(await getMonth(year, month, wantsOrphans ? null : query.boardId!))
  })

  // ── GET /timeline/people?boardId= — quem pode ser marcado ──
  app.get('/timeline/people', { preHandler: [authenticate] }, async (request, reply) => {
    const { boardId } = request.query as { boardId?: string }
    if (!boardId) throw new AppError('Informe o projeto.', 400)
    await assertTimelineMember(boardId, request.user)

    // Só quem participa da timeline do projeto pode ser marcado — marcar alguém
    // que não consegue abrir a página seria mandá-lo para uma porta fechada.
    const members = await prisma.timelineMember.findMany({
      where:   { boardId, user: { isActive: true } },
      select:  { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { user: { name: 'asc' } },
    })

    return reply.send({ people: members.map((m) => m.user) })
  })

  // ── GET /timeline/documents/:id ──────────────────────────
  app.get('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const document = await getDocument(id)
    if (document.boardId) await assertTimelineMember(document.boardId, request.user)
    else assertAdmin(request.user, 'ver documentos sem projeto')

    return reply.send({ document })
  })

  // ── POST /timeline/documents ─────────────────────────────
  app.post('/timeline/documents', { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as {
      boardId?: string; name?: string; description?: string; date?: string
      approverIds?: string[]; mentionIds?: string[]
    }
    if (!body.boardId) throw new AppError('Informe o projeto.', 400)
    if (!body.name)    throw new AppError('Informe o nome do documento.', 400)
    if (!body.date)    throw new AppError('Informe a data do documento.', 400)

    await assertTimelineMember(body.boardId, request.user)

    const document = await createDocument({
      boardId:     body.boardId,
      name:        body.name,
      description: body.description,
      date:        body.date,
      approverIds: Array.isArray(body.approverIds) ? body.approverIds : [],
      mentionIds:  Array.isArray(body.mentionIds)  ? body.mentionIds  : [],
      author:      { id: request.user.id, name: request.user.name },
    })

    return reply.status(201).send({ document })
  })

  // ── POST /timeline/documents/:id/files ───────────────────
  app.post('/timeline/documents/:id/files', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await assertDocumentAccess(id, request.user)

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

  // ── PATCH /timeline/documents/:id — texto e realocação ───
  app.patch('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body   = request.body as { name?: string; description?: string | null; boardId?: string }

    if (body.name === undefined && body.description === undefined && body.boardId === undefined) {
      throw new AppError('Nada para alterar.', 400)
    }
    await assertDocumentAccess(id, request.user)

    const document = await updateDocument(id, body, request.user)
    return reply.send({ document })
  })

  // ── PATCH /timeline/mentions/:id/approval ────────────────
  // Registra aprovação ou reprovação. Não altera nem bloqueia o documento.
  app.patch('/timeline/mentions/:id/approval', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body   = request.body as { approval?: string; comment?: string }

    if (body.approval !== 'APPROVED' && body.approval !== 'REJECTED') {
      throw new AppError('Informe a decisão (APPROVED ou REJECTED).', 400)
    }

    const mention = await prisma.timelineMention.findUnique({
      where:  { id },
      select: { documentId: true },
    })
    if (!mention) throw new AppError('Marcação não encontrada', 404)
    await assertDocumentAccess(mention.documentId, request.user)

    const document = await decideApproval(
      id, { approval: body.approval, comment: body.comment }, request.user,
    )
    return reply.send({ document })
  })

  // ── DELETE /timeline/documents/:id (ADMIN) ───────────────
  app.delete('/timeline/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteDocument(id, request.user)
    return reply.send({ message: 'Documento excluído. A pasta e os arquivos continuam no Drive.' })
  })

  // ── DELETE /timeline/documents/:id/files/:fileId (ADMIN) ──
  // Tira o arquivo da listagem. Não apaga nada do Google Drive.
  app.delete('/timeline/documents/:id/files/:fileId', { preHandler: [authenticate] }, async (request, reply) => {
    const { fileId } = request.params as { id: string; fileId: string }
    const document = await removeFile(fileId, request.user)
    return reply.send({ document })
  })
}

/**
 * Um documento herda o controle de acesso do seu projeto. Órfão (sem projeto)
 * é território de ADMIN até alguém realocá-lo.
 */
async function assertDocumentAccess(documentId: string, user: { id: string; role: string }) {
  const document = await prisma.timelineDocument.findUnique({
    where:  { id: documentId },
    select: { boardId: true },
  })
  if (!document) throw new AppError('Documento não encontrado', 404)

  if (document.boardId) await assertTimelineMember(document.boardId, user)
  else assertAdmin(user, 'mexer em documentos sem projeto')
}
