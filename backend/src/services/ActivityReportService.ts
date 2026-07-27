import ExcelJS from 'exceljs'
import { prisma } from '../database/prisma'
import { AppError } from '../utils/AppError'
import type { ActivityEvent, ActivityType, Prisma } from '@prisma/client'

/**
 * Leitura e exportação da trilha de auditoria (ver ActivityService para a escrita).
 */

/** Teto de linhas no Excel. Acima disso o arquivo diz quantas ficaram de fora. */
const EXPORT_ROW_LIMIT = 50_000

/** Período padrão quando o usuário não informa datas. Evita varrer a tabela toda. */
const DEFAULT_PERIOD_DAYS = 30

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  CARD_MOVED:     'Missão movida',
  CARD_CREATED:   'Missão criada',
  CARD_ARCHIVED:  'Missão arquivada',
  CARD_RESTORED:  'Missão restaurada',
  FILE_UPLOADED:  'Arquivo enviado',
  FILE_DELETED:   'Arquivo excluído',
  FOLDER_CREATED: 'Pasta criada',
}

export interface ActivityReportFilters {
  boardId:   string
  from?:     string
  to?:       string
  type?:     ActivityType
  actorId?:  string
  columnId?: string
  page?:     number
  limit?:    number
}

export interface ActivityReportSummary {
  totalEvents: number
  totalActors: number
  totalCards:  number
  byType:   Array<{ type: ActivityType; label: string; count: number }>
  byActor:  Array<{ actorId: string | null; actorName: string; actorEmail: string; byType: Record<string, number>; total: number }>
  byFolder: Array<{ folderName: string; folderUrl: string | null; count: number }>
}

export interface ActivityReportResult {
  board:   { id: string; title: string }
  /** Datas puras AAAA-MM-DD em hora local — nunca ISO/UTC (ver resolvePeriod). */
  period:  { from: string; to: string }
  events:  ActivityEvent[]
  total:   number
  page:    number
  limit:   number
  summary: ActivityReportSummary
  filters: {
    actors:  Array<{ id: string | null; name: string; email: string }>
    columns: Array<{ id: string | null; title: string }>
    types:   ActivityType[]
  }
  /** Data do evento mais antigo reconstruído — a tela avisa que antes disso pode faltar coisa. */
  backfillBoundary: string | null
}

// ── Período ────────────────────────────────────────────────────────────────

/**
 * "01/07 a 27/07" precisa incluir o dia 27 inteiro. Sem normalizar o `to` para
 * 23:59:59.999 o relatório perderia silenciosamente o último dia do período.
 *
 * Devolve também as datas em texto (AAAA-MM-DD, hora local). O período NÃO pode
 * trafegar como ISO/UTC: 27/07 23:59 em GMT-3 vira 28/07 em UTC, e o usuário
 * veria um relatório de "01/07 a 28/07" que ele nunca pediu.
 */
export function resolvePeriod(from?: string, to?: string): {
  start: Date; end: Date; fromDate: string; toDate: string
} {
  const toDate   = to   ? to.slice(0, 10)   : localDate(new Date())
  const fromDate = from
    ? from.slice(0, 10)
    : localDate(new Date(new Date(`${toDate}T00:00:00.000`).getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000))

  const start = new Date(`${fromDate}T00:00:00.000`)
  const end   = new Date(`${toDate}T23:59:59.999`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError('Período inválido. Use datas no formato AAAA-MM-DD.', 400)
  }
  if (start > end) {
    throw new AppError('A data inicial não pode ser depois da data final.', 400)
  }

  return { start, end, fromDate, toDate }
}

/** AAAA-MM-DD no fuso local (toISOString converteria para UTC e mudaria o dia). */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Consulta ───────────────────────────────────────────────────────────────

export async function getActivityReport(filters: ActivityReportFilters): Promise<ActivityReportResult> {
  const board = await prisma.board.findUnique({
    where:  { id: filters.boardId },
    select: { id: true, title: true },
  })
  if (!board) throw new AppError('Projeto não encontrado', 404)

  const { start, end, fromDate, toDate } = resolvePeriod(filters.from, filters.to)

  const page  = Math.max(1, filters.page ?? 1)
  const limit = Math.min(500, Math.max(1, filters.limit ?? 100))

  // Escopo do período, sem os filtros de tipo/pessoa/etapa: é daqui que saem as
  // opções dos dropdowns. Se saíssem do resultado filtrado, escolher uma pessoa
  // apagaria todas as outras da lista.
  const periodWhere: Prisma.ActivityEventWhereInput = {
    boardId:    board.id,
    occurredAt: { gte: start, lte: end },
  }

  const where: Prisma.ActivityEventWhereInput = {
    ...periodWhere,
    ...(filters.type     ? { type: filters.type }         : {}),
    ...(filters.actorId  ? { actorId: filters.actorId }   : {}),
    ...(filters.columnId ? {
      OR: [{ columnId: filters.columnId }, { toColumnId: filters.columnId }],
    } : {}),
  }

  const [events, total, summary, filterOptions, oldestBackfilled] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.activityEvent.count({ where }),
    buildSummary(where),
    buildFilterOptions(periodWhere),
    prisma.activityEvent.findFirst({
      where:   { boardId: board.id, isBackfilled: true },
      orderBy: { occurredAt: 'asc' },
      select:  { occurredAt: true },
    }),
  ])

  return {
    board,
    period:  { from: fromDate, to: toDate },
    events,
    total,
    page,
    limit,
    summary,
    filters: filterOptions,
    backfillBoundary: oldestBackfilled?.occurredAt.toISOString() ?? null,
  }
}

async function buildSummary(where: Prisma.ActivityEventWhereInput): Promise<ActivityReportSummary> {
  const [byTypeRows, byActorRows, byFolderRows, cardRows] = await Promise.all([
    prisma.activityEvent.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.activityEvent.groupBy({
      by:     ['actorId', 'actorName', 'actorEmail', 'type'],
      where,
      _count: { _all: true },
    }),
    prisma.activityEvent.groupBy({
      by:     ['folderName', 'folderUrl'],
      where:  { ...where, folderName: { not: null } },
      _count: { _all: true },
    }),
    prisma.activityEvent.groupBy({
      by:    ['cardId'],
      where: { ...where, cardId: { not: null } },
    }),
  ])

  // groupBy devolve uma linha por (pessoa, tipo); junta por pessoa.
  const actorMap = new Map<string, ActivityReportSummary['byActor'][number]>()
  for (const row of byActorRows) {
    const key = row.actorId ?? `name:${row.actorName}`
    const entry = actorMap.get(key) ?? {
      actorId:    row.actorId,
      actorName:  row.actorName,
      actorEmail: row.actorEmail,
      byType:     {} as Record<string, number>,
      total:      0,
    }
    entry.byType[row.type] = (entry.byType[row.type] ?? 0) + row._count._all
    entry.total += row._count._all
    actorMap.set(key, entry)
  }

  return {
    totalEvents: byTypeRows.reduce((sum, r) => sum + r._count._all, 0),
    totalActors: actorMap.size,
    totalCards:  cardRows.length,
    byType: byTypeRows
      .map((r) => ({ type: r.type, label: ACTIVITY_LABEL[r.type], count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    byActor: [...actorMap.values()].sort((a, b) => b.total - a.total),
    byFolder: byFolderRows
      .map((r) => ({ folderName: r.folderName as string, folderUrl: r.folderUrl, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  }
}

async function buildFilterOptions(periodWhere: Prisma.ActivityEventWhereInput) {
  const [actorRows, typeRows, fromColumns, toColumns] = await Promise.all([
    prisma.activityEvent.groupBy({ by: ['actorId', 'actorName', 'actorEmail'], where: periodWhere }),
    prisma.activityEvent.groupBy({ by: ['type'], where: periodWhere }),
    prisma.activityEvent.groupBy({ by: ['columnId', 'columnTitle'], where: { ...periodWhere, columnId: { not: null } } }),
    prisma.activityEvent.groupBy({ by: ['toColumnId', 'toColumnTitle'], where: { ...periodWhere, toColumnId: { not: null } } }),
  ])

  // Uma etapa aparece como origem e como destino; a lista precisa de cada uma uma vez só.
  const columnMap = new Map<string, { id: string | null; title: string }>()
  for (const r of fromColumns) {
    if (r.columnId) columnMap.set(r.columnId, { id: r.columnId, title: r.columnTitle ?? '(sem nome)' })
  }
  for (const r of toColumns) {
    if (r.toColumnId) columnMap.set(r.toColumnId, { id: r.toColumnId, title: r.toColumnTitle ?? '(sem nome)' })
  }

  return {
    actors: actorRows
      .map((r) => ({ id: r.actorId, name: r.actorName, email: r.actorEmail }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    columns: [...columnMap.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    types:   typeRows.map((r) => r.type),
  }
}

/** Mesmos filtros da tela, sem paginação — é o que vai para o Excel. */
export async function getActivityForExport(filters: ActivityReportFilters) {
  const report = await getActivityReport({ ...filters, page: 1, limit: 1 })

  const { start, end } = resolvePeriod(filters.from, filters.to)
  const where: Prisma.ActivityEventWhereInput = {
    boardId:    filters.boardId,
    occurredAt: { gte: start, lte: end },
    ...(filters.type     ? { type: filters.type }       : {}),
    ...(filters.actorId  ? { actorId: filters.actorId } : {}),
    ...(filters.columnId ? {
      OR: [{ columnId: filters.columnId }, { toColumnId: filters.columnId }],
    } : {}),
  }

  const events = await prisma.activityEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take:    EXPORT_ROW_LIMIT,
  })

  return {
    ...report,
    events,
    omittedRows: Math.max(0, report.total - events.length),
  }
}

// ── Excel ──────────────────────────────────────────────────────────────────

export async function buildActivityWorkbook(
  data: Awaited<ReturnType<typeof getActivityForExport>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Orbitask'
  workbook.created = new Date()

  buildEventsSheet(workbook, data)
  buildSummarySheet(workbook, data)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function buildEventsSheet(workbook: ExcelJS.Workbook, data: Awaited<ReturnType<typeof getActivityForExport>>) {
  const sheet = workbook.addWorksheet('Eventos')

  sheet.columns = [
    { header: 'Data',          key: 'date',     width: 12 },
    { header: 'Hora',          key: 'time',     width: 9  },
    { header: 'Pessoa',        key: 'actor',    width: 26 },
    { header: 'Login',         key: 'email',    width: 30 },
    { header: 'Tipo',          key: 'type',     width: 20 },
    { header: 'Missão',        key: 'card',     width: 32 },
    { header: 'Etapa origem',  key: 'from',     width: 24 },
    { header: 'Etapa destino', key: 'to',       width: 24 },
    { header: 'Detalhe',       key: 'detail',   width: 40 },
    { header: 'Pasta',         key: 'folder',   width: 28 },
    { header: 'Link da pasta', key: 'folderUrl',width: 44 },
    { header: 'Origem do dado',key: 'source',   width: 16 },
  ]

  for (const e of data.events) {
    sheet.addRow({
      date:      e.occurredAt,
      time:      e.occurredAt,
      actor:     e.actorName,
      email:     e.actorEmail,
      type:      ACTIVITY_LABEL[e.type],
      card:      e.cardTitle ?? '',
      from:      e.columnTitle ?? '',
      to:        e.toColumnTitle ?? '',
      detail:    describeDetail(e),
      folder:    e.folderName ?? '',
      folderUrl: e.folderUrl ?? '',
      source:    e.isBackfilled ? 'Reconstruído' : 'Registrado',
    })
  }

  sheet.getColumn('date').numFmt = 'dd/mm/yyyy'
  sheet.getColumn('time').numFmt = 'hh:mm'

  styleHeader(sheet)
  if (data.events.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

function buildSummarySheet(workbook: ExcelJS.Workbook, data: Awaited<ReturnType<typeof getActivityForExport>>) {
  const sheet = workbook.addWorksheet('Resumo')
  const types = data.summary.byType.map((t) => t.type)

  sheet.addRow(['Projeto', data.board.title])
  sheet.addRow(['Período', `${formatDate(data.period.from)} a ${formatDate(data.period.to)}`])
  sheet.addRow(['Total de eventos', data.summary.totalEvents])
  sheet.addRow(['Pessoas envolvidas', data.summary.totalActors])
  sheet.addRow(['Missões envolvidas', data.summary.totalCards])
  sheet.addRow(['Gerado em', new Date().toLocaleString('pt-BR')])
  if (data.omittedRows > 0) {
    // Um relatório que corta linhas em silêncio é pior que um relatório grande.
    sheet.addRow(['ATENÇÃO', `${data.omittedRows} evento(s) não couberam no arquivo (limite de ${EXPORT_ROW_LIMIT.toLocaleString('pt-BR')} linhas). Reduza o período.`])
  }
  sheet.addRow([])

  // ── Por pessoa ──
  sheet.addRow(['POR PESSOA'])
  const actorHeaderRow = sheet.addRow([
    'Pessoa', 'Login', ...types.map((t) => ACTIVITY_LABEL[t]), 'Total',
  ])
  actorHeaderRow.font = { bold: true }

  for (const a of data.summary.byActor) {
    sheet.addRow([
      a.actorName,
      a.actorEmail,
      ...types.map((t) => a.byType[t] ?? 0),
      a.total,
    ])
  }
  const totalRow = sheet.addRow([
    'TOTAL', '',
    ...types.map((t) => data.summary.byType.find((x) => x.type === t)?.count ?? 0),
    data.summary.totalEvents,
  ])
  totalRow.font = { bold: true }

  sheet.addRow([])

  // ── Por pasta ── responde "quais pastas sofreram alteração no período"
  sheet.addRow(['POR PASTA'])
  const folderHeaderRow = sheet.addRow(['Pasta', 'Eventos', 'Link'])
  folderHeaderRow.font = { bold: true }
  for (const f of data.summary.byFolder) {
    sheet.addRow([f.folderName, f.count, f.folderUrl ?? ''])
  }

  sheet.getColumn(1).width = 30
  sheet.getColumn(2).width = 32
  for (let i = 3; i <= types.length + 3; i++) sheet.getColumn(i).width = 18
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } }
  header.alignment = { vertical: 'middle' }
  header.height = 20
}

function describeDetail(e: ActivityEvent): string {
  const detail = (e.detail ?? {}) as Record<string, unknown>

  switch (e.type) {
    case 'FILE_UPLOADED':
    case 'FILE_DELETED': {
      const name = typeof detail.fileName === 'string' ? detail.fileName : '(arquivo)'
      const size = typeof detail.fileSizeBytes === 'number' ? ` (${formatBytes(detail.fileSizeBytes)})` : ''
      return `${name}${size}`
    }
    case 'FOLDER_CREATED':
      return e.folderName ?? ''
    case 'CARD_MOVED':
      return ''
    default:
      return typeof detail.note === 'string' ? detail.note : ''
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * AAAA-MM-DD -> DD/MM/AAAA por manipulação de texto.
 * `new Date('2026-07-01')` seria interpretado como meia-noite UTC e exibiria
 * 30/06 em qualquer fuso a oeste de Greenwich.
 */
function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function buildExportFilename(boardTitle: string, from: string, to: string): string {
  const slug = boardTitle
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return `atividade-${slug || 'projeto'}-${from.slice(0, 10)}-a-${to.slice(0, 10)}.xlsx`
}
