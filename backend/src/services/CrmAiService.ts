import Anthropic from '@anthropic-ai/sdk'
import { CrmStage } from '@prisma/client'
import { env } from '../config/env'
import { WhatsAppService } from './WhatsAppService'

// ── Types ─────────────────────────────────────────────────
interface DecisionMaker {
  id:            string
  name:          string
  role:          string | null
  email:         string | null
  phonePersonal: string | null
  phoneCompany:  string | null
}

interface Lead {
  id:             string
  companyName:    string
  companyPhone:   string | null
  decisionMakers: DecisionMaker[]
}

interface ConversationMessage {
  role:    'user' | 'assistant'
  content: string
}

interface AiReplyResult {
  reply:       string
  nextStage:   CrmStage | null
  tokensUsed:  number
}

// ── Stage labels (português) ──────────────────────────────
const STAGE_LABELS: Record<CrmStage, string> = {
  LEAD:               'Lead',
  PRIMEIRO_CONTATO:   'Primeiro Contato',
  NIVEL_CONSCIENCIA_1:'Nível de Consciência 1 — sabe que tem o problema',
  NIVEL_CONSCIENCIA_2:'Nível de Consciência 2 — sabe que existem soluções',
  NIVEL_CONSCIENCIA_3:'Nível de Consciência 3 — conhece nossa solução e está considerando',
  FINALIZADO:         'Finalizado — negociação em andamento',
  FECHADO:            'Fechado com o Cliente',
}

// ── System prompt (cacheable) ─────────────────────────────
const SYSTEM_PROMPT = `Você é um assistente comercial especializado, conversando via WhatsApp em nome da empresa.
Seu objetivo é qualificar leads e avançá-los no funil de vendas de forma natural, respeitosa e consultiva.

## FUNIL DE VENDAS (etapas em ordem)
1. LEAD — contato inicial, ainda não conversamos
2. PRIMEIRO_CONTATO — enviamos a primeira mensagem, aguardando resposta
3. NIVEL_CONSCIENCIA_1 — o decisor reconhece que tem um problema ou necessidade
4. NIVEL_CONSCIENCIA_2 — o decisor sabe que existem soluções no mercado
5. NIVEL_CONSCIENCIA_3 — o decisor conhece nossa solução e está avaliando
6. FINALIZADO — proposta enviada, negociação em andamento
7. FECHADO — contrato assinado, cliente conquistado

## SUAS RESPONSABILIDADES
- Conversar de forma natural, humana e consultiva pelo WhatsApp
- Fazer perguntas abertas para entender as dores e necessidades do decisor
- Apresentar valor antes de apresentar o produto
- Identificar o nível de consciência do decisor com base nas respostas
- Avançar o lead no funil quando houver sinal claro de progresso

## SINAIS PARA AVANÇAR DE ETAPA
- Para NIVEL_CONSCIENCIA_1: decisor mencionou um desafio, dor ou objetivo
- Para NIVEL_CONSCIENCIA_2: decisor perguntou sobre soluções ou alternativas
- Para NIVEL_CONSCIENCIA_3: decisor demonstrou interesse específico em nossa proposta
- Para FINALIZADO: decisor pediu proposta, preço ou próximos passos concretos
- Para FECHADO: decisor confirmou a decisão de fechar

## REGRAS IMPORTANTES
- Mensagens curtas e diretas (WhatsApp não é e-mail)
- Nunca pressione ou faça hard sell
- Um assunto por mensagem
- Se não houver sinal claro de avanço, mantenha a etapa atual
- Responda em português brasileiro

## FORMATO DE RESPOSTA OBRIGATÓRIO
Ao final de CADA resposta, inclua EXATAMENTE este bloco JSON (sem markdown, sem código):

[AI_DECISION]
{"reply":"<mensagem para enviar ao decisor>","move_to_stage":"<ETAPA_OU_NULL>"}
[/AI_DECISION]

O campo "move_to_stage" deve ser:
- Uma das etapas: "NIVEL_CONSCIENCIA_1", "NIVEL_CONSCIENCIA_2", "NIVEL_CONSCIENCIA_3", "FINALIZADO", "FECHADO"
- null se não há sinal suficiente para avançar

Exemplo correto:
[AI_DECISION]
{"reply":"Olá João! Vi que a Tech Solutions está crescendo bastante. Quais são os principais desafios que vocês enfrentam hoje em dia?","move_to_stage":null}
[/AI_DECISION]`

// ── CRM AI Service ────────────────────────────────────────
export class CrmAiService {
  private client:    Anthropic | null
  private whatsapp:  WhatsAppService

  constructor() {
    this.whatsapp = new WhatsAppService()
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      : null
  }

  get isConfigured(): boolean {
    return !!this.client
  }

  // ── Gera e envia a primeira mensagem ao decisor ──────────
  async sendFirstMessage(lead: Lead, decisionMaker: DecisionMaker): Promise<string | null> {
    if (!this.client) return null

    const phone = decisionMaker.phonePersonal ?? decisionMaker.phoneCompany
    if (!phone) return null

    const prompt = `Gere a primeira mensagem de prospecção para:
- Empresa: ${lead.companyName}
- Decisor: ${decisionMaker.name}${decisionMaker.role ? ` (${decisionMaker.role})` : ''}

Esta é a primeira vez que entramos em contato. A mensagem deve ser:
- Curta e direta (máximo 2-3 linhas)
- Natural e humana, não robótica
- Despertar curiosidade sem revelar tudo
- Terminar com uma pergunta aberta sobre desafios`

    try {
      const response = await this.client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 512,
        system: [
          {
            type:          'text',
            text:          SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      })

      const result = this.parseAiResponse(response)
      if (!result) return null

      // Envia via WhatsApp
      await this.whatsapp.sendMessage({
        phone,
        message: result.reply,
      })

      return result.reply
    } catch (err) {
      console.error('[CrmAI] sendFirstMessage error:', err)
      return null
    }
  }

  // ── Processa resposta do lead e gera próxima mensagem ────
  async handleLeadReply(
    lead:                Lead,
    incomingMessage:     string,
    conversationHistory: ConversationMessage[],
  ): Promise<AiReplyResult> {
    if (!this.client) {
      return { reply: '', nextStage: null, tokensUsed: 0 }
    }

    // Contexto do lead para o primeiro turno da conversa
    const context = `Lead: ${lead.companyName}${
      lead.decisionMakers[0]
        ? ` | Decisor: ${lead.decisionMakers[0].name}${lead.decisionMakers[0].role ? ` (${lead.decisionMakers[0].role})` : ''}`
        : ''
    }`

    // Monta histórico de mensagens
    const messages: Anthropic.Messages.MessageParam[] = []

    if (conversationHistory.length === 0) {
      // Primeira resposta do lead — adiciona contexto
      messages.push({
        role:    'user',
        content: `[Contexto: ${context}]\n\nMensagem do decisor: ${incomingMessage}`,
      })
    } else {
      // Histórico existente
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
      messages.push({ role: 'user', content: incomingMessage })
    }

    try {
      const response = await this.client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          {
            type:          'text',
            text:          SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      })

      const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0)
      const result     = this.parseAiResponse(response)

      if (!result) {
        return { reply: '', nextStage: null, tokensUsed }
      }

      return { reply: result.reply, nextStage: result.nextStage, tokensUsed }
    } catch (err) {
      console.error('[CrmAI] handleLeadReply error:', err)
      return { reply: '', nextStage: null, tokensUsed: 0 }
    }
  }

  // ── Parser da resposta do Claude ─────────────────────────
  private parseAiResponse(
    response: Anthropic.Messages.Message,
  ): { reply: string; nextStage: CrmStage | null } | null {
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const text = textBlock.text

    // Extrai o bloco JSON entre [AI_DECISION] e [/AI_DECISION]
    const match = text.match(/\[AI_DECISION\]\s*([\s\S]*?)\s*\[\/AI_DECISION\]/)
    if (!match) {
      console.warn('[CrmAI] No AI_DECISION block found in response')
      return { reply: text.replace(/\[AI_DECISION\][\s\S]*?\[\/AI_DECISION\]/g, '').trim(), nextStage: null }
    }

    try {
      const parsed = JSON.parse(match[1].trim()) as {
        reply:          string
        move_to_stage:  string | null
      }

      const VALID_STAGES: CrmStage[] = [
        'NIVEL_CONSCIENCIA_1', 'NIVEL_CONSCIENCIA_2', 'NIVEL_CONSCIENCIA_3',
        'FINALIZADO', 'FECHADO',
      ]

      const nextStage = parsed.move_to_stage && VALID_STAGES.includes(parsed.move_to_stage as CrmStage)
        ? (parsed.move_to_stage as CrmStage)
        : null

      return { reply: parsed.reply, nextStage }
    } catch (err) {
      console.error('[CrmAI] JSON parse error:', err, 'Raw:', match[1])
      return null
    }
  }
}

export const crmAi = new CrmAiService()
export { STAGE_LABELS }
