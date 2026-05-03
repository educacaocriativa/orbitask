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

interface Skill {
  id:          string
  name:        string
  description: string | null
  content:     string
  trigger:     string | null
}

interface Lead {
  id:             string
  companyName:    string
  companyPhone:   string | null
  segment?:       string | null
  decisionMakers: DecisionMaker[]
}

interface ConversationMessage {
  role:    'user' | 'assistant'
  content: string
}

interface AiReplyResult {
  reply:               string
  nextStage:           CrmStage | null
  tokensUsed:          number
  recommendedProductId: string | null
}

// ── Stage labels ──────────────────────────────────────────
const STAGE_LABELS: Record<CrmStage, string> = {
  LEAD:               'Lead',
  PRIMEIRO_CONTATO:   'Primeiro Contato',
  NIVEL_CONSCIENCIA_1:'Nível de Consciência 1 — reconhece o problema',
  NIVEL_CONSCIENCIA_2:'Nível de Consciência 2 — conhece soluções do mercado',
  NIVEL_CONSCIENCIA_3:'Nível de Consciência 3 — avaliando nossa solução',
  FINALIZADO:         'Finalizado — proposta em negociação',
  FECHADO:            'Fechado com o Cliente',
}

// ── Base do sistema de vendas (fundação técnica) ──────────
const SALES_FOUNDATION = `
## FUNDAÇÃO DE VENDAS CONSULTIVA

### Mentalidade
- Você é um consultor, não um vendedor. Seu trabalho é entender profundamente o problema do decisor antes de qualquer coisa.
- Ajude o decisor a enxergar o valor por conta própria — não empurre, guie.
- Cada mensagem tem um único objetivo claro. Nunca sobrecarregue com informação.

### Técnica SPIN (use progressivamente conforme a etapa)
- **Situação**: entenda o contexto atual da empresa ("Como vocês estão fazendo isso hoje?")
- **Problema**: identifique as dores reais ("O que mais incomoda nesse processo?")
- **Implicação**: amplie a percepção do impacto ("O que acontece quando isso falha?")
- **Necessidade de Solução**: faça o decisor articular o valor ("Como seria diferente se isso funcionasse bem?")

### Rapport e Escuta Ativa
- Sempre valide o que o decisor disse antes de avançar ("Entendo, então o principal desafio é...")
- Use o nome do decisor pelo menos uma vez por conversa
- Espelhe o tom: se a pessoa é direta, seja direto; se é conversacional, seja mais warm
- Referencie algo específico da empresa ou do segmento deles para mostrar que fez a lição de casa

### Tratamento de Objeções (Framework ACRA)
- **Acolha**: "Faz todo sentido essa preocupação..."
- **Clarifique**: "Só para entender melhor, o que específicamente te preocupa?"
- **Responda**: apresente o contra-argumento com evidência ou pergunta
- **Avance**: "Faz sentido? O que seria necessário para você se sentir seguro nisso?"

### Urgência Natural (nunca force)
- Use dados de mercado e exemplos do segmento para criar urgência
- "Tenho visto muitas empresas do seu segmento passando por isso exatamente agora..."
- Nunca: "Essa oferta expira hoje" ou pressão artificial

### Por Etapa do Funil
- **LEAD → PRIMEIRO_CONTATO**: mensagem personalizada, curiosidade, sem vender nada, termine com uma pergunta aberta
- **PRIMEIRO_CONTATO → NC1**: foque em identificar o problema central, faça perguntas de Situação e Problema
- **NC1 → NC2**: mostre que o problema tem solução, apresente possibilidades sem forçar a nossa
- **NC2 → NC3**: diferencie nossa solução, use prova social do segmento, apresente o vídeo do produto se relevante
- **NC3 → FINALIZADO**: gere urgência natural, trate objeções, proponha próximos passos concretos
- **FINALIZADO → FECHADO**: suporte à decisão, remova fricção final, celebre a decisão

### Sinais de Avanço de Etapa
- NC1: decisor menciona um desafio, dor ou objetivo
- NC2: pergunta sobre soluções ou alternativas disponíveis
- NC3: demonstra interesse específico em nossa proposta ou produto
- FINALIZADO: pede proposta, preço ou próximos passos
- FECHADO: confirma a decisão de fechar

### Regras de Comunicação no WhatsApp
- Mensagens curtas: máximo 3-4 linhas por vez
- Um assunto, uma pergunta por mensagem
- Nunca use lista com bullets — é informal e frio para WhatsApp
- Emojis com moderação: 1 por mensagem no máximo
- Sem formalidades excessivas — seja humano, não corporativo`

// ── Gera system prompt completo ───────────────────────────
function buildSystemPrompt(products: Product[], skills: Skill[]): string {
  const skillsSection = skills.length > 0
    ? `\n\n## SKILLS PERSONALIZADAS ATIVAS\nUse as técnicas abaixo quando o contexto da conversa for adequado:\n\n${
        skills.map((s, i) => [
          `### Skill ${i + 1}: ${s.name}`,
          s.trigger ? `**Quando usar:** ${s.trigger}` : '',
          s.description ? `**Descrição:** ${s.description}` : '',
          `**Técnica:**\n${s.content}`,
        ].filter(Boolean).join('\n')).join('\n\n---\n\n')
      }`
    : ''

  const catalogSection = products.length > 0
    ? `\n\n## CATÁLOGO DE PRODUTOS\nApresente o produto mais adequado ao momento certo da conversa. Envie o link do vídeo apenas uma vez, quando houver interesse genuíno.\n\n${
        products.map((p) => {
          const features = Array.isArray(p.features) ? (p.features as string[]).join(', ') : ''
          return [
            `**ID:** ${p.id}`,
            `**Nome:** ${p.name}`,
            p.description ? `**Descrição:** ${p.description}` : '',
            p.price       ? `**Preço:** ${p.price}` : '',
            features       ? `**Diferenciais:** ${features}` : '',
            p.videoUrl     ? `**Vídeo:** ${p.videoUrl}` : '',
          ].filter(Boolean).join('\n')
        }).join('\n\n---\n\n')
      }`
    : ''

  return `Você é um assistente comercial especializado em vendas consultivas, conversando via WhatsApp em nome da empresa.

## FUNIL DE VENDAS
1. LEAD — contato identificado, ainda não conversamos
2. PRIMEIRO_CONTATO — primeiro contato realizado, aguardando resposta
3. NIVEL_CONSCIENCIA_1 — decisor reconhece que tem um problema
4. NIVEL_CONSCIENCIA_2 — decisor sabe que existem soluções no mercado
5. NIVEL_CONSCIENCIA_3 — decisor conhece e avalia nossa solução
6. FINALIZADO — proposta enviada, negociação em andamento
7. FECHADO — cliente conquistado
${SALES_FOUNDATION}${skillsSection}${catalogSection}

## FORMATO DE RESPOSTA OBRIGATÓRIO
Ao final de CADA resposta, inclua EXATAMENTE este bloco (sem markdown):

[AI_DECISION]
{"reply":"<mensagem para o decisor>","move_to_stage":"<ETAPA_OU_NULL>","recommended_product_id":"<ID_OU_NULL>"}
[/AI_DECISION]

- "move_to_stage": próxima etapa apenas se houver sinal claro de progresso, senão null
- "recommended_product_id": ID do produto mais adequado ao perfil, ou null

Responda sempre em português brasileiro.`
}

// ── CRM AI Service ────────────────────────────────────────
export class CrmAiService {
  private client:   Anthropic | null
  private whatsapp: WhatsAppService

  constructor() {
    this.whatsapp = new WhatsAppService()
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      : null
  }

  get isConfigured(): boolean { return !!this.client }

  // ── Gera primeira mensagem ────────────────────────────────
  async sendFirstMessage(
    lead:          Lead,
    decisionMaker: DecisionMaker,
    products:      Product[] = [],
    skills:        Skill[]   = [],
  ): Promise<string | null> {
    if (!this.client) return null

    // Tenta telefone do decisor, depois da empresa
    const phone = decisionMaker.phonePersonal
               ?? decisionMaker.phoneCompany
               ?? lead.companyPhone
    if (!phone) {
      console.warn(`[CrmAI] sendFirstMessage: nenhum telefone encontrado para o lead ${lead.id} (${lead.companyName})`)
      return null
    }

    const senderName   = env.CRM_AI_SENDER_NAME  ?? 'Professor Tiago Mariano'
    const senderTitle  = env.CRM_AI_SENDER_TITLE ?? 'CEO da Educação Criativa'
    const companyName  = env.CRM_AI_COMPANY_NAME ?? 'Educação Criativa'

    const productContext = products.length > 0
      ? `\n\nProdutos da nossa empresa para contextualizar (NÃO mencione nomes ou preços ainda):\n${
          products.map(p => `- ${p.name}${p.description ? `: ${p.description}` : ''}`).join('\n')
        }`
      : ''

    const prompt = `Gere a PRIMEIRA mensagem de prospecção via WhatsApp para:
- Empresa: ${lead.companyName}${lead.segment ? ` (${lead.segment})` : ''}
- Decisor: ${decisionMaker.name}${decisionMaker.role ? ` — ${decisionMaker.role}` : ''}
- Quem envia: ${senderName}, ${senderTitle}
- Nossa empresa: ${companyName}${productContext}

REGRAS OBRIGATÓRIAS para esta primeira mensagem:
1. Chame o decisor PELO NOME (use apenas o primeiro nome)
2. Apresente-se como "${senderName}, ${senderTitle}"
3. Mencione brevemente o que a ${companyName} faz (use os produtos para contexto, mas NÃO cite nomes nem preços)
4. Seja muito curto: máximo 3-4 linhas no total
5. Termine com UMA pergunta aberta e consultiva sobre um desafio ou objetivo da empresa
6. Tom humano, caloroso, nunca corporativo
7. NÃO use palavras como "solução", "produto", "oferta", "proposta" ou "preço"`

    try {
      const response = await this.client.messages.create({
        model:      'claude-opus-4-7',
        max_tokens: 4096,
        thinking:   { type: 'adaptive' },
        system: [{
          type:          'text',
          text:          buildSystemPrompt(products, skills),
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{ role: 'user', content: prompt }],
      })

      const result = this.parseAiResponse(response)
      if (!result) {
        console.error('[CrmAI] parseAiResponse retornou null — resposta:', JSON.stringify(response.content))
        return null
      }

      await this.whatsapp.sendMessage({ phone, message: result.reply })
      return result.reply
    } catch (err: any) {
      console.error('[CrmAI] sendFirstMessage error:', err?.message ?? err)
      console.error('[CrmAI] detalhes:', JSON.stringify(err?.error ?? err?.status ?? ''))
      throw err  // propaga para o route handler mostrar o erro real
    }
  }

  // ── Processa resposta do lead ─────────────────────────────
  async handleLeadReply(
    lead:                Lead,
    incomingMessage:     string,
    conversationHistory: ConversationMessage[],
    products:            Product[] = [],
    skills:              Skill[]   = [],
  ): Promise<AiReplyResult> {
    if (!this.client) {
      return { reply: '', nextStage: null, tokensUsed: 0, recommendedProductId: null }
    }

    const context = `Lead: ${lead.companyName}${lead.segment ? ` [${lead.segment}]` : ''}${
      lead.decisionMakers[0]
        ? ` | Decisor: ${lead.decisionMakers[0].name}${lead.decisionMakers[0].role ? ` (${lead.decisionMakers[0].role})` : ''}`
        : ''
    }`

    const messages: Anthropic.Messages.MessageParam[] = conversationHistory.length === 0
      ? [{ role: 'user', content: `[Contexto: ${context}]\n\nMensagem do decisor: ${incomingMessage}` }]
      : [...conversationHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: incomingMessage }]

    try {
      const response = await this.client.messages.create({
        model:      'claude-opus-4-7',
        max_tokens: 2048,
        thinking:   { type: 'adaptive' },
        system: [{
          type:          'text',
          text:          buildSystemPrompt(products, skills),
          cache_control: { type: 'ephemeral' },
        }],
        messages,
      })

      const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0)
      const result     = this.parseAiResponse(response)

      if (!result) return { reply: '', nextStage: null, tokensUsed, recommendedProductId: null }

      return { reply: result.reply, nextStage: result.nextStage, tokensUsed, recommendedProductId: result.recommendedProductId }
    } catch (err) {
      console.error('[CrmAI] handleLeadReply error:', err)
      return { reply: '', nextStage: null, tokensUsed: 0, recommendedProductId: null }
    }
  }

  // ── Parser da resposta ────────────────────────────────────
  private parseAiResponse(
    response: Anthropic.Messages.Message,
  ): { reply: string; nextStage: CrmStage | null; recommendedProductId: string | null } | null {
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const text  = textBlock.text
    const match = text.match(/\[AI_DECISION\]\s*([\s\S]*?)\s*\[\/AI_DECISION\]/)

    if (!match) {
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

      const VALID: CrmStage[] = ['NIVEL_CONSCIENCIA_1','NIVEL_CONSCIENCIA_2','NIVEL_CONSCIENCIA_3','FINALIZADO','FECHADO']
      const nextStage = parsed.move_to_stage && VALID.includes(parsed.move_to_stage as CrmStage)
        ? (parsed.move_to_stage as CrmStage)
        : null

      return { reply: parsed.reply, nextStage, recommendedProductId: parsed.recommended_product_id ?? null }
    } catch (err) {
      console.error('[CrmAI] JSON parse error:', err)
      return null
    }
  }
}

export const crmAi = new CrmAiService()
export { STAGE_LABELS }
