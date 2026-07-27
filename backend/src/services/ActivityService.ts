import { prisma } from '../database/prisma'
import { Prisma } from '@prisma/client' // valor, não só tipo: usamos Prisma.JsonNull
import type { ActivityType } from '@prisma/client'

/**
 * Trilha de auditoria consultável por projeto + período.
 *
 * Toda linha carrega uma cópia dos nomes envolvidos (autor, projeto, missão,
 * etapa, pasta). Isso é intencional: renomear uma etapa em agosto não pode
 * mudar o que o relatório de junho diz, e apagar uma etapa não pode apagar o
 * histórico dela. Por isso a tabela também não tem foreign key nenhuma.
 */

export interface ActivityActor {
  id:    string
  name:  string
  email: string
}

export interface RecordActivityInput {
  type:  ActivityType
  actor: ActivityActor

  boardId:    string
  boardTitle: string

  cardId?:    string | null
  cardTitle?: string | null

  /** Etapa do evento — no CARD_MOVED é a etapa de ORIGEM. */
  columnId?:    string | null
  columnTitle?: string | null

  /** Só em CARD_MOVED. */
  toColumnId?:    string | null
  toColumnTitle?: string | null

  folderName?: string | null
  folderUrl?:  string | null

  detail?: Record<string, unknown> | null

  /** Padrão: agora. O backfill passa a data original. */
  occurredAt?: Date

  isBackfilled?: boolean
}

/**
 * Grava um evento de auditoria.
 *
 * Nunca lança: auditoria não pode derrubar a ação do usuário. Uma falha aqui
 * vira log no console e o request segue normalmente.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await prisma.activityEvent.create({ data: toRow(input) })
  } catch (err) {
    console.error(`ActivityEvent (${input.type}) não gravado:`, err)
  }
}

/**
 * Grava vários eventos de uma vez. Usado pelo backfill.
 * Diferente do recordActivity, propaga o erro — no backfill uma falha precisa
 * interromper o script em vez de gerar histórico pela metade em silêncio.
 */
export async function recordActivityBatch(inputs: RecordActivityInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  const result = await prisma.activityEvent.createMany({ data: inputs.map(toRow) })
  return result.count
}

function toRow(input: RecordActivityInput): Prisma.ActivityEventCreateManyInput {
  return {
    type: input.type,

    actorId:    input.actor.id || null,
    actorName:  input.actor.name  || '(não registrado)',
    actorEmail: input.actor.email || '',

    boardId:    input.boardId,
    boardTitle: input.boardTitle,

    cardId:    input.cardId    ?? null,
    cardTitle: input.cardTitle ?? null,

    columnId:    input.columnId    ?? null,
    columnTitle: input.columnTitle ?? null,

    toColumnId:    input.toColumnId    ?? null,
    toColumnTitle: input.toColumnTitle ?? null,

    folderName: input.folderName ?? null,
    folderUrl:  input.folderUrl  ?? null,

    // Prisma.JsonNull em vez de null: `detail: null` num campo Json opcional
    // é ambíguo no Prisma e falha a tipagem.
    detail: input.detail ? (JSON.parse(JSON.stringify(input.detail)) as Prisma.InputJsonValue) : Prisma.JsonNull,

    isBackfilled: input.isBackfilled ?? false,
    occurredAt:   input.occurredAt ?? new Date(),
  }
}
