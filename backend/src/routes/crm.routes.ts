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

function canCrm(user: { role: string; crmAccess?: boolean }) {
  return user.role === 'ADMIN' || user.crmAccess === true
}

export async function crmRoutes(app: FastifyInstance) {

  // ── GET /crm/leads — kanban agrupado por etapa ────────────
  app.get('/crm/leads', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)

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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    const lead = await prisma.crmLead.findUnique({ where: { id }, include: LEAD_INCLUDE })
    if (!lead) throw new AppError('Lead não encontrado', 404)

    return reply.send({ lead })
  })

  // ── POST /crm/leads — criar lead manualmente ──────────────
  app.post('/crm/leads', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)

    const body = request.body as {
      companyName: string
      companyPhone?: string
      companyWebsite?: string
      segment?: string
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
        companyName:    body.companyName.trim(),
        companyPhone:   body.companyPhone?.trim() || null,
        companyWebsite: body.companyWebsite?.trim() || null,
        segment:        body.segment?.trim() || null,
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as { companyName?: string; companyPhone?: string; companyWebsite?: string; segment?: string }

    const lead = await prisma.crmLead.update({
      where: { id },
      data: {
        ...(body.companyName    && { companyName:    body.companyName.trim() }),
        ...(body.companyPhone   !== undefined && { companyPhone:   body.companyPhone?.trim()   || null }),
        ...(body.companyWebsite !== undefined && { companyWebsite: body.companyWebsite?.trim() || null }),
        ...(body.segment        !== undefined && { segment:        body.segment?.trim()        || null }),
      },
      include: LEAD_INCLUDE,
    })

    return reply.send({ lead })
  })

  // ── POST /crm/leads/:id/move — mover para outra etapa ─────
  app.post('/crm/leads/:id/move', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
          const [fullLead, products, skills] = await Promise.all([
            prisma.crmLead.findUnique({
              where: { id },
              include: { decisionMakers: { orderBy: [{ isPrimary: 'desc' }] } },
            }),
            (prisma as any).crmProduct?.findMany({ where: { isActive: true } }) ?? [],
            (prisma as any).crmSkill?.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }) ?? [],
          ])
          if (!fullLead) return
          const primary = fullLead.decisionMakers[0]
          if (!primary) return
          const msg = await crmAi.sendFirstMessage(fullLead, primary, products, skills)
          if (msg) {
            await (prisma as any).crmMessage?.create({
              data: {
                leadId: id,
                direction: 'OUTBOUND',
                content: msg.message,
                sentBy: 'AI',
                senderName: 'IA Comercial',
                whatsappRemoteJid: msg.whatsappRemoteJid ?? null,
                whatsappMessageId: msg.whatsappMessageId ?? null,
              },
            })
            await prisma.crmStageHistory.create({
              data: {
                leadId:        id,
                fromStage:     'PRIMEIRO_CONTATO',
                toStage:       'PRIMEIRO_CONTATO',
                isAiMove:      true,
                notes:         'Primeira mensagem enviada pela IA',
                aiConversation: JSON.parse(JSON.stringify([
                  { role: 'assistant', content: msg.message },
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    await prisma.crmLead.update({ where: { id }, data: { isActive: false } })
    return reply.send({ ok: true })
  })

  // ── POST /crm/leads/:id/decision-makers ───────────────────
  app.post('/crm/leads/:id/decision-makers', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
          companyWebsite: item.website ?? null,
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
    console.log('[CRM-WH] event=%s instance=%s fromMe=%s', body.event, body.instance, body.data?.key?.fromMe)

    const normalizeWhatsAppJid = (jid: string | null | undefined) => {
      const value = (jid ?? '').trim()
      const match = value.match(/^([^@:]+)(?::\d+)?@(lid|s\.whatsapp\.net)$/)
      return match ? `${match[1]}@${match[2]}` : value
    }

    if (body.event === 'messages.update') {
      const updates = Array.isArray((body as any).data)
        ? (body as any).data
        : [(body as any).data].filter(Boolean)

      for (const item of updates) {
        const keyId = item?.keyId ?? item?.key?.id
        const messageId = item?.messageId ?? item?.id
        const remoteJid = normalizeWhatsAppJid(item?.remoteJid ?? item?.key?.remoteJid)
        const possibleMessageIds = [keyId, messageId].filter(Boolean)
        if (possibleMessageIds.length === 0 || !remoteJid?.endsWith('@lid')) continue

        const sentMessage = await (prisma as any).crmMessage.findFirst({
          where: {
            direction: 'OUTBOUND',
            whatsappMessageId: { in: possibleMessageIds },
          },
          include: {
            lead: {
              include: { decisionMakers: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
            },
          },
        })
        if (!sentMessage?.lead) continue

        await (prisma as any).crmLead.update({
          where: { id: sentMessage.leadId },
          data:  { whatsappJid: remoteJid },
        })

        const sentToDigits = (sentMessage.whatsappRemoteJid ?? '').replace(/\D/g, '')
        const decisionMaker = sentMessage.lead.decisionMakers.find((dm: any) => {
          const personal = (dm.phonePersonal ?? '').replace(/\D/g, '')
          const company  = (dm.phoneCompany ?? '').replace(/\D/g, '')
          return sentToDigits && (personal.endsWith(sentToDigits.slice(-10)) || company.endsWith(sentToDigits.slice(-10)))
        }) ?? sentMessage.lead.decisionMakers[0]

        if (decisionMaker) {
          await (prisma as any).crmDecisionMaker.update({
            where: { id: decisionMaker.id },
            data:  { whatsappJid: remoteJid },
          })
        }

        console.log('[CRM-WH] vinculado LID por UPDATE messageId=%s leadId=%s remoteJid=%s',
          possibleMessageIds.join('|'), sentMessage.leadId, remoteJid)
      }

      return reply.send({ ok: true })
    }

    // Ignora mensagens enviadas por nós (fromMe) e eventos que não são mensagens
    if (body.event !== 'messages.upsert') return reply.send({ ok: true })
    if (body.data?.key?.fromMe) return reply.send({ ok: true })

    // Extrai dados da mensagem
    const remoteJid   = normalizeWhatsAppJid(body.data?.key?.remoteJid)
    const isLid       = remoteJid.endsWith('@lid')
    const rawPhone    = isLid ? '' : remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    const pushName    = body.data?.pushName ?? ''
    const messageText = body.data?.message?.conversation
      ?? body.data?.message?.extendedTextMessage?.text
      ?? ''

    console.log('[CRM-WH] remoteJid=%s isLid=%s rawPhone=%s pushName="%s" textLen=%d',
      remoteJid, isLid, rawPhone || '-', pushName, messageText.length)

    if (!messageText.trim()) {
      console.log('[CRM-WH] skip: mensagem vazia')
      return reply.send({ ok: true })
    }
    if (!rawPhone && !pushName.trim()) {
      console.log('[CRM-WH] skip: sem telefone nem pushName')
      return reply.send({ ok: true })
    }

    // Carrega todos os decisores de leads ativos. Quando o WhatsApp manda @lid,
    // o telefone fica oculto, entao o fallback por nome/JID precisa ver todos.
    const candidates = await prisma.crmDecisionMaker.findMany({
      where: {
        lead: { isActive: true },
      },
      include: {
        lead: {
          include: {
            decisionMakers: { orderBy: { isPrimary: 'desc' } },
          },
        },
      },
    })

    // Estratégia 1: matching por telefone (formato tradicional @s.whatsapp.net)
    // Compara pelos últimos 10 dígitos pra tolerar prefixos de país, espaços, etc.
    const matchPhone = (raw: string | null | undefined) => {
      const digits = (raw ?? '').replace(/\D/g, '')
      if (!digits || !rawPhone) return false
      const a = digits.slice(-10)
      const b = rawPhone.slice(-10)
      return a.length >= 8 && b.length >= 8 && a === b
    }

    const matchJid = (raw: string | null | undefined) => !!raw && normalizeWhatsAppJid(raw) === remoteJid

    // Estratégia 2: matching por pushName (quando WhatsApp envia @lid e oculta o telefone)
    // Normaliza removendo acentos/case e checa se cada token do pushName aparece no nome do decisor.
    const normalize = (s: string) => s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Conta quantos tokens do pushName aparecem no nome do decisor.
    // Quanto mais alto, melhor o match. 0 = nada bateu.
    const scoreName = (raw: string | null | undefined): number => {
      if (!pushName.trim() || !raw) return 0
      const target = normalize(raw)
      const tokens = normalize(pushName).split(' ').filter((t) => t.length >= 3)
      if (tokens.length === 0) return 0
      return tokens.filter((t) => target.includes(t)).length
    }

    console.log('[CRM-WH] candidatos carregados: %d decisor(es)', candidates.length)

    let decisionMaker = candidates.find(
      (dm) => matchJid((dm as any).whatsappJid)
    )
    if (decisionMaker) {
      console.log('[CRM-WH] match por JID â†’ decisor="%s" leadId=%s',
        decisionMaker.name, decisionMaker.lead.id)
    }

    decisionMaker ??= candidates.find(
      (dm) => matchPhone(dm.phonePersonal) || matchPhone(dm.phoneCompany) || matchPhone(dm.lead.companyPhone)
    )
    if (decisionMaker) {
      console.log('[CRM-WH] match por TELEFONE → decisor="%s" leadId=%s',
        decisionMaker.name, decisionMaker.lead.id)
    }

    // Fallback para LID/sem-telefone — usa pushName e ranqueia
    if (!decisionMaker && (isLid || !rawPhone)) {
      type Candidate = (typeof candidates)[number]
      const scored = candidates
        .map((dm: Candidate) => ({ dm, score: scoreName(dm.name) }))
        .filter((s: { dm: Candidate; score: number }) => s.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)

      console.log('[CRM-WH] tentando match por NOME (pushName="%s") → ranking: [%s]',
        pushName,
        scored.map((s: { dm: Candidate; score: number }) => `${s.dm.name}=${s.score}`).join(', ') || 'vazio')

      // Aceita se o top tem score estritamente maior que o segundo (winner único)
      if (scored.length === 1) {
        decisionMaker = scored[0].dm
      } else if (scored.length > 1 && scored[0].score > scored[1].score) {
        decisionMaker = scored[0].dm
      }

      if (decisionMaker) {
        console.log('[CRM-WH] match por NOME → decisor="%s" leadId=%s',
          decisionMaker.name, decisionMaker.lead.id)
      } else if (scored.length > 1) {
        console.log('[CRM-WH] skip: empate de %d decisores com mesmo score', scored.length)
      }
    }

    let lead = decisionMaker?.lead

    if (!lead && remoteJid) {
      lead = await (prisma as any).crmLead.findFirst({
        where: { isActive: true, whatsappJid: remoteJid },
        include: { decisionMakers: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
      })
      if (lead) {
        decisionMaker = lead.decisionMakers[0]
          ? ({ ...lead.decisionMakers[0], lead } as any)
          : undefined
        console.log('[CRM-WH] match por JID do LEAD â†’ leadId=%s', lead.id)
      }
    }

    if (!lead || !lead.isActive) {
      console.log('[CRM-WH] DESCARTADO: nenhum lead/decisor ativo encontrado (rawPhone=%s pushName="%s" remoteJid=%s)', rawPhone || '-', pushName, remoteJid || '-')
      return reply.send({ ok: true })
    }

    if (remoteJid && (!decisionMaker || (decisionMaker as any).whatsappJid !== remoteJid)) {
      await (prisma as any).crmLead.update({ where: { id: lead.id }, data: { whatsappJid: remoteJid } })
      if (decisionMaker) {
        await (prisma as any).crmDecisionMaker.update({
          where: { id: decisionMaker.id },
          data:  { whatsappJid: remoteJid },
        })
      }
    }

    // Salva mensagem recebida
    await (prisma as any).crmMessage?.create({
      data: {
        leadId:     lead.id,
        direction:  'INBOUND',
        content:    messageText,
        senderName: decisionMaker?.name ?? pushName || lead.companyName,
        whatsappRemoteJid: remoteJid || null,
      },
    })

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

    // Busca produtos e skills ativos para contexto da IA
    const [products, skills] = await Promise.all([
      (prisma as any).crmProduct?.findMany({ where: { isActive: true } }) ?? [],
      (prisma as any).crmSkill?.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }) ?? [],
    ])

    // Processa com IA
    const { reply: aiReply, nextStage, tokensUsed, recommendedProductId } =
      await crmAi.handleLeadReply(lead, messageText, conversationHistory, products, skills)

    if (!aiReply) return reply.send({ ok: true })

    // Envia a resposta da IA via WhatsApp
    const { WhatsAppService } = await import('../services/WhatsAppService')
    const whatsapp = new WhatsAppService()
    const phone = decisionMaker?.phonePersonal ?? decisionMaker?.phoneCompany ?? lead.companyPhone ?? ''
    if (!phone) return reply.send({ ok: true })
    const sendResult = await whatsapp.sendMessageWithResult({ phone, message: aiReply })
    const cleanPhone = phone.replace(/\D/g, '')

    // Salva mensagem enviada pela IA
    await (prisma as any).crmMessage?.create({
      data: {
        leadId:    lead.id,
        direction: 'OUTBOUND',
        content:   aiReply,
        sentBy:    'AI',
        senderName: 'IA Comercial',
        whatsappRemoteJid: sendResult.remoteJid ?? `${cleanPhone}@s.whatsapp.net`,
        whatsappMessageId: sendResult.messageId ?? null,
      },
    })

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

  // ═══════════════════════════════════════════════════════
  //  MENSAGENS
  // ═══════════════════════════════════════════════════════

  // ── GET /crm/leads/:id/messages ──────────────────────────
  app.get('/crm/leads/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const messages = await (prisma as any).crmMessage.findMany({
      where:   { leadId: id },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ messages })
  })

  // ── POST /crm/leads/:id/messages — envio manual ──────────
  app.post('/crm/leads/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: string }

    if (!content?.trim()) throw new AppError('Mensagem não pode estar vazia', 400)

    const lead = await prisma.crmLead.findUnique({
      where:   { id },
      include: { decisionMakers: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
    })
    if (!lead) throw new AppError('Lead não encontrado', 404)

    // Busca telefone: decisor principal → qualquer decisor → telefone da empresa
    const primary = lead.decisionMakers[0]
    const phone   = primary?.phonePersonal
                 ?? primary?.phoneCompany
                 ?? lead.decisionMakers.find(d => d.phonePersonal)?.phonePersonal
                 ?? lead.decisionMakers.find(d => d.phoneCompany)?.phoneCompany
                 ?? lead.companyPhone

    if (!phone) throw new AppError('Nenhum número de WhatsApp encontrado para este lead. Cadastre o telefone do decisor.', 400)

    // Envia via WhatsApp
    const { WhatsAppService } = await import('../services/WhatsAppService')
    const whatsapp = new WhatsAppService()
    const sendResult = await whatsapp.sendMessageWithResult({ phone, message: content.trim() })
    const cleanPhone = phone.replace(/\D/g, '')

    // Salva mensagem
    const message = await (prisma as any).crmMessage.create({
      data: {
        leadId:      id,
        direction:   'OUTBOUND',
        content:     content.trim(),
        sentBy:      'HUMAN',
        senderName:  request.user.name,
        sentByUserId: request.user.id,
        whatsappRemoteJid: sendResult.remoteJid ?? `${cleanPhone}@s.whatsapp.net`,
        whatsappMessageId: sendResult.messageId ?? null,
      },
    })

    return reply.status(201).send({ message })
  })

  // ── POST /crm/leads/:id/send-first-message — disparo manual ─
  app.post('/crm/leads/:id/send-first-message', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }

    if (!crmAi.isConfigured) throw new AppError('IA não configurada (ANTHROPIC_API_KEY ausente)', 503)

    const [lead, products, skills] = await Promise.all([
      prisma.crmLead.findUnique({
        where:   { id },
        include: { decisionMakers: { orderBy: [{ isPrimary: 'desc' }] } },
      }),
      (prisma as any).crmProduct?.findMany({ where: { isActive: true } }) ?? [],
      (prisma as any).crmSkill?.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }) ?? [],
    ])

    if (!lead) throw new AppError('Lead não encontrado', 404)

    const primary = lead.decisionMakers[0]
    if (!primary) throw new AppError('Lead sem decisor cadastrado. Adicione um decisor na aba Decisores.', 400)

    const phone = primary.phonePersonal ?? primary.phoneCompany ?? lead.companyPhone
    if (!phone) throw new AppError(
      `Nenhum telefone encontrado. Preencha o telefone do decisor "${primary.name}" na aba Decisores.`,
      400
    )

    const msg = await crmAi.sendFirstMessage(lead, primary, products, skills)
    if (!msg) throw new AppError('A IA não conseguiu gerar a mensagem. Verifique o ANTHROPIC_API_KEY no App Runner.', 500)

    // Salva como mensagem e no histórico
    await Promise.all([
      (prisma as any).crmMessage?.create({
        data: {
          leadId: id,
          direction: 'OUTBOUND',
          content: msg.message,
          sentBy: 'AI',
          senderName: 'IA Comercial',
          whatsappRemoteJid: msg.whatsappRemoteJid ?? null,
          whatsappMessageId: msg.whatsappMessageId ?? null,
        },
      }),
      prisma.crmStageHistory.create({
        data: {
          leadId:     id,
          fromStage:  lead.stage,
          toStage:    lead.stage,
          isAiMove:   true,
          notes:      'Primeira mensagem enviada manualmente pela IA',
          aiConversation: JSON.parse(JSON.stringify([{ role: 'assistant', content: msg.message }])),
        },
      }),
    ])

    return reply.send({ ok: true, message: msg.message })
  })

  // ── GET /crm/ai/status — verifica se IA está configurada ─
  app.get('/crm/ai/status', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    return reply.send({
      configured:  crmAi.isConfigured,
      model:       'claude-opus-4-7',
      apifyReady:  !!(env.APIFY_API_TOKEN && env.APIFY_ACTOR_ID),
    })
  })

  // ═══════════════════════════════════════════════════════
  //  PRODUTOS
  // ═══════════════════════════════════════════════════════

  // ── GET /crm/products ─────────────────────────────────
  app.get('/crm/products', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const products = await prisma.crmProduct.findMany({
      where:   { isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({ products })
  })

  // ── POST /crm/products ────────────────────────────────
  app.post('/crm/products', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    await prisma.crmProduct.update({ where: { id }, data: { isActive: false } })
    return reply.send({ ok: true })
  })

  // ── POST /crm/leads/:id/products/:productId ───────────
  app.post('/crm/leads/:id/products/:productId', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id, productId } = request.params as { id: string; productId: string }
    await prisma.crmLeadProduct.deleteMany({ where: { leadId: id, productId } })
    return reply.send({ ok: true })
  })

  // ═══════════════════════════════════════════════════════
  //  SKILLS DE VENDAS
  // ═══════════════════════════════════════════════════════

  app.get('/crm/skills', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const skills = await (prisma as any).crmSkill.findMany({ orderBy: { order: 'asc' } })
    return reply.send({ skills })
  })

  app.post('/crm/skills', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const body = request.body as { name: string; description?: string; content: string; trigger?: string }
    if (!body.name?.trim() || !body.content?.trim()) throw new AppError('Nome e conteúdo são obrigatórios', 400)
    const last = await (prisma as any).crmSkill.findFirst({ orderBy: { order: 'desc' } })
    const skill = await (prisma as any).crmSkill.create({
      data: {
        name:        body.name.trim(),
        description: body.description?.trim() || null,
        content:     body.content.trim(),
        trigger:     body.trigger?.trim() || null,
        order:       (last?.order ?? -1) + 1,
      },
    })
    return reply.status(201).send({ skill })
  })

  app.patch('/crm/skills/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; description?: string; content?: string; trigger?: string; isActive?: boolean; order?: number }
    const skill = await (prisma as any).crmSkill.update({
      where: { id },
      data: {
        ...(body.name        !== undefined && { name:        body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.content     !== undefined && { content:     body.content.trim() }),
        ...(body.trigger     !== undefined && { trigger:     body.trigger?.trim() || null }),
        ...(body.isActive    !== undefined && { isActive:    body.isActive }),
        ...(body.order       !== undefined && { order:       body.order }),
      },
    })
    return reply.send({ skill })
  })

  app.delete('/crm/skills/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
    const { id } = request.params as { id: string }
    await (prisma as any).crmSkill.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ═══════════════════════════════════════════════════════
  //  APIFY
  // ═══════════════════════════════════════════════════════

  // ── POST /crm/apify/run — dispara ator Apify ──────────
  app.post('/crm/apify/run', { preHandler: [authenticate] }, async (request, reply) => {
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
    if (!canCrm(request.user)) throw new AppError('Acesso negado', 403)
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
