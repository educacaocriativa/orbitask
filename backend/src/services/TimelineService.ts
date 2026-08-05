import { prisma } from '../database/prisma'
import { AppError } from '../utils/AppError'
import { googleDrive } from './GoogleDriveService'
import { enqueueNotification } from '../jobs/notificationQueue'
import { NotificationType } from '@prisma/client'

/**
 * Linha do tempo global da empresa.
 *
 * Uma data só aceita documento novo quando está liberada — ver `isDateOpen`.
 * A pasta no Drive fica em TIMELINE / AAAA-MM / DD - Nome do documento.
 */

const TIMELINE_ROOT_NAME = 'TIMELINE'

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// ── Datas ──────────────────────────────────────────────────────────────────

/**
 * O dia da linha do tempo é um dia de calendário, não um instante.
 *
 * Uma coluna `@db.Date` volta do Prisma como meia-noite UTC. Se escrevêssemos
 * meia-noite LOCAL e lêssemos com getters locais, o dia mudaria na ida e na
 * volta: em GMT-3, `2026-08-08T00:00Z` lido localmente é 07/08 21:00, e o
 * documento apareceria um dia antes na tela. Por isso tudo aqui — gravação,
 * leitura e comparação — usa meia-noite UTC como representação única do dia.
 */
export function parseDateOnly(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.slice(0, 10))
  if (!match) throw new AppError('Data inválida. Use o formato AAAA-MM-DD.', 400)

  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (Number.isNaN(date.getTime())) throw new AppError('Data inválida.', 400)
  return date
}

/** AAAA-MM-DD lido em UTC — o par de `parseDateOnly`. */
export function formatDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** Meia-noite UTC do dia que é "hoje" para quem está olhando (fuso do servidor). */
function startOfToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * Regra de liberação da data, como definida pelo cliente:
 *
 *   hoje ou futuro          -> aberta
 *   passado COM documento   -> aberta (continua recebendo)
 *   passado VAZIA           -> travada
 *
 * Vale para o backend também, não só para esconder o botão na tela: uma trava
 * que só existe no frontend não é trava.
 */
export function isDateOpen(date: Date, documentCount: number): boolean {
  // Normaliza para meia-noite UTC — a mesma representação de parseDateOnly.
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  if (day.getTime() >= startOfToday().getTime()) return true
  return documentCount > 0
}

// ── Acesso ─────────────────────────────────────────────────────────────────

/**
 * Confere o acesso no BANCO, não no JWT.
 *
 * O token é assinado no login e carrega a flag daquele momento. Se lêssemos
 * dele, conceder acesso só valeria no próximo login do usuário, e revogar não
 * valeria até o token expirar. Uma consulta por chave primária é barata perto
 * de errar quem entra.
 */
export async function canAccessTimeline(user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'ADMIN') return true

  const record = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { timelineAccess: true, isActive: true },
  })
  return record?.isActive === true && record.timelineAccess === true
}

// ── Consulta ───────────────────────────────────────────────────────────────

export interface TimelineMonth {
  year:  number
  month: number // 1-12
  label: string
  days: Array<{
    date:      string
    isOpen:    boolean
    isToday:   boolean
    isPast:    boolean
    documents: Array<Awaited<ReturnType<typeof getDocument>>>
  }>
}

const DOCUMENT_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  files: {
    orderBy: { createdAt: 'asc' as const },
    include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
  },
  mentions: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      mentionedUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
      mentionedBy:   { select: { id: true, name: true, avatarUrl: true } },
      repliedBy:     { select: { id: true, name: true, avatarUrl: true } },
    },
  },
}

/**
 * Devolve o mês inteiro, dia a dia — inclusive os dias sem documento, que a
 * tela precisa desenhar (apagados quando travados).
 */
export async function getMonth(year: number, month: number): Promise<TimelineMonth> {
  if (month < 1 || month > 12) throw new AppError('Mês inválido.', 400)

  const start = new Date(Date.UTC(year, month - 1, 1))
  // Dia 0 do mês seguinte é o último deste mês.
  const end   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  const lastDay = end.getUTCDate()

  const documents = await prisma.timelineDocument.findMany({
    where:   { date: { gte: start, lte: end } },
    include: DOCUMENT_INCLUDE,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })

  const byDay = new Map<string, typeof documents>()
  for (const doc of documents) {
    const key = formatDateOnly(doc.date)
    byDay.set(key, [...(byDay.get(key) ?? []), doc])
  }

  const todayKey = formatDateOnly(startOfToday())
  const days: TimelineMonth['days'] = []

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(year, month - 1, d))
    const key  = formatDateOnly(date)
    const docs = byDay.get(key) ?? []

    days.push({
      date:      key,
      isOpen:    isDateOpen(date, docs.length),
      isToday:   key === todayKey,
      isPast:    date.getTime() < startOfToday().getTime(),
      documents: docs as never,
    })
  }

  return { year, month, label: `${MONTH_NAMES[month - 1]} de ${year}`, days }
}

export async function getDocument(id: string) {
  const document = await prisma.timelineDocument.findUnique({
    where:   { id },
    include: DOCUMENT_INCLUDE,
  })
  if (!document) throw new AppError('Documento não encontrado', 404)
  return document
}

// ── Criação ────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  name:        string
  description?: string
  date:        string
  mentionedUserIds: string[]
  author: { id: string; name: string }
}

export async function createDocument(input: CreateDocumentInput) {
  const name = input.name.trim()
  if (!name) throw new AppError('Informe o nome do documento.', 400)
  if (name.length > 180) throw new AppError('O nome do documento é muito longo (máximo 180 caracteres).', 400)

  const date = parseDateOnly(input.date)

  const existingOnDay = await prisma.timelineDocument.count({
    where: { date },
  })
  if (!isDateOpen(date, existingOnDay)) {
    throw new AppError(
      'Esta data já passou e não recebeu nenhum documento. Não é mais possível adicionar.',
      400,
    )
  }

  const document = await prisma.timelineDocument.create({
    data: {
      name,
      description: input.description?.trim() || null,
      date,
      createdById: input.author.id,
    },
  })

  // Pasta no Drive. Falha aqui não desfaz o documento: melhor um documento sem
  // pasta, que dá para recriar, do que perder o registro que a pessoa acabou
  // de fazer.
  const folder = await ensureDocumentFolder(date, name)
  if (folder) {
    await prisma.timelineDocument.update({
      where: { id: document.id },
      data:  { driveFolderId: folder.id, driveFolderUrl: folder.url },
    })
  }

  if (input.mentionedUserIds.length > 0) {
    await processTimelineMentions({
      documentId:       document.id,
      documentName:     name,
      documentDate:     date,
      mentionedUserIds: input.mentionedUserIds,
      mentionedById:    input.author.id,
      mentionedByName:  input.author.name,
    })
  }

  return getDocument(document.id)
}

/** TIMELINE / AAAA-MM / DD - Nome do documento */
async function ensureDocumentFolder(date: Date, name: string) {
  if (!googleDrive.isConfigured) return null

  const root = await googleDrive.ensureFolder(TIMELINE_ROOT_NAME, googleDrive.rootFolderId)
  if (!root) return null

  // getUTC*: a data é meia-noite UTC (ver parseDateOnly). Com getters locais a
  // pasta do dia 01 cairia no mês anterior.
  const monthName = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const month = await googleDrive.ensureFolder(monthName, root.id)
  if (!month) return null

  const safeName = name.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 120)
  const dayPrefix = String(date.getUTCDate()).padStart(2, '0')
  return googleDrive.createFolder(`${dayPrefix} - ${safeName}`, month.id)
}

// ── Menções ────────────────────────────────────────────────────────────────

async function processTimelineMentions(params: {
  documentId:       string
  documentName:     string
  documentDate:     Date
  mentionedUserIds: string[]
  mentionedById:    string
  mentionedByName:  string
}) {
  const users = await prisma.user.findMany({
    where:  { id: { in: params.mentionedUserIds }, isActive: true },
    select: { id: true, name: true, phoneWhatsapp: true },
  })

  for (const user of users) {
    // A unique (documentId, mentionedUserId) evita marcar a mesma pessoa duas
    // vezes; skipDuplicates não existe em create, então tratamos aqui.
    const mention = await prisma.timelineMention.upsert({
      where:  { documentId_mentionedUserId: { documentId: params.documentId, mentionedUserId: user.id } },
      update: {},
      create: {
        documentId:      params.documentId,
        mentionedUserId: user.id,
        mentionedById:   params.mentionedById,
      },
    })

    if (user.phoneWhatsapp && !mention.whatsappSent) {
      const notification = await prisma.notificationQueue.create({
        data: {
          type:         NotificationType.MENTION,
          recipientId:  user.id,
          scheduledFor: new Date(),
          payload: JSON.parse(JSON.stringify({
            source:          'timeline',
            mentionId:       mention.id,
            mentionedByName: params.mentionedByName,
            documentName:    params.documentName,
            documentDate:    formatDateOnly(params.documentDate),
          })),
        },
      })
      await enqueueNotification(NotificationType.MENTION, notification.id)
    }
  }
}

export async function replyToMention(
  mentionId: string,
  reply: string,
  user: { id: string; role: string },
) {
  const text = reply.trim()
  if (!text) throw new AppError('Escreva uma resposta.', 400)

  const mention = await prisma.timelineMention.findUnique({ where: { id: mentionId } })
  if (!mention) throw new AppError('Marcação não encontrada', 404)

  // Só quem foi marcado responde — ou o admin, para destravar quando a pessoa
  // saiu da empresa e a marcação ficou pendente.
  if (mention.mentionedUserId !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Só quem foi marcado pode responder a esta marcação.', 403)
  }

  await prisma.timelineMention.update({
    where: { id: mentionId },
    data:  { reply: text, repliedAt: new Date(), repliedById: user.id },
  })

  return getDocument(mention.documentId)
}

// ── Arquivos ───────────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 50 * 1024 * 1024

export async function attachFile(params: {
  documentId:   string
  originalName: string
  mimeType:     string
  content:      Buffer
  uploadedById: string
}) {
  const document = await prisma.timelineDocument.findUnique({
    where:  { id: params.documentId },
    select: { id: true, name: true, date: true, driveFolderId: true },
  })
  if (!document) throw new AppError('Documento não encontrado', 404)

  // A pasta pode não existir se o Drive estava fora do ar na criação.
  let folderId = document.driveFolderId
  if (!folderId) {
    const folder = await ensureDocumentFolder(document.date, document.name)
    if (folder) {
      folderId = folder.id
      await prisma.timelineDocument.update({
        where: { id: document.id },
        data:  { driveFolderId: folder.id, driveFolderUrl: folder.url },
      })
    }
  }

  if (!folderId) {
    throw new AppError('O Google Drive não está disponível agora. Tente enviar o arquivo em instantes.', 503)
  }

  const uploaded = await googleDrive.uploadFile(
    params.originalName, params.mimeType, params.content, folderId,
  )
  if (!uploaded) {
    throw new AppError('Não foi possível enviar o arquivo para o Drive. Tente de novo.', 502)
  }

  return prisma.timelineFile.create({
    data: {
      originalName: params.originalName,
      mimeType:     params.mimeType,
      sizeBytes:    params.content.length,
      driveFileId:  uploaded.id,
      driveFileUrl: uploaded.url,
      documentId:   document.id,
      uploadedById: params.uploadedById,
    },
    include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
  })
}

// ── Edição ─────────────────────────────────────────────────────────────────

/**
 * Altera nome e descrição. Só o autor ou um ADMIN — ninguém reescreve o texto
 * que outra pessoa lançou.
 */
export async function updateDocument(
  id: string,
  input: { name?: string; description?: string | null },
  user: { id: string; role: string },
) {
  const document = await prisma.timelineDocument.findUnique({
    where:  { id },
    select: { id: true, name: true, date: true, createdById: true, driveFolderId: true },
  })
  if (!document) throw new AppError('Documento não encontrado', 404)

  if (document.createdById !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Você só pode editar documentos que você mesmo lançou.', 403)
  }

  const name = input.name?.trim()
  if (input.name !== undefined) {
    if (!name) throw new AppError('O nome do documento não pode ficar vazio.', 400)
    if (name.length > 180) throw new AppError('O nome do documento é muito longo (máximo 180 caracteres).', 400)
  }

  await prisma.timelineDocument.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
    },
  })

  // A pasta no Drive carrega o nome do documento; renomear mantém as duas
  // pontas coerentes. Renomear não é destrutivo — nenhum arquivo se perde.
  // Falha aqui não desfaz a edição: o texto no Orbi é o que a pessoa vê.
  if (name && name !== document.name && document.driveFolderId) {
    const dayPrefix = String(document.date.getUTCDate()).padStart(2, '0')
    const safeName  = name.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 120)
    try {
      await googleDrive.renameFolder(document.driveFolderId, `${dayPrefix} - ${safeName}`)
    } catch (err) {
      console.error('Timeline: pasta não renomeada no Drive:', err)
    }
  }

  return getDocument(id)
}

// ── Exclusão (só ADMIN) ────────────────────────────────────────────────────

export async function deleteDocument(id: string, user: { role: string }) {
  requireAdmin(user, 'excluir documentos')

  const document = await prisma.timelineDocument.findUnique({
    where:  { id },
    select: { id: true },
  })
  if (!document) throw new AppError('Documento não encontrado', 404)

  // A pasta do Drive é preservada de propósito: o arquivo que está lá pode ser
  // a única cópia, e apagar por engano não teria volta.
  await prisma.timelineDocument.delete({ where: { id } })
}

/**
 * Tira o arquivo da listagem do documento. **Não apaga nada do Drive** — o
 * arquivo continua na pasta. Some a referência no Orbi, não o conteúdo.
 */
export async function removeFile(fileId: string, user: { role: string }) {
  requireAdmin(user, 'remover arquivos')

  const file = await prisma.timelineFile.findUnique({
    where:  { id: fileId },
    select: { id: true, documentId: true },
  })
  if (!file) throw new AppError('Arquivo não encontrado', 404)

  await prisma.timelineFile.delete({ where: { id: fileId } })
  return getDocument(file.documentId)
}

function requireAdmin(user: { role: string }, action: string) {
  if (user.role !== 'ADMIN') {
    throw new AppError(`Apenas administradores podem ${action}.`, 403)
  }
}
