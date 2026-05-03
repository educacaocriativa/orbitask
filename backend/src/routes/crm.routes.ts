import type { FastifyInstance } from 'fastify'
import { CrmStage } from '@prisma/client'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

// ── Stage labels ──────────────────────────────────────────
export const CRM_STAGES: CrmStage[] = [
  'LEAD',
  'PRIMEIRO_CONTATO',
  'NIVEL_CONSCIENCIA_1',
  'NIVEL_CONSCIENCIA_2',
  'NIVEL_CONSCIENCIA_3',
  'FINALIZADO',
  'FECHADO',
]

const LEAD_INCLUDE = {
  decisionMakers: { orderBy: { isPrimary: 'desc' as const, createdAt: 'asc' as const } },
  stageHistory: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: { movedBy: { select: { id: true, name: true } } },
  },
}

export async function crmRoutes(app: FastifyInstance) {

  // ── GET /crm/leads — kanban agrupado por etapa ────────────
  app.get('/crm/leads', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)

    const leads = await prisma.crmLead.findMany({
      where: { isActive: true },
      orderBy: [{ stage: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
      include: {
        decisionMakers: { orderBy: { isPrimary: 'desc', createdAt: 'asc' } },
        _count: { select: { stageHistory: true } },
      },
    })

    // Agrupar por etapa
    const kanban = CRM_STAGES.reduce((acc, stage) => {
      acc[stage] = leads.filter((l) => l.stage === stage)
      return acc
    }, {} as Record<CrmStage, typeof leads>)

    return reply.send({ kanban, total: leads.length })
  })

  // ── GET /crm/leads/:id — detalhe completo ─────────────────
  app.get('/crm/leads/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    const lead = await prisma.crmLead.findUnique({ where: { id }, include: LEAD_INCLUDE })
    if (!lead) throw new AppError('Lead não encontrado', 404)

    return reply.send({ lead })
  })

  // ── POST /crm/leads — criar lead manualmente ──────────────
  app.post('/crm/leads', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)

    const body = request.body as {
      companyName: string
      companyPhone?: string
      decisionMakers?: Array<{
        name: string; role?: string; email?: string
        phoneCompany?: string; phonePersonal?: string; linkedin?: string
        isPrimary?: boolean
      }>
    }

    if (!body.companyName?.trim()) throw new AppError('Nome da empresa é obrigatório', 400)

    const lastLead = await prisma.crmLead.findFirst({
      where: { stage: 'LEAD' }, orderBy: { position: 'desc' },
    })

    const lead = await prisma.crmLead.create({
      data: {
        companyName:  body.companyName.trim(),
        companyPhone: body.companyPhone?.trim() || null,
        stage:        'LEAD',
        position:     (lastLead?.position ?? -1) + 1,
        decisionMakers: body.decisionMakers?.length
          ? { create: body.decisionMakers.map((dm, i) => ({ ...dm, isPrimary: i === 0 })) }
          : undefined,
        stageHistory: {
          create: { toStage: 'LEAD', movedById: request.user.id, notes: 'Lead criado' },
        },
      },
      include: LEAD_INCLUDE,
    })

    return reply.status(201).send({ lead })
  })

  // ── PATCH /crm/leads/:id — editar empresa ─────────────────
  app.patch('/crm/leads/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as { companyName?: string; companyPhone?: string }

    const lead = await prisma.crmLead.update({
      where: { id },
      data: {
        ...(body.companyName  && { companyName:  body.companyName.trim() }),
        ...(body.companyPhone !== undefined && { companyPhone: body.companyPhone?.trim() || null }),
      },
      include: LEAD_INCLUDE,
    })

    return reply.send({ lead })
  })

  // ── POST /crm/leads/:id/move — mover para outra etapa ─────
  app.post('/crm/leads/:id/move', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const { toStage, notes } = request.body as { toStage: CrmStage; notes?: string }

    if (!CRM_STAGES.includes(toStage)) throw new AppError('Etapa inválida', 400)

    const lead = await prisma.crmLead.findUnique({ where: { id }, select: { stage: true } })
    if (!lead) throw new AppError('Lead não encontrado', 404)
    if (lead.stage === toStage) throw new AppError('Lead já está nesta etapa', 400)

    const lastInStage = await prisma.crmLead.findFirst({
      where: { stage: toStage }, orderBy: { position: 'desc' },
    })

    const [updated] = await prisma.$transaction([
      prisma.crmLead.update({
        where: { id },
        data: { stage: toStage, position: (lastInStage?.position ?? -1) + 1 },
        include: LEAD_INCLUDE,
      }),
      prisma.crmStageHistory.create({
        data: {
          leadId:    id,
          fromStage: lead.stage,
          toStage,
          notes:     notes?.trim() || null,
          movedById: request.user.id,
        },
      }),
    ])

    return reply.send({ lead: updated })
  })

  // ── DELETE /crm/leads/:id — arquivar lead ─────────────────
  app.delete('/crm/leads/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    await prisma.crmLead.update({ where: { id }, data: { isActive: false } })
    return reply.send({ ok: true })
  })

  // ── POST /crm/leads/:id/decision-makers ───────────────────
  app.post('/crm/leads/:id/decision-makers', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as {
      name: string; role?: string; email?: string
      phoneCompany?: string; phonePersonal?: string; linkedin?: string; isPrimary?: boolean
    }

    if (!body.name?.trim()) throw new AppError('Nome é obrigatório', 400)

    // Se novo decisor é primário, remove o flag dos outros
    if (body.isPrimary) {
      await prisma.crmDecisionMaker.updateMany({ where: { leadId: id }, data: { isPrimary: false } })
    }

    const dm = await prisma.crmDecisionMaker.create({
      data: { ...body, name: body.name.trim(), leadId: id },
    })

    return reply.status(201).send({ decisionMaker: dm })
  })

  // ── PATCH /crm/decision-makers/:id ────────────────────────
  app.patch('/crm/decision-makers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string; role?: string; email?: string
      phoneCompany?: string; phonePersonal?: string; linkedin?: string; isPrimary?: boolean
    }

    const existing = await prisma.crmDecisionMaker.findUnique({ where: { id } })
    if (!existing) throw new AppError('Decisor não encontrado', 404)

    if (body.isPrimary) {
      await prisma.crmDecisionMaker.updateMany({
        where: { leadId: existing.leadId }, data: { isPrimary: false },
      })
    }

    const dm = await prisma.crmDecisionMaker.update({ where: { id }, data: body })
    return reply.send({ decisionMaker: dm })
  })

  // ── DELETE /crm/decision-makers/:id ───────────────────────
  app.delete('/crm/decision-makers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    await prisma.crmDecisionMaker.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ── POST /crm/webhook/apify — recebe leads do Apify ───────
  // Não requer autenticação JWT — usa secret token como query param
  app.post('/crm/webhook/apify', async (request, reply) => {
    const { secret } = request.query as { secret?: string }

    if (secret !== env.CRM_WEBHOOK_SECRET) {
      throw new AppError('Token inválido', 401)
    }

    const body = request.body as
      | Array<ApifyLead>
      | ApifyLead
      | { leads: ApifyLead[] }

    // Normaliza para array
    let leads: ApifyLead[] = []
    if (Array.isArray(body))        leads = body
    else if ('leads' in body)       leads = body.leads
    else                            leads = [body as ApifyLead]

    let created = 0
    let skipped = 0

    for (const item of leads) {
      if (!item.companyName) { skipped++; continue }

      // Evita duplicatas pelo nome da empresa (case-insensitive)
      const existing = await prisma.crmLead.findFirst({
        where: { companyName: { equals: item.companyName, mode: 'insensitive' }, isActive: true },
      })
      if (existing) { skipped++; continue }

      const lastLead = await prisma.crmLead.findFirst({
        where: { stage: 'LEAD' }, orderBy: { position: 'desc' },
      })

      await prisma.crmLead.create({
        data: {
          companyName:    item.companyName.trim(),
          companyPhone:   item.companyPhone ?? null,
          apifySourceUrl: item.sourceUrl ?? null,
          apifyRawData:   JSON.parse(JSON.stringify(item)),
          stage:          'LEAD',
          position:       (lastLead?.position ?? -1) + 1,
          decisionMakers: item.decisionMakerName
            ? {
                create: [{
                  name:          item.decisionMakerName,
                  role:          item.decisionMakerRole ?? null,
                  email:         item.decisionMakerEmail ?? null,
                  phonePersonal: item.decisionMakerPhone ?? null,
                  linkedin:      item.decisionMakerLinkedin ?? null,
                  isPrimary:     true,
                }],
              }
            : undefined,
          stageHistory: {
            create: { toStage: 'LEAD', notes: 'Lead importado via Apify', isAiMove: false },
          },
        },
      })
      created++
    }

    return reply.send({ created, skipped, total: leads.length })
  })
}

interface ApifyLead {
  companyName?: string
  companyPhone?: string
  decisionMakerName?: string
  decisionMakerRole?: string
  decisionMakerEmail?: string
  decisionMakerPhone?: string
  decisionMakerLinkedin?: string
  sourceUrl?: string
  [key: string]: unknown
}
