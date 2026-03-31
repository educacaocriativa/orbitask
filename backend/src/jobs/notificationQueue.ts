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

// ── Cron: Check overdue cards every 2 hours ──────────────
export function startDeadlineCron() {
  cron.schedule('0 */2 * * *', async () => {
    console.log('⏰ Running overdue deadline check...')

    const overdueCards = await prisma.card.findMany({
      where: {
        deadline: { lt: new Date() },
        isArchived: false,
        isOverdue: false,
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

    console.log(`📋 Found ${overdueCards.length} newly overdue cards`)

    for (const card of overdueCards) {
      // Mark card as overdue
      await prisma.card.update({
        where: { id: card.id },
        data: { isOverdue: true },
      })

      // Notify column owner
      if (card.currentColumn.owner.phoneWhatsapp) {
        const ownerNotification = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: card.currentColumn.owner.id,
            cardId: card.id,
            columnId: card.currentColumn.id,
            scheduledFor: new Date(),
            payload: {
              retryCount: 0,
              isColumnOwner: true,
            },
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', ownerNotification.id)
      }

      // Notify card creator (project chief) if different from column owner
      if (
        card.creator.phoneWhatsapp &&
        card.creator.id !== card.currentColumn.owner.id
      ) {
        const creatorNotification = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: card.creator.id,
            cardId: card.id,
            columnId: card.currentColumn.id,
            scheduledFor: new Date(),
            payload: {
              retryCount: 0,
              isCreator: true,
            },
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', creatorNotification.id)
      }
    }

    // Send REPEATED alerts for already-overdue cards (every 2 hours)
    const alreadyOverdueCards = await prisma.card.findMany({
      where: {
        deadline: { lt: new Date() },
        isArchived: false,
        isOverdue: true,
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

    for (const card of alreadyOverdueCards) {
      const recipients = [
        card.currentColumn.owner,
        ...(card.creator.id !== card.currentColumn.owner.id ? [card.creator] : []),
      ].filter((r) => r.phoneWhatsapp)

      for (const recipient of recipients) {
        const notification = await prisma.notificationQueue.create({
          data: {
            type: 'DEADLINE_EXPIRED',
            recipientId: recipient.id,
            cardId: card.id,
            columnId: card.currentColumnId,
            scheduledFor: new Date(),
            payload: { retryCount: 1, isRepeatedAlert: true },
          },
        })
        await enqueueNotification('DEADLINE_EXPIRED', notification.id)
      }
    }

    console.log('✅ Deadline cron completed')
  })

  console.log('⏰ Deadline cron scheduled (every 2 hours)')
}

