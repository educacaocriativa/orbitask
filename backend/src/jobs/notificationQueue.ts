import { Queue, Worker, Job } from 'bullmq'
import cron from 'node-cron'
import { bullRedis } from '../database/redis'
import { prisma } from '../database/prisma'
import { WhatsAppService } from '../services/WhatsAppService'

const whatsapp = new WhatsAppService()

// ── Queue Definition ────────────────────────────────────
export const notificationQueue = new Queue('notifications', {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

// ── Worker ───────────────────────────────────────────────
export const notificationWorker = new Worker(
  'notifications',
  async (job: Job) => {
    const { notificationId } = job.data
    console.log(`📨 Processing notification: ${notificationId} [type: ${job.name}]`)

    const success = await whatsapp.processNotification(notificationId)

    if (!success) {
      throw new Error(`Failed to send notification ${notificationId}`)
    }
  },
  { connection: bullRedis, concurrency: 5 }
)

notificationWorker.on('completed', (job) => {
  console.log(`✅ Notification job ${job.id} completed`)
})

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ Notification job ${job?.id} failed:`, err.message)
})

// ── Enqueue helpers ──────────────────────────────────────
export async function enqueueNotification(
  type: string,
  notificationId: string,
  delayMs = 0
) {
  await notificationQueue.add(
    type,
    { notificationId },
    { delay: delayMs }
  )
}

// ── Cron: Newly overdue cards — 10h (Brasília) ───────────
export function startDeadlineCron() {
  // 10:00 Brasília — notifica cards que venceram e ainda não foram marcados como overdue
  cron.schedule('0 10 * * *', async () => {
    console.log('⏰ [10h Brasília] Verificando cards recém-vencidos...')

    const overdueCards = await prisma.card.findMany({
      where: {
        deadline: { lt: new Date() },
        isArchived: false,
        isOverdue: false,
        board: { isArchived: false },
      },
      include: {
        creator: { select: { id: true, name: true, phoneWhatsapp: true } },
        currentColumn: {
          include: {
            owner: { select: { id: true, name: true, phoneWhatsapp: true } },
          },
        },
        board: { select: { id: true, title: true } },
      },
    })

    console.log(`📋 ${overdueCards.length} card(s) recém-vencido(s) encontrado(s)`)

    for (const card of overdueCards) {
      await prisma.card.update({
        where: { id: card.id },
        data: { isOverdue: true },
      })

      // Notifica dono da etapa
      if (card.currentColumn.owner.phoneWhatsapp) {
        const n = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: card.currentColumn.owner.id,
            cardId: card.id,
            columnId: card.currentColumn.id,
            scheduledFor: new Date(),
            payload: JSON.parse(JSON.stringify({ retryCount: 0, isColumnOwner: true })),
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', n.id)
      }

      // Notifica criador do card se for pessoa diferente do dono da etapa
      if (card.creator.phoneWhatsapp && card.creator.id !== card.currentColumn.owner.id) {
        const n = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: card.creator.id,
            cardId: card.id,
            columnId: card.currentColumn.id,
            scheduledFor: new Date(),
            payload: JSON.parse(JSON.stringify({ retryCount: 0, isCreator: true })),
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', n.id)
      }
    }

    console.log('✅ Cron 10h concluído')
  }, { timezone: 'America/Sao_Paulo' })

  // 11:00 Brasília — alerta repetido para cards que já estavam vencidos
  cron.schedule('0 11 * * *', async () => {
    console.log('⏰ [11h Brasília] Enviando alertas repetidos de prazo vencido...')

    const alreadyOverdueCards = await prisma.card.findMany({
      where: {
        deadline: { lt: new Date() },
        isArchived: false,
        isOverdue: true,
        board: { isArchived: false },
      },
      include: {
        creator: { select: { id: true, phoneWhatsapp: true } },
        currentColumn: {
          include: {
            owner: { select: { id: true, phoneWhatsapp: true } },
          },
        },
      },
    })

    console.log(`📋 ${alreadyOverdueCards.length} card(s) com alerta repetido`)

    for (const card of alreadyOverdueCards) {
      const recipients = [
        card.currentColumn.owner,
        ...(card.creator.id !== card.currentColumn.owner.id ? [card.creator] : []),
      ].filter((r) => r.phoneWhatsapp)

      for (const recipient of recipients) {
        const n = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: recipient.id,
            cardId: card.id,
            columnId: card.currentColumnId,
            scheduledFor: new Date(),
            payload: JSON.parse(JSON.stringify({ retryCount: 1, isRepeatedAlert: true })),
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', n.id)
      }
    }

    console.log('✅ Cron 11h concluído')
  }, { timezone: 'America/Sao_Paulo' })

  console.log('⏰ Crons de prazo agendados: 10h (novos) e 11h (repetidos) — Horário de Brasília')
}

