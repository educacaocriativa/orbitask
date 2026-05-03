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

interface Product {
  id:          string
  name:        string
  description: string | null
  price:       string | null
  videoUrl:    string | null
  features:    unknown
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

// ── Base system prompt (cacheable) ───────────────────────
const BASE_SYSTEM_PROMPT = `Você é um assistente comercial especializado, conversando via WhatsApp em nome da empresa.
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
- Quando o momento for certo, recomendar o produto mais adequado ao perfil do lead
- Compartilhar o link do vídeo do produto no momento certo (após identificar interesse genuíno)
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
- Envie o link do vídeo apenas uma vez, quando o lead já demonstrou interesse
- Responda em português brasileiro

## FORMATO DE RESPOSTA OBRIGATÓRIO
Ao final de CADA resposta, inclua EXATAMENTE este bloco JSON (sem markdown, sem código):

[AI_DECISION]
{"reply":"<mensagem para enviar ao decisor>","move_to_stage":"<ETAPA_OU_NULL>","recommended_product_id":"<ID_DO_PRODUTO_OU_NULL>"}
[/AI_DECISION]

Os campos:
- "move_to_stage": etapa para avançar ("NIVEL_CONSCIENCIA_1"..."FECHADO") ou null
- "recommended_product_id": ID do produto mais adequado para este lead, ou null se ainda não há informação suficiente

Exemplo correto:
[AI_DECISION]
{"reply":"Olá João! Vi que a Tech Solutions está crescendo bastante. Quais são os principais desafios que vocês enfrentam hoje em dia?","move_to_stage":null,"recommended_product_id":null}
[/AI_DECISION]`

// ── Gera system prompt com catálogo de produtos ───────────
function buildSystemPrompt(products: Product[]): string {
  if (!products.length) return BASE_SYSTEM_PROMPT

  const catalog = products.map((p) => {
    const features = Array.isArray(p.features) ? (p.features as string[]).join(', ') : ''
    return [
      `ID: ${p.id}`,
      `Nome: ${p.name}`,
      p.description ? `Descrição: ${p.description}` : '',
      p.price       ? `Preço: ${p.price}` : '',
      features       ? `Diferenciais: ${features}` : '',
      p.videoUrl     ? `Vídeo de apresentação: ${p.videoUrl}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n---\n\n')

  return `${BASE_SYSTEM_PROMPT}

## CATÁLOGO DE PRODUTOS DISPONÍVEIS
Use estes produtos para recomendar ao lead no momento certo. Escolha o mais adequado com base na conversa.

${catalog}

Quando enviar o link do vídeo, inclua-o naturalmente na mensagem, ex: "Tenho um vídeo curto que explica exatamente isso: [link]"`
}

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
  async sendFirstMessage(
    lead:           Lead,
    decisionMaker:  DecisionMaker,
    products:       Product[] = [],
  ): Promise<string | null> {
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
- Terminar com uma pergunta aberta sobre desafios
- NÃO mencione produtos ou preços ainda`

    try {
      const response = await this.client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 512,
        system: [
          {
            type:          'text',
            text:          buildSystemPrompt(products),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      })

      const result = this.parseAiResponse(response)
      if (!result) return null

      await this.whatsapp.sendMessage({ phone, message: result.reply })
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
    products:            Product[] = [],
  ): Promise<AiReplyResult & { recommendedProductId: string | null }> {
    if (!this.client) {
      return { reply: '', nextStage: null, tokensUsed: 0, recommendedProductId: null }
    }

    const context = `Lead: ${lead.companyName}${
      lead.decisionMakers[0]
        ? ` | Decisor: ${lead.decisionMakers[0].name}${lead.decisionMakers[0].role ? ` (${lead.decisionMakers[0].role})` : ''}`
        : ''
    }`

    const messages: Anthropic.Messages.MessageParam[] = []

    if (conversationHistory.length === 0) {
      messages.push({
        role:    'user',
        content: `[Contexto: ${context}]\n\nMensagem do decisor: ${incomingMessage}`,
      })
    } else {
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
            text:          buildSystemPrompt(products),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      })

      const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0)
      const result     = this.parseAiResponse(response)

      if (!result) {
        return { reply: '', nextStage: null, tokensUsed, recommendedProductId: null }
      }

      return {
        reply:                result.reply,
        nextStage:            result.nextStage,
        tokensUsed,
        recommendedProductId: result.recommendedProductId,
      }
    } catch (err) {
      console.error('[CrmAI] handleLeadReply error:', err)
      return { reply: '', nextStage: null, tokensUsed: 0, recommendedProductId: null }
    }
  }

  // ── Parser da resposta do Claude ─────────────────────────
  private parseAiResponse(
    response: Anthropic.Messages.Message,
  ): { reply: string; nextStage: CrmStage | null; recommendedProductId: string | null } | null {
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const text = textBlock.text

    const match = text.match(/\[AI_DECISION\]\s*([\s\S]*?)\s*\[\/AI_DECISION\]/)
    if (!match) {
      console.warn('[CrmAI] No AI_DECISION block found in response')
      return {
        reply:               text.replace(/\[AI_DECISION\][\s\S]*?\[\/AI_DECISION\]/g, '').trim(),
        nextStage:           null,
        recommendedProductId: null,
      }
    }

    try {
      const parsed = JSON.parse(match[1].trim()) as {
        reply:                  string
        move_to_stage:          string | null
        recommended_product_id: string | null
      }

      const VALID_STAGES: CrmStage[] = [
        'NIVEL_CONSCIENCIA_1', 'NIVEL_CONSCIENCIA_2', 'NIVEL_CONSCIENCIA_3',
        'FINALIZADO', 'FECHADO',
      ]

      const nextStage = parsed.move_to_stage && VALID_STAGES.includes(parsed.move_to_stage as CrmStage)
        ? (parsed.move_to_stage as CrmStage)
        : null

      return {
        reply:               parsed.reply,
        nextStage,
        recommendedProductId: parsed.recommended_product_id ?? null,
      }
    } catch (err) {
      console.error('[CrmAI] JSON parse error:', err, 'Raw:', match[1])
      return null
    }
  }
}

export const crmAi = new CrmAiService()
export { STAGE_LABELS }
