import type { FastifyInstance } from 'fastify'
import type { ActivityType } from '@prisma/client'
import { requireAdmin } from '../middlewares/auth'
import { prisma } from '../database/prisma'
import { AppError } from '../utils/AppError'
import {
  getActivityReport,
  getActivityForExport,
  buildActivityWorkbook,
  buildExportFilename,
  ACTIVITY_LABEL,
} from '../services/ActivityReportService'

const VALID_TYPES = Object.keys(ACTIVITY_LABEL) as ActivityType[]

interface ActivityQuery {
  boardId?:  string
  from?:     string
  to?:       string
  type?:     string
  actorId?:  string
  columnId?: string
  page?:     string
  limit?:    string
}

export async function reportRoutes(app: FastifyInstance) {
  // ── GET /admin/reports/boards — projetos para o seletor ──
  app.get('/admin/reports/boards', {
    preHandler: [requireAdmin(['ADMIN'])],
  }, async (_request, reply) => {
    const boards = await prisma.board.findMany({
      select:  { id: true, title: true, isArchived: true },
      orderBy: [{ isArchived: 'asc' }, { title: 'asc' }],
    })
    return reply.send({ boards })
  })

  // ── GET /admin/reports/activity — timeline paginada + resumo ──
  app.get('/admin/reports/activity', {
    preHandler: [requireAdmin(['ADMIN'])],
  }, async (request, reply) => {
    const filters = parseFilters(request.query as ActivityQuery)
    const report  = await getActivityReport(filters)
    return reply.send(report)
  })

  // ── GET /admin/reports/activity/export — mesmos filtros, .xlsx ──
  app.get('/admin/reports/activity/export', {
    preHandler: [requireAdmin(['ADMIN'])],
  }, async (request, reply) => {
    const filters = parseFilters(request.query as ActivityQuery)
    const data    = await getActivityForExport(filters)
    const buffer  = await buildActivityWorkbook(data)

    const filename = buildExportFilename(data.board.title, data.period.from, data.period.to)

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      // Sem isso o axios/browser não enxerga o nome do arquivo em requisição cross-origin.
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(buffer)
  })
}

function parseFilters(query: ActivityQuery) {
  if (!query.boardId) throw new AppError('Selecione um projeto.', 400)

  if (query.type && !VALID_TYPES.includes(query.type as ActivityType)) {
    throw new AppError(`Tipo de evento inválido: ${query.type}`, 400)
  }

  return {
    boardId:  query.boardId,
    from:     query.from  || undefined,
    to:       query.to    || undefined,
    type:     query.type ? (query.type as ActivityType) : undefined,
    actorId:  query.actorId  || undefined,
    columnId: query.columnId || undefined,
    page:     query.page  ? Number(query.page)  : undefined,
    limit:    query.limit ? Number(query.limit) : undefined,
  }
}
