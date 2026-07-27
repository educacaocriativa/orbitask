/**
 * Backfill da trilha de auditoria (activity_events).
 *
 * Reconstrói o histórico anterior ao deploy a partir do que sobrou espalhado
 * pelo banco. Tudo que sai daqui vai marcado com `isBackfilled = true` e a tela
 * sinaliza essas linhas — o passado reconstruído tem buracos conhecidos e o
 * relatório não pode fingir que não tem.
 *
 * Fontes, em ordem de confiança:
 *
 *   CARD_MOVED     AccessLog 'CARD_MOVED'  (tem userId real)
 *                  + NotificationQueue CARD_MOVED para o que o log não cobre
 *                    (payload.movedBy é só o NOME — casamento por User.name)
 *   FILE_UPLOADED  AccessLog 'FILE_UPLOADED' + tabela File para o restante
 *   CARD_CREATED   AccessLog 'CARD_CREATED' + tabela Card para o restante
 *   CARD_ARCHIVED  AccessLog 'CARD_ARCHIVED'
 *   CARD_RESTORED  AccessLog 'CARD_RESTORED'
 *   FILE_DELETED   impossível — hard delete sem rastro
 *   FOLDER_CREATED impossível — nunca foi registrado
 *
 * Uso:  npm run db:backfill-activity  [-- --force]
 *       --force apaga as linhas de backfill anteriores e refaz. Nunca toca em
 *       evento gravado em tempo real.
 */
import { prisma } from './prisma'
import { recordActivityBatch, type RecordActivityInput } from '../services/ActivityService'

const UNKNOWN_ACTOR = { id: '', name: '(não registrado)', email: '' }

/** Janela para considerar que um AccessLog e uma NotificationQueue são o mesmo move. */
const DEDUPE_WINDOW_MS = 120_000

const INSERT_CHUNK = 1_000

type CardInfo   = { id: string; title: string; boardId: string; boardTitle: string; columnId: string; columnTitle: string; driveFolderUrl: string | null }
type ColumnInfo = { id: string; title: string; driveFolderUrl: string | null }
type UserInfo   = { id: string; name: string; email: string }

function folderLabel(columnTitle: string, cardTitle: string) {
  return `${columnTitle} / ${cardTitle}`
}

function str(json: unknown, key: string): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  const value = (json as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function num(json: unknown, key: string): number | undefined {
  if (!json || typeof json !== 'object') return undefined
  const value = (json as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

async function main() {
  const force = process.argv.includes('--force')

  const existing = await prisma.activityEvent.count()
  if (existing > 0 && !force) {
    console.log(`activity_events já tem ${existing} linha(s). Nada a fazer.`)
    console.log('Para refazer só as linhas reconstruídas: npm run db:backfill-activity -- --force')
    return
  }
  if (force) {
    const removed = await prisma.activityEvent.deleteMany({ where: { isBackfilled: true } })
    console.log(`--force: ${removed.count} linha(s) de backfill anterior removidas.`)
  }

  // ── Índices em memória ───────────────────────────────────────────────────
  console.log('Carregando referências...')

  const users = new Map<string, UserInfo>()
  const usersByName = new Map<string, UserInfo[]>()
  for (const u of await prisma.user.findMany({ select: { id: true, name: true, email: true } })) {
    users.set(u.id, u)
    usersByName.set(u.name, [...(usersByName.get(u.name) ?? []), u])
  }

  const columns = new Map<string, ColumnInfo>()
  const columnsByBoardAndTitle = new Map<string, ColumnInfo>()
  for (const c of await prisma.column.findMany({ select: { id: true, title: true, boardId: true, driveFolderUrl: true } })) {
    const info = { id: c.id, title: c.title, driveFolderUrl: c.driveFolderUrl }
    columns.set(c.id, info)
    columnsByBoardAndTitle.set(`${c.boardId}::${c.title}`, info)
  }

  const cards = new Map<string, CardInfo>()
  for (const c of await prisma.card.findMany({
    select: {
      id: true, title: true, boardId: true, driveFolderUrl: true, currentColumnId: true,
      board: { select: { title: true } },
      currentColumn: { select: { id: true, title: true } },
    },
  })) {
    cards.set(c.id, {
      id:             c.id,
      title:          c.title,
      boardId:        c.boardId,
      boardTitle:     c.board.title,
      columnId:       c.currentColumn.id,
      columnTitle:    c.currentColumn.title,
      driveFolderUrl: c.driveFolderUrl,
    })
  }

  console.log(`  ${users.size} usuários, ${columns.size} etapas, ${cards.size} missões`)

  const events: RecordActivityInput[] = []
  const skipped = { noCard: 0, noActor: 0, ambiguousName: 0 }

  const actorOf = (userId: string | null | undefined) =>
    (userId && users.get(userId)) || UNKNOWN_ACTOR

  /** Resolve a etapa pelo título dentro do projeto — o log antigo só guardou o nome. */
  const columnByTitle = (boardId: string, title?: string) =>
    title ? columnsByBoardAndTitle.get(`${boardId}::${title}`) : undefined

  // ── CARD_MOVED via AccessLog ─────────────────────────────────────────────
  const movesByCard = new Map<string, Array<{ at: Date; toTitle?: string }>>()

  const moveLogs = await prisma.accessLog.findMany({
    where:   { action: 'CARD_MOVED' },
    orderBy: { createdAt: 'asc' },
  })
  for (const log of moveLogs) {
    const cardId = str(log.metadata, 'cardId')
    const card   = cardId ? cards.get(cardId) : undefined
    if (!card) { skipped.noCard++; continue }

    const fromTitle = str(log.metadata, 'fromColumnTitle')
    const toTitle   = str(log.metadata, 'toColumnTitle')
    const fromCol   = columnByTitle(card.boardId, fromTitle)
    const toCol     = columnByTitle(card.boardId, toTitle)

    events.push({
      type:          'CARD_MOVED',
      actor:         actorOf(log.userId),
      boardId:       card.boardId,
      boardTitle:    card.boardTitle,
      cardId:        card.id,
      cardTitle:     str(log.metadata, 'cardTitle') ?? card.title,
      columnId:      fromCol?.id ?? null,
      columnTitle:   fromTitle ?? null,
      toColumnId:    toCol?.id ?? null,
      toColumnTitle: toTitle ?? null,
      folderName:    toTitle ? folderLabel(toTitle, card.title) : null,
      folderUrl:     toCol?.driveFolderUrl ?? null,
      occurredAt:    log.createdAt,
      isBackfilled:  true,
    })

    movesByCard.set(card.id, [...(movesByCard.get(card.id) ?? []), { at: log.createdAt, toTitle }])
  }
  console.log(`CARD_MOVED via AccessLog: ${moveLogs.length}`)

  // ── CARD_MOVED via NotificationQueue (o que o AccessLog não cobre) ────────
  const moveNotifications = await prisma.notificationQueue.findMany({
    where:   { type: 'CARD_MOVED' },
    orderBy: { createdAt: 'asc' },
  })

  let fromNotifications = 0
  for (const n of moveNotifications) {
    const card = n.cardId ? cards.get(n.cardId) : undefined
    if (!card) { skipped.noCard++; continue }

    const toTitle   = str(n.payload, 'toColumn')
    const fromTitle = str(n.payload, 'fromColumn')

    const alreadyLogged = (movesByCard.get(card.id) ?? []).some(
      (m) => m.toTitle === toTitle && Math.abs(m.at.getTime() - n.createdAt.getTime()) <= DEDUPE_WINDOW_MS,
    )
    if (alreadyLogged) continue

    // payload.movedBy guarda o NOME, não o id. Nome repetido entre dois usuários
    // fica sem autor — chutar quem foi seria pior que admitir que não se sabe.
    const movedByName = str(n.payload, 'movedBy')
    const candidates  = movedByName ? usersByName.get(movedByName) ?? [] : []
    let actor: UserInfo = UNKNOWN_ACTOR
    if (candidates.length === 1) {
      actor = candidates[0]
    } else if (candidates.length > 1) {
      actor = { id: '', name: movedByName!, email: '' }
      skipped.ambiguousName++
    } else if (movedByName) {
      actor = { id: '', name: movedByName, email: '' }
      skipped.noActor++
    } else {
      skipped.noActor++
    }

    const toCol   = n.columnId ? columns.get(n.columnId) : columnByTitle(card.boardId, toTitle)
    const fromCol = columnByTitle(card.boardId, fromTitle)

    events.push({
      type:          'CARD_MOVED',
      actor,
      boardId:       card.boardId,
      boardTitle:    card.boardTitle,
      cardId:        card.id,
      cardTitle:     card.title,
      columnId:      fromCol?.id ?? null,
      columnTitle:   fromTitle ?? null,
      toColumnId:    toCol?.id ?? n.columnId ?? null,
      toColumnTitle: toTitle ?? toCol?.title ?? null,
      folderName:    toTitle ? folderLabel(toTitle, card.title) : null,
      folderUrl:     toCol?.driveFolderUrl ?? null,
      occurredAt:    n.createdAt,
      isBackfilled:  true,
    })
    fromNotifications++
  }
  console.log(`CARD_MOVED via NotificationQueue (não cobertos pelo log): ${fromNotifications}`)

  // ── FILE_UPLOADED via AccessLog ──────────────────────────────────────────
  const coveredFileIds = new Set<string>()

  const uploadLogs = await prisma.accessLog.findMany({ where: { action: 'FILE_UPLOADED' } })
  for (const log of uploadLogs) {
    const cardId = str(log.metadata, 'cardId')
    const card   = cardId ? cards.get(cardId) : undefined
    if (!card) { skipped.noCard++; continue }

    const fileId = str(log.metadata, 'fileId')
    if (fileId) coveredFileIds.add(fileId)

    const columnTitle = str(log.metadata, 'columnTitle') ?? card.columnTitle
    const column      = columnByTitle(card.boardId, columnTitle)

    events.push({
      type:        'FILE_UPLOADED',
      actor:       actorOf(log.userId),
      boardId:     card.boardId,
      boardTitle:  card.boardTitle,
      cardId:      card.id,
      cardTitle:   card.title,
      columnId:    column?.id ?? null,
      columnTitle,
      folderName:  folderLabel(columnTitle, card.title),
      folderUrl:   card.driveFolderUrl,
      detail: {
        fileId,
        fileName:      str(log.metadata, 'fileName'),
        fileSizeBytes: num(log.metadata, 'sizeBytes'),
      },
      occurredAt:   log.createdAt,
      isBackfilled: true,
    })
  }
  console.log(`FILE_UPLOADED via AccessLog: ${uploadLogs.length}`)

  // ── FILE_UPLOADED via tabela File (uploads anteriores ao log) ────────────
  const files = await prisma.file.findMany({
    select: {
      id: true, originalName: true, sizeBytes: true, mimeType: true, createdAt: true, uploadedById: true,
      cardSection: {
        select: {
          driveFolderUrl: true,
          column: { select: { id: true, title: true } },
          card:   { select: { id: true, title: true, boardId: true, board: { select: { title: true } } } },
        },
      },
    },
  })

  let fromFileTable = 0
  for (const f of files) {
    if (coveredFileIds.has(f.id)) continue
    const section = f.cardSection

    events.push({
      type:        'FILE_UPLOADED',
      actor:       actorOf(f.uploadedById),
      boardId:     section.card.boardId,
      boardTitle:  section.card.board.title,
      cardId:      section.card.id,
      cardTitle:   section.card.title,
      columnId:    section.column.id,
      columnTitle: section.column.title,
      folderName:  folderLabel(section.column.title, section.card.title),
      folderUrl:   section.driveFolderUrl,
      detail: {
        fileId:        f.id,
        fileName:      f.originalName,
        fileSizeBytes: f.sizeBytes,
        mimeType:      f.mimeType,
      },
      occurredAt:   f.createdAt,
      isBackfilled: true,
    })
    fromFileTable++
  }
  console.log(`FILE_UPLOADED via tabela File (não cobertos pelo log): ${fromFileTable}`)

  // ── CARD_CREATED via AccessLog ───────────────────────────────────────────
  const coveredCardIds = new Set<string>()

  const createLogs = await prisma.accessLog.findMany({ where: { action: 'CARD_CREATED' } })
  for (const log of createLogs) {
    const cardId = str(log.metadata, 'cardId')
    const card   = cardId ? cards.get(cardId) : undefined
    if (!card) { skipped.noCard++; continue }
    coveredCardIds.add(card.id)

    const columnTitle = str(log.metadata, 'columnTitle') ?? card.columnTitle
    const column      = columnByTitle(card.boardId, columnTitle)

    events.push({
      type:        'CARD_CREATED',
      actor:       actorOf(log.userId),
      boardId:     card.boardId,
      boardTitle:  card.boardTitle,
      cardId:      card.id,
      cardTitle:   str(log.metadata, 'cardTitle') ?? card.title,
      columnId:    column?.id ?? null,
      columnTitle,
      folderName:  folderLabel(columnTitle, card.title),
      folderUrl:   card.driveFolderUrl,
      occurredAt:  log.createdAt,
      isBackfilled: true,
    })
  }
  console.log(`CARD_CREATED via AccessLog: ${createLogs.length}`)

  // ── CARD_CREATED via tabela Card (criações anteriores ao log) ────────────
  const cardCreators = await prisma.card.findMany({ select: { id: true, creatorId: true, createdAt: true } })

  let fromCardTable = 0
  for (const c of cardCreators) {
    if (coveredCardIds.has(c.id)) continue
    const card = cards.get(c.id)
    if (!card) continue

    events.push({
      type:        'CARD_CREATED',
      actor:       actorOf(c.creatorId),
      boardId:     card.boardId,
      boardTitle:  card.boardTitle,
      cardId:      card.id,
      cardTitle:   card.title,
      columnId:    card.columnId,
      columnTitle: card.columnTitle,
      folderName:  folderLabel(card.columnTitle, card.title),
      folderUrl:   card.driveFolderUrl,
      occurredAt:  c.createdAt,
      isBackfilled: true,
    })
    fromCardTable++
  }
  console.log(`CARD_CREATED via tabela Card (não cobertos pelo log): ${fromCardTable}`)

  // ── CARD_ARCHIVED / CARD_RESTORED via AccessLog ──────────────────────────
  for (const [action, type, columnKey] of [
    ['CARD_ARCHIVED', 'CARD_ARCHIVED', 'fromColumnId'],
    ['CARD_RESTORED', 'CARD_RESTORED', 'toColumnId'],
  ] as const) {
    const logs = await prisma.accessLog.findMany({ where: { action } })
    for (const log of logs) {
      const cardId = str(log.metadata, 'cardId')
      const card   = cardId ? cards.get(cardId) : undefined
      if (!card) { skipped.noCard++; continue }

      const column = columns.get(str(log.metadata, columnKey) ?? '')
      const title  = column?.title ?? card.columnTitle

      events.push({
        type,
        actor:       actorOf(log.userId),
        boardId:     card.boardId,
        boardTitle:  card.boardTitle,
        cardId:      card.id,
        cardTitle:   str(log.metadata, 'cardTitle') ?? card.title,
        columnId:    column?.id ?? null,
        columnTitle: title,
        folderName:  folderLabel(title, card.title),
        folderUrl:   card.driveFolderUrl,
        occurredAt:  log.createdAt,
        isBackfilled: true,
      })
    }
    console.log(`${type} via AccessLog: ${logs.length}`)
  }

  // ── Gravação ─────────────────────────────────────────────────────────────
  events.sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0))

  let written = 0
  for (let i = 0; i < events.length; i += INSERT_CHUNK) {
    written += await recordActivityBatch(events.slice(i, i + INSERT_CHUNK))
    process.stdout.write(`\r  gravando... ${written}/${events.length}`)
  }
  process.stdout.write('\n')

  const oldest = events[0]?.occurredAt
  console.log(`\n${written} evento(s) reconstruído(s).`)
  if (oldest) console.log(`Evento mais antigo: ${oldest.toLocaleDateString('pt-BR')}`)
  console.log(`Descartados — missão inexistente: ${skipped.noCard}, autor não identificado: ${skipped.noActor}, nome ambíguo: ${skipped.ambiguousName}`)
  console.log('\nLembre: FILE_DELETED e FOLDER_CREATED não têm como ser reconstruídos e só existem daqui pra frente.')
}

main()
  .catch((err) => {
    console.error('Backfill falhou:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
