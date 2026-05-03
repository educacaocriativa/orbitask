import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import { CrmStage } from '@prisma/client'
import { prisma } from '../database/prisma'
import { authenticate } from '../middlewares/auth'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'
import { crmAi } from '../services/CrmAiService'

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
  decisionMakers: { orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }] },
  stageHistory: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: { movedBy: { select: { id: true, name: true } } },
  },
  leadProducts: {
    include: { product: true },
    orderBy: { createdAt: 'asc' as const },
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
        decisionMakers: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
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

    // ── Trigger IA: ao mover para PRIMEIRO_CONTATO ──────────
    if (toStage === 'PRIMEIRO_CONTATO' && crmAi.isConfigured) {
      setImmediate(async () => {
        try {
          const fullLead = await prisma.crmLead.findUnique({
            where: { id },
            include: { decisionMakers: { orderBy: { isPrimary: 'desc' } } },
          })
          if (!fullLead) return
          const primary = fullLead.decisionMakers[0]
          if (!primary) return
          const msg = await crmAi.sendFirstMessage(fullLead, primary)
          if (msg) {
            await prisma.crmStageHistory.create({
              data: {
                leadId:        id,
                fromStage:     'PRIMEIRO_CONTATO',
                toStage:       'PRIMEIRO_CONTATO',
                isAiMove:      true,
                notes:         'Primeira mensagem enviada pela IA',
                aiConversation: JSON.parse(JSON.stringify([
                  { role: 'assistant', content: msg },
                ])),
              },
            })
          }
        } catch (err) {
          console.error('[CRM] AI first message error:', err)
        }
      })
    }

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
        where: { companyName: item.companyName, isActive: true },
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

  // ── POST /crm/webhook/whatsapp — recebe mensagens da Evolution API ──
  // Chamado pelo Evolution API quando um lead responde via WhatsApp
  app.post('/crm/webhook/whatsapp', async (request, reply) => {
    const { secret } = request.query as { secret?: string }
    if (secret !== env.CRM_WEBHOOK_SECRET) {
      return reply.status(401).send({ error: 'Token inválido' })
    }

    const body = request.body as EvolutionWebhookPayload

    // Ignora mensagens enviadas por nós (fromMe) e eventos que não são mensagens
    if (body.event !== 'messages.upsert') return reply.send({ ok: true })
    if (body.data?.key?.fromMe) return reply.send({ ok: true })

    // Extrai telefone e texto da mensagem
    const remoteJid   = body.data?.key?.remoteJid ?? ''
    const rawPhone    = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    const messageText = body.data?.message?.conversation
      ?? body.data?.message?.extendedTextMessage?.text
      ?? ''

    if (!rawPhone || !messageText.trim()) return reply.send({ ok: true })

    // Busca o lead pelo telefone do decisor
    const decisionMaker = await prisma.crmDecisionMaker.findFirst({
      where: {
        OR: [
          { phonePersonal: { contains: rawPhone } },
          { phoneCompany:  { contains: rawPhone } },
        ],
      },
      include: {
        lead: {
          include: {
            decisionMakers: { orderBy: { isPrimary: 'desc' } },
          },
        },
      },
    })

    if (!decisionMaker || !decisionMaker.lead.isActive) {
      return reply.send({ ok: true })
    }

    const lead = decisionMaker.lead

    // Busca histórico de conversas IA para este lead
    const historyEntries = await prisma.crmStageHistory.findMany({
      where:   { leadId: lead.id, isAiMove: true },
      orderBy: { createdAt: 'asc' },
    })

    // Reconstrói o histórico de conversas
    type ConvMsg = { role: 'user' | 'assistant'; content: string }
    const conversationHistory: ConvMsg[] = []
    for (const entry of historyEntries) {
      const msgs = entry.aiConversation as ConvMsg[] | null
      if (Array.isArray(msgs)) {
        conversationHistory.push(...msgs)
      }
    }

    if (!crmAi.isConfigured) return reply.send({ ok: true })

    // Busca produtos ativos para contexto da IA
    const products = await prisma.crmProduct.findMany({ where: { isActive: true } })

    // Processa com IA
    const { reply: aiReply, nextStage, tokensUsed, recommendedProductId } =
      await crmAi.handleLeadReply(lead, messageText, conversationHistory, products)

    if (!aiReply) return reply.send({ ok: true })

    // Envia a resposta da IA via WhatsApp
    const { WhatsAppService } = await import('../services/WhatsAppService')
    const whatsapp = new WhatsAppService()
    const phone = decisionMaker.phonePersonal ?? decisionMaker.phoneCompany ?? ''
    await whatsapp.sendMessage({ phone, message: aiReply })

    // Se IA recomendou um produto, associa ao lead automaticamente
    if (recommendedProductId) {
      await prisma.crmLeadProduct.upsert({
        where:  { leadId_productId: { leadId: lead.id, productId: recommendedProductId } },
        create: { leadId: lead.id, productId: recommendedProductId, suggestedByAi: true },
        update: {},
      })
    }

    // Atualiza conversa e avança etapa se necessário
    const newConversation: ConvMsg[] = [
      ...conversationHistory,
      { role: 'user',      content: messageText },
      { role: 'assistant', content: aiReply },
    ]

    if (nextStage && nextStage !== lead.stage) {
      const lastInStage = await prisma.crmLead.findFirst({
        where: { stage: nextStage }, orderBy: { position: 'desc' },
      })
      await prisma.$transaction([
        prisma.crmLead.update({
          where: { id: lead.id },
          data:  { stage: nextStage, position: (lastInStage?.position ?? -1) + 1 },
        }),
        prisma.crmStageHistory.create({
          data: {
            leadId:         lead.id,
            fromStage:      lead.stage,
            toStage:        nextStage,
            isAiMove:       true,
            notes:          `IA avançou etapa automaticamente (${tokensUsed} tokens)`,
            aiConversation: JSON.parse(JSON.stringify(newConversation)),
          },
        }),
      ])
    } else {
      await prisma.crmStageHistory.create({
        data: {
          leadId:         lead.id,
          fromStage:      lead.stage,
          toStage:        lead.stage,
          isAiMove:       true,
          notes:          `Resposta IA (${tokensUsed} tokens)`,
          aiConversation: JSON.parse(JSON.stringify(newConversation)),
        },
      })
    }

    return reply.send({ ok: true })
  })

  // ── GET /crm/ai/status — verifica se IA está configurada ─
  app.get('/crm/ai/status', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    return reply.send({
      configured:  crmAi.isConfigured,
      model:       'claude-sonnet-4-6',
      apifyReady:  !!(env.APIFY_API_TOKEN && env.APIFY_ACTOR_ID),
    })
  })

  // ═══════════════════════════════════════════════════════
  //  PRODUTOS
  // ═══════════════════════════════════════════════════════

  // ── GET /crm/products ─────────────────────────────────
  app.get('/crm/products', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const products = await prisma.crmProduct.findMany({
      where:   { isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ products })
  })

  // ── POST /crm/products ────────────────────────────────
  app.post('/crm/products', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const body = request.body as {
      name: string; description?: string; price?: string
      videoUrl?: string; features?: string[]
    }
    if (!body.name?.trim()) throw new AppError('Nome do produto é obrigatório', 400)

    const product = await prisma.crmProduct.create({
      data: {
        name:        body.name.trim(),
        description: body.description?.trim() || null,
        price:       body.price?.trim() || null,
        videoUrl:    body.videoUrl?.trim() || null,
        features:    body.features?.length ? body.features : null,
      },
    })
    return reply.status(201).send({ product })
  })

  // ── PATCH /crm/products/:id ───────────────────────────
  app.patch('/crm/products/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string; description?: string; price?: string
      videoUrl?: string; features?: string[]
    }
    const product = await prisma.crmProduct.update({
      where: { id },
      data: {
        ...(body.name        !== undefined && { name:        body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.price       !== undefined && { price:       body.price?.trim() || null }),
        ...(body.videoUrl    !== undefined && { videoUrl:    body.videoUrl?.trim() || null }),
        ...(body.features    !== undefined && { features:    body.features }),
      },
    })
    return reply.send({ product })
  })

  // ── DELETE /crm/products/:id ──────────────────────────
  app.delete('/crm/products/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    await prisma.crmProduct.update({ where: { id }, data: { isActive: false } })
    return reply.send({ ok: true })
  })

  // ── POST /crm/leads/:id/products/:productId ───────────
  app.post('/crm/leads/:id/products/:productId', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id, productId } = request.params as { id: string; productId: string }
    const lp = await prisma.crmLeadProduct.upsert({
      where:  { leadId_productId: { leadId: id, productId } },
      create: { leadId: id, productId, suggestedByAi: false },
      update: {},
      include: { product: true },
    })
    return reply.status(201).send({ leadProduct: lp })
  })

  // ── DELETE /crm/leads/:id/products/:productId ─────────
  app.delete('/crm/leads/:id/products/:productId', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    const { id, productId } = request.params as { id: string; productId: string }
    await prisma.crmLeadProduct.deleteMany({ where: { leadId: id, productId } })
    return reply.send({ ok: true })
  })

  // ═══════════════════════════════════════════════════════
  //  APIFY
  // ═══════════════════════════════════════════════════════

  // ── POST /crm/apify/run — dispara ator Apify ──────────
  app.post('/crm/apify/run', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    if (!env.APIFY_API_TOKEN) throw new AppError('APIFY_API_TOKEN não configurado', 503)
    if (!env.APIFY_ACTOR_ID)  throw new AppError('APIFY_ACTOR_ID não configurado', 503)

    const body = request.body as Record<string, unknown> | undefined
    const input = body ?? {}

    try {
      const { data } = await axios.post<{ data?: { id?: string; status?: string } }>(
        `https://api.apify.com/v2/acts/${env.APIFY_ACTOR_ID!}/runs`,
        input,
        { headers: { Authorization: `Bearer ${env.APIFY_API_TOKEN!}` } },
      )
      return reply.send({
        runId:   data.data?.id,
        status:  data.data?.status,
        message: 'Ator Apify iniciado. Os leads chegarão via webhook quando o run concluir.',
      })
    } catch (err: any) {
      throw new AppError(`Apify error: ${err?.response?.data?.error?.message ?? err.message}`, 502)
    }
  })

  // ── GET /crm/apify/run/:runId — status de um run ──────
  app.get('/crm/apify/run/:runId', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw new AppError('Acesso negado', 403)
    if (!env.APIFY_API_TOKEN) throw new AppError('APIFY_API_TOKEN não configurado', 503)

    const { runId } = request.params as { runId: string }
    try {
      const { data } = await axios.get<{ data?: unknown }>(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${env.APIFY_API_TOKEN!}` } },
      )
      return reply.send({ run: data.data })
    } catch {
      throw new AppError('Run não encontrado', 404)
    }
  })
}

interface EvolutionWebhookPayload {
  event:    string
  instance: string
  data?: {
    key?: {
      remoteJid?: string
      fromMe?:    boolean
      id?:        string
    }
    pushName?: string
    message?: {
      conversation?:          string
      extendedTextMessage?: { text?: string }
    }
    messageTimestamp?: number
  }
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
