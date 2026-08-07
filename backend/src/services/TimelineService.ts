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
 * Só o dia de hoje aceita documento novo. Passado e futuro são leitura.
 *
 * A linha do tempo registra o que aconteceu no dia em que aconteceu: sem isso,
 * um documento pode ser lançado com data escolhida a dedo e o registro deixa de
 * valer como prova de quando a coisa foi feita.
 *
 * Documentos já existentes em outras datas continuam visíveis e abríveis — só
 * não recebem companhia.
 *
 * `documentCount` não é mais usado; permanece na assinatura porque `getMonth`
 * a chama por dia e a regra pode voltar a depender disso.
 */
export function isDateOpen(date: Date, _documentCount = 0): boolean {
  // Normaliza para meia-noite UTC — a mesma representação de parseDateOnly.
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  return day.getTime() === startOfToday().getTime()
}

// ── Acesso ─────────────────────────────────────────────────────────────────

/**
 * Participação num projeto de timeline, conferida no BANCO e não no JWT.
 *
 * O token é assinado no login: lido dele, adicionar alguém a um projeto só
 * valeria no próximo login, e remover não valeria até o token expirar.
 *
 * Não existe mais uma permissão global de "acesso à Timeline" — a tela é aberta
 * a qualquer usuário logado, e o que ele enxerga são os projetos onde foi
 * incluído. Quem não está em nenhum vê a lista vazia, não um erro.
 */
export async function isTimelineMember(boardId: string, user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'ADMIN') return true

  // Participar da missão já dá acesso à linha do tempo dela: toda missão tem
  // timeline, e exigir uma segunda inclusão faria a missão aparecer na lista
  // e depois dar 403 ao abrir. `TimelineMember` continua existindo para
  // incluir quem NÃO é da missão — um convidado pontual.
  const [timelineMember, board] = await Promise.all([
    prisma.timelineMember.findUnique({
      where:  { boardId_userId: { boardId, userId: user.id } },
      select: { id: true },
    }),
    prisma.board.findUnique({
      where:  { id: boardId },
      select: { ownerId: true, members: { where: { userId: user.id }, select: { id: true } } },
    }),
  ])

  if (timelineMember) return true
  if (!board) return false
  return board.ownerId === user.id || board.members.length > 0
}

/** Lança 403 quando a pessoa não participa do projeto. */
export async function assertTimelineMember(boardId: string, user: { id: string; role: string }) {
  if (!(await isTimelineMember(boardId, user))) {
    throw new AppError('Você não participa da timeline deste projeto.', 403)
  }
}

/** Só ADMIN administra projeto e pessoas da timeline. */
export function assertAdmin(user: { role: string }, action: string) {
  if (user.role !== 'ADMIN') {
    throw new AppError(`Apenas administradores podem ${action}.`, 403)
  }
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
/**
 * Mês de um projeto. `boardId` null devolve os documentos órfãos — os que
 * existiam antes da separação por projeto e ainda não foram realocados.
 */
export async function getMonth(year: number, month: number, boardId: string | null): Promise<TimelineMonth> {
  if (month < 1 || month > 12) throw new AppError('Mês inválido.', 400)

  const start = new Date(Date.UTC(year, month - 1, 1))
  // Dia 0 do mês seguinte é o último deste mês.
  const end   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  const lastDay = end.getUTCDate()

  const documents = await prisma.timelineDocument.findMany({
    where:   { boardId, date: { gte: start, lte: end } },
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
  boardId:     string
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

  const board = await prisma.board.findUnique({
    where:  { id: input.boardId },
    select: { id: true, title: true },
  })
  if (!board) throw new AppError('Projeto não encontrado', 404)

  const date = parseDateOnly(input.date)

  // Validado aqui, e não só escondendo o botão na tela: uma trava que existe
  // apenas no frontend é contornável chamando a API direto.
  if (!isDateOpen(date)) {
    throw new AppError(
      'Documentos só podem ser lançados no dia de hoje. Dias anteriores e futuros são somente leitura.',
      400,
    )
  }

  const document = await prisma.timelineDocument.create({
    data: {
      name,
      description: input.description?.trim() || null,
      date,
      boardId:     board.id,
      createdById: input.author.id,
    },
  })

  // Pasta no Drive. Falha aqui não desfaz o documento: melhor um documento sem
  // pasta, que dá para recriar, do que perder o registro que a pessoa acabou
  // de fazer.
  const folder = await ensureDocumentFolder(date, name, board.title)
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
      projectTitle:     board.title,
      mentionedUserIds: input.mentionedUserIds,
      mentionedById:    input.author.id,
      mentionedByName:  input.author.name,
    })
  }

  return getDocument(document.id)
}

/** TIMELINE / Projeto / AAAA-MM / DD - Nome do documento */
async function ensureDocumentFolder(date: Date, name: string, boardTitle: string) {
  if (!googleDrive.isConfigured) return null

  const root = await googleDrive.ensureFolder(TIMELINE_ROOT_NAME, googleDrive.rootFolderId)
  if (!root) return null

  // O projeto entra no caminho para o Drive espelhar a separação da tela.
  const safeBoard = boardTitle.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 100)
  const project = await googleDrive.ensureFolder(safeBoard, root.id)
  if (!project) return null

  // getUTC*: a data é meia-noite UTC (ver parseDateOnly). Com getters locais a
  // pasta do dia 01 cairia no mês anterior.
  const monthName = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const month = await googleDrive.ensureFolder(monthName, project.id)
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
  projectTitle:     string
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
            projectTitle:    params.projectTitle,
          })),
        },
      })
      await enqueueNotification(NotificationType.MENTION, notification.id)
    }
  }
}

/**
 * Registra a decisão de quem foi marcado para aprovar.
 *
 * É apenas registro: aprovar não libera nada e reprovar não bloqueia nada —
 * o documento continua recebendo arquivo e podendo ser editado. O que muda é
 * o que a tela mostra ao lado de cada nome.
 *
 * Cada pessoa decide por si; não existe estado consolidado do documento.
 */
export async function decideApproval(
  mentionId: string,
  input: { approval: 'APPROVED' | 'REJECTED'; comment?: string },
  user: { id: string; role: string },
) {
  if (input.approval !== 'APPROVED' && input.approval !== 'REJECTED') {
    throw new AppError('Decisão inválida. Use APPROVED ou REJECTED.', 400)
  }

  const comment = input.comment?.trim() || null

  // Reprovar sem dizer por quê não serve a ninguém: quem lançou o documento
  // fica sem saber o que corrigir.
  if (input.approval === 'REJECTED' && !comment) {
    throw new AppError('Explique o motivo ao reprovar.', 400)
  }

  const mention = await prisma.timelineMention.findUnique({ where: { id: mentionId } })
  if (!mention) throw new AppError('Marcação não encontrada', 404)

  // Só quem foi marcado decide — ou o admin, para destravar quando a pessoa
  // saiu da empresa e a aprovação ficou pendente.
  if (mention.mentionedUserId !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Só quem foi marcado pode aprovar ou reprovar.', 403)
  }

  const now = new Date()
  await prisma.timelineMention.update({
    where: { id: mentionId },
    // Decidir de novo sobrescreve: mudar de ideia é legítimo e o histórico
    // não é requisito aqui.
    data: {
      approval:    input.approval,
      decidedAt:   now,
      reply:       comment,
      repliedAt:   now,
      repliedById: user.id,
    },
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
    select: {
      id: true, name: true, date: true, driveFolderId: true,
      board: { select: { title: true } },
    },
  })
  if (!document) throw new AppError('Documento não encontrado', 404)

  // A pasta pode não existir se o Drive estava fora do ar na criação.
  let folderId = document.driveFolderId
  if (!folderId) {
    // Documento órfão (sem projeto) cai numa pasta "Sem projeto", para o
    // arquivo ter onde morar até alguém realocá-lo.
    const folder = await ensureDocumentFolder(document.date, document.name, document.board?.title ?? 'Sem projeto')
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
  input: { name?: string; description?: string | null; boardId?: string },
  user: { id: string; role: string },
) {
  const document = await prisma.timelineDocument.findUnique({
    where:  { id },
    select: { id: true, name: true, date: true, createdById: true, driveFolderId: true, boardId: true },
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

  // Realocar documento é como mover pasta de lugar: só ADMIN. É o mecanismo que
  // tira os órfãos da área "Sem projeto".
  if (input.boardId !== undefined) {
    assertAdmin(user, 'mover documentos entre projetos')
    const target = await prisma.board.findUnique({ where: { id: input.boardId }, select: { id: true } })
    if (!target) throw new AppError('Projeto de destino não encontrado', 404)
  }

  await prisma.timelineDocument.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.boardId !== undefined ? { boardId: input.boardId } : {}),
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
  assertAdmin(user, 'excluir documentos')

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
  assertAdmin(user, 'remover arquivos')

  const file = await prisma.timelineFile.findUnique({
    where:  { id: fileId },
    select: { id: true, documentId: true },
  })
  if (!file) throw new AppError('Arquivo não encontrado', 404)

  await prisma.timelineFile.delete({ where: { id: fileId } })
  return getDocument(file.documentId)
}


// ── Projetos da timeline ───────────────────────────────────────────────────

/**
 * Projetos que a pessoa enxerga na tela de seleção.
 *
 * Toda missão tem linha do tempo — não existe "ativar timeline". O que muda é
 * quem enxerga cada uma: ADMIN vê todos os projetos ativos; os demais veem
 * aqueles onde participam da timeline OU já são membros do projeto.
 *
 * Incluir o membro do projeto é o que evita a tela abrir vazia: quem trabalha
 * numa missão chega na Timeline e já encontra a missão dele lá.
 */
export async function listTimelineBoards(user: { id: string; role: string }) {
  const isAdmin = user.role === 'ADMIN'

  const boards = await prisma.board.findMany({
    where: {
      isArchived: false,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { timelineMembers: { some: { userId: user.id } } },
              { members: { some: { userId: user.id } } },
              { ownerId: user.id },
            ],
          }),
    },
    select: {
      id: true, title: true, description: true, color: true, timelineOnly: true,
      driveFolderUrl: true,
      _count: { select: { timelineDocuments: true, timelineMembers: true } },
    },
    orderBy: { title: 'asc' },
  })

  // Data do documento mais recente de cada projeto, para a tela mostrar
  // "último lançamento" sem carregar todos os documentos.
  const latest = await prisma.timelineDocument.groupBy({
    by:    ['boardId'],
    where: { boardId: { in: boards.map((b) => b.id) } },
    _max:  { date: true },
  })
  const latestByBoard = new Map(latest.map((l) => [l.boardId, l._max.date]))

  // Documentos anteriores à separação por projeto. Só ADMIN pode realocá-los,
  // então só ele precisa saber que existem.
  const orphanCount = isAdmin
    ? await prisma.timelineDocument.count({ where: { boardId: null } })
    : 0

  return {
    boards: boards.map((b) => ({
      id:            b.id,
      title:         b.title,
      description:   b.description,
      color:         b.color,
      timelineOnly:  b.timelineOnly,
      driveFolderUrl: b.driveFolderUrl,
      documentCount: b._count.timelineDocuments,
      memberCount:   b._count.timelineMembers,
      lastDocumentDate: latestByBoard.get(b.id)
        ? formatDateOnly(latestByBoard.get(b.id) as Date)
        : null,
    })),
    orphanCount,
  }
}

/** Cria um projeto exclusivo da Timeline: não aparece em missões ativas. */
export async function createTimelineBoard(
  input: { title: string; description?: string; color?: string; memberIds?: string[] },
  user: { id: string; role: string },
) {
  assertAdmin(user, 'criar projetos de timeline')

  const title = input.title.trim()
  if (!title) throw new AppError('Informe o nome do projeto.', 400)

  // Toda missão já tem linha do tempo, então recriar uma que existe não é só
  // duplicidade de nome: é trabalho desnecessário. A mensagem precisa dizer
  // isso, em vez de só barrar.
  const duplicate = await prisma.board.findFirst({
    where:  { title, isArchived: false },
    select: { id: true, timelineOnly: true },
  })
  if (duplicate) {
    throw new AppError(
      duplicate.timelineOnly
        ? `Já existe um projeto de timeline chamado "${title}".`
        : `"${title}" já é uma missão e a linha do tempo dela já está disponível — procure na lista em vez de criar de novo.`,
      400,
    )
  }

  const board = await prisma.board.create({
    data: {
      title,
      description:  input.description?.trim() || null,
      color:        input.color ?? '#6366f1',
      ownerId:      user.id,
      timelineOnly: true,
      // Quem cria já participa nos dois níveis. Só timelineMembers deixaria o
      // projeto nascer violando a regra "timeline só para membro do projeto".
      members: {
        create: [...new Set(input.memberIds ?? [])]
          .filter((userId) => userId !== user.id) // o dono não precisa de linha
          .map((userId) => ({ userId, role: 'MEMBER' as const })),
      },
      timelineMembers: {
        create: [...new Set([user.id, ...(input.memberIds ?? [])])].map((userId) => ({ userId })),
      },
    },
    select: { id: true, title: true },
  })

  // Pasta raiz do projeto no Drive. Os documentos criam as subpastas de mês.
  if (googleDrive.isConfigured) {
    try {
      const root = await googleDrive.ensureFolder(TIMELINE_ROOT_NAME, googleDrive.rootFolderId)
      if (root) {
        const safe   = title.replace(/[/\?%*:|"<>]/g, '-').substring(0, 100)
        const folder = await googleDrive.ensureFolder(safe, root.id)
        if (folder) {
          await prisma.board.update({
            where: { id: board.id },
            data:  { driveFolderId: folder.id, driveFolderUrl: folder.url },
          })
        }
      }
    } catch (err) {
      console.error('Timeline: pasta do projeto não criada no Drive:', err)
    }
  }

  return board
}

// ── Pessoas do projeto ─────────────────────────────────────────────────────

/**
 * Pessoas do projeto, para o modal de gerenciamento.
 *
 * Só quem já é membro do projeto pode entrar na timeline dele — é uma porta só,
 * e não dá para burlar. `candidates` são as pessoas que ainda não fazem parte
 * do projeto, oferecidas para inclusão a partir do próprio modal, já que um
 * projeto criado pela Timeline não tem outra tela onde cadastrar membro.
 */
export async function listBoardPeople(boardId: string, user: { id: string; role: string }) {
  assertAdmin(user, 'gerenciar pessoas da timeline')

  const board = await prisma.board.findUnique({
    where:  { id: boardId },
    select: { id: true, title: true, timelineOnly: true, ownerId: true },
  })
  if (!board) throw new AppError('Projeto não encontrado', 404)

  const [users, timelineMembers, boardMembers] = await Promise.all([
    prisma.user.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, email: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.timelineMember.findMany({ where: { boardId }, select: { userId: true } }),
    prisma.boardMember.findMany({ where: { boardId }, select: { userId: true } }),
  ])

  const inTimeline = new Set(timelineMembers.map((m) => m.userId))
  // O dono do projeto participa dele mesmo sem uma linha em board_members.
  const inProject  = new Set([board.ownerId, ...boardMembers.map((m) => m.userId)])

  return {
    board: { id: board.id, title: board.title, timelineOnly: board.timelineOnly },
    people: users
      .filter((u) => inProject.has(u.id))
      .map((u) => ({ ...u, isMember: inTimeline.has(u.id), inProject: true })),
    candidates: users
      .filter((u) => !inProject.has(u.id))
      .map((u) => ({ ...u, isMember: false, inProject: false })),
  }
}

/**
 * Inclui alguém no projeto e já na timeline.
 *
 * Existe porque um projeto criado pela Timeline não tem quadro de missões onde
 * cadastrar membro — este é o único caminho. Em projeto com Kanban funciona
 * igual, e a pessoa passa a constar também como membro do projeto.
 */
export async function addPersonToBoard(
  boardId: string,
  userId: string,
  user: { id: string; role: string },
) {
  assertAdmin(user, 'adicionar pessoas ao projeto')

  const [board, target] = await Promise.all([
    prisma.board.findUnique({ where: { id: boardId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } }),
  ])
  if (!board)  throw new AppError('Projeto não encontrado', 404)
  if (!target) throw new AppError('Usuário não encontrado', 404)
  if (!target.isActive) throw new AppError('Este usuário está inativo.', 400)

  await prisma.$transaction([
    prisma.boardMember.upsert({
      where:  { boardId_userId: { boardId, userId } },
      update: {},
      create: { boardId, userId, role: 'MEMBER' },
    }),
    prisma.timelineMember.upsert({
      where:  { boardId_userId: { boardId, userId } },
      update: {},
      create: { boardId, userId },
    }),
  ])

  return { userId, isMember: true, inProject: true }
}

export async function setBoardMembership(
  boardId: string,
  userId: string,
  isMember: boolean,
  user: { id: string; role: string },
) {
  assertAdmin(user, 'gerenciar pessoas da timeline')

  const board = await prisma.board.findUnique({
    where: { id: boardId }, select: { id: true, ownerId: true },
  })
  if (!board) throw new AppError('Projeto não encontrado', 404)

  if (isMember) {
    // A regra "timeline só para quem está no projeto" é verificada aqui, e não
    // só escondendo opções na tela — senão bastaria chamar a API direto.
    const belongs = board.ownerId === userId || !!(await prisma.boardMember.findUnique({
      where:  { boardId_userId: { boardId, userId } },
      select: { id: true },
    }))
    if (!belongs) {
      throw new AppError(
        'Esta pessoa não faz parte do projeto. Adicione-a ao projeto primeiro.',
        400,
      )
    }

    await prisma.timelineMember.upsert({
      where:  { boardId_userId: { boardId, userId } },
      update: {},
      create: { boardId, userId },
    })
  } else {
    await prisma.timelineMember.deleteMany({ where: { boardId, userId } })
  }

  return { userId, isMember }
}

/** Documentos sem projeto, para a tela de realocação. */
export async function listOrphanDocuments(user: { id: string; role: string }) {
  assertAdmin(user, 'ver documentos sem projeto')

  return prisma.timelineDocument.findMany({
    where:   { boardId: null },
    include: DOCUMENT_INCLUDE,
    orderBy: { date: 'asc' },
  })
}
