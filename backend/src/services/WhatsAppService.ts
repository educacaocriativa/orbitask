import axios from 'axios'
import { env } from '../config/env'
import { prisma } from '../database/prisma'
import { NotificationType } from '@prisma/client'

const evolutionClient = axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: {
    apikey: env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

interface SendMessageParams {
  phone: string // format: 5511999999999 (no + or spaces)
  message: string
}

interface SendMessageResult {
  success: boolean
  messageId?: string
  remoteJid?: string
}

export class WhatsAppService {
  private instance = env.EVOLUTION_INSTANCE

  // ── Core send function ──────────────────────────────────
  async sendMessage({ phone, message }: SendMessageParams): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/\D/g, '')

      await evolutionClient.post(`/message/sendText/${this.instance}`, {
        number: cleanPhone,
        text: message,
        delay: 1000,
      })

      return true
    } catch (error) {
      console.error(`❌ WhatsApp send failed to ${phone}:`, error)
      return false
    }
  }

  // ── Message Templates ───────────────────────────────────

  async sendMessageWithResult({ phone, message }: SendMessageParams): Promise<SendMessageResult> {
    try {
      const cleanPhone = phone.replace(/\D/g, '')

      const response = await evolutionClient.post(`/message/sendText/${this.instance}`, {
        number: cleanPhone,
        text: message,
        delay: 1000,
      })

      const payload = response.data as any
      return {
        success: true,
        messageId: payload?.key?.id
          ?? payload?.keyId
          ?? payload?.messageId
          ?? payload?.id
          ?? payload?.message?.key?.id
          ?? payload?.data?.key?.id
          ?? payload?.data?.keyId
          ?? payload?.data?.messageId
          ?? payload?.data?.id,
        remoteJid: payload?.key?.remoteJid
          ?? payload?.remoteJid
          ?? payload?.message?.key?.remoteJid
          ?? payload?.data?.key?.remoteJid
          ?? payload?.data?.remoteJid,
      }
    } catch (error) {
      console.error(`WhatsApp send failed to ${phone}:`, error)
      return { success: false }
    }
  }

  async notifyCardMoved(params: {
    recipientPhone: string
    recipientName: string
    cardTitle: string
    cardId: string
    boardId: string
    fromColumn: string
    toColumn: string
    movedBy: string
    boardTitle: string
    deadline?: Date
  }) {
    const deadlineText = params.deadline
      ? `\n⏰ *Prazo:* ${params.deadline.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : ''

    const cardLink = `${env.FRONTEND_URL}/board/${params.boardId}?card=${params.cardId}`

    const message = [
      `🚀 *Orbitask — Card Movido*`,
      ``,
      `Olá, ${params.recipientName}!`,
      ``,
      `O card *"${params.cardTitle}"* foi movido para a sua coluna.`,
      ``,
      `📋 *Board:* ${params.boardTitle}`,
      `📂 *De:* ${params.fromColumn}`,
      `📂 *Para:* ${params.toColumn}`,
      `👤 *Movido por:* ${params.movedBy}`,
      deadlineText,
      ``,
      `🔗 Abrir card: ${cardLink}`,
    ].join('\n')

    return this.sendMessage({ phone: params.recipientPhone, message })
  }

  async notifyAnnouncement(params: {
    recipientPhone: string
    recipientName: string
    title: string
    content: string
    sentBy: string
  }) {
    const message = [
      `📢 *Orbitask — Novo Comunicado*`,
      ``,
      `Olá, ${params.recipientName}!`,
      ``,
      `*${params.sentBy}* enviou um novo comunicado.`,
      ``,
      `📌 *${params.title}*`,
      ``,
      `${params.content.substring(0, 200)}${params.content.length > 200 ? '...' : ''}`,
      ``,
      `🔗 Acesse: ${env.FRONTEND_URL}`,
    ].join('\n')

    return this.sendMessage({ phone: params.recipientPhone, message })
  }

  async notifyMention(params: {
    recipientPhone: string
    recipientName: string
    mentionedBy: string
    cardTitle: string
    boardTitle: string
    contextPreview: string
  }) {
    const message = [
      `📎 *Orbitask — Você foi mencionado*`,
      ``,
      `Olá, ${params.recipientName}!`,
      ``,
      `*${params.mentionedBy}* te mencionou em um card.`,
      ``,
      `📋 *Board:* ${params.boardTitle}`,
      `🃏 *Card:* ${params.cardTitle}`,
      `💬 *Contexto:* "${params.contextPreview}"`,
      ``,
      `Acesse o Orbitask para responder.`,
    ].join('\n')

    return this.sendMessage({ phone: params.recipientPhone, message })
  }

  async notifyDeadlineExpired(params: {
    recipientPhone: string
    recipientName: string
    cardTitle: string
    boardTitle: string
    columnTitle: string
    expiredAt: Date
    isRepeatedAlert?: boolean
    cardId?: string
    boardId?: string
  }) {
    const expiredText = params.expiredAt.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const alertTag = params.isRepeatedAlert ? '🔴 *ALERTA REPETIDO*\n' : ''

    const cardLink = params.cardId && params.boardId
      ? `\n🔗 Abrir card: ${env.FRONTEND_URL}/board/${params.boardId}?card=${params.cardId}`
      : `\n🔗 Acesse: ${env.FRONTEND_URL}`

    const message = [
      `⚠️ *Orbitask — Prazo Expirado*`,
      ``,
      alertTag,
      `Olá, ${params.recipientName}!`,
      ``,
      `O prazo do card *"${params.cardTitle}"* já expirou!`,
      ``,
      `📋 *Board:* ${params.boardTitle}`,
      `📂 *Coluna:* ${params.columnTitle}`,
      `⏰ *Expirou em:* ${expiredText}`,
      cardLink,
    ].join('\n')

    return this.sendMessage({ phone: params.recipientPhone, message })
  }

  async notifyDeadlineWarning(params: {
    recipientPhone: string
    recipientName: string
    cardTitle: string
    boardTitle: string
    deadline: Date
    hoursRemaining: number
  }) {
    const deadlineText = params.deadline.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const message = [
      `🌙 *Orbitask — Prazo se Aproximando*`,
      ``,
      `Olá, ${params.recipientName}!`,
      ``,
      `O card *"${params.cardTitle}"* vence em *${params.hoursRemaining}h*.`,
      ``,
      `📋 *Board:* ${params.boardTitle}`,
      `⏰ *Deadline:* ${deadlineText}`,
      ``,
      `Não perca o prazo! Acesse o Orbitask.`,
    ].join('\n')

    return this.sendMessage({ phone: params.recipientPhone, message })
  }

  // ── Process notification from queue ────────────────────
  async processNotification(notificationId: string) {
    const notification = await prisma.notificationQueue.findUnique({
      where: { id: notificationId },
      include: {
        recipient: true,
        card: { include: { currentColumn: true, board: true } },
        column: true,
      },
    })

    if (!notification || !notification.recipient.phoneWhatsapp) return false

    const payload = notification.payload as Record<string, unknown>
    let success = false

    switch (notification.type) {
      case NotificationType.CARD_MOVED:
        success = await this.notifyCardMoved({
          recipientPhone: notification.recipient.phoneWhatsapp,
          recipientName: notification.recipient.name,
          cardTitle: notification.card?.title ?? '',
          cardId: notification.card?.id ?? '',
          boardId: notification.card?.board?.id ?? '',
          fromColumn: payload.fromColumn as string,
          toColumn: notification.column?.title ?? '',
          movedBy: payload.movedBy as string,
          boardTitle: notification.card?.board?.title ?? '',
          deadline: notification.card?.deadline ?? undefined,
        })
        break

      case NotificationType.DEADLINE_EXPIRED:
        success = await this.notifyDeadlineExpired({
          recipientPhone: notification.recipient.phoneWhatsapp,
          recipientName: notification.recipient.name,
          cardTitle: notification.card?.title ?? '',
          boardTitle: notification.card?.board?.title ?? '',
          columnTitle: notification.card?.currentColumn?.title ?? '',
          expiredAt: notification.card?.deadline ?? new Date(),
          isRepeatedAlert: (payload.retryCount as number) > 0,
          cardId: notification.card?.id,
          boardId: notification.card?.board?.id,
        })
        break

      default:
        break
    }

    // Update notification status
    await prisma.notificationQueue.update({
      where: { id: notificationId },
      data: {
        status: success ? 'SENT' : 'FAILED',
        sentAt: success ? new Date() : undefined,
        retryCount: { increment: success ? 0 : 1 },
      } as any,
    })

    return success
  }

  // ── Check Evolution API health ──────────────────────────
  async checkConnection(): Promise<{ connected: boolean; status?: string }> {
    try {
      const response = await evolutionClient.get(`/instance/fetchInstances`)
      const instances = response.data as Array<{ instance: { instanceName: string; status: string } }>
      const instance = instances.find(
        (i) => i.instance.instanceName === this.instance
      )
      return {
        connected: instance?.instance.status === 'open',
        status: instance?.instance.status,
      }
    } catch {
      return { connected: false }
    }
  }
}

