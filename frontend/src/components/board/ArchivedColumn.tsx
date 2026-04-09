'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, type Card } from '@/stores/boardStore'
import { cn, formatDeadline, getPriorityIcon } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ArchivedColumnProps {
  boardId: string
  onHasCards?: (has: boolean) => void
}

export function ArchivedColumn({ boardId, onHasCards }: ArchivedColumnProps) {
  const { fetchArchivedCards, restoreCard, fetchBoard } = useBoardStore()
  const [cards, setCards]         = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  async function load() {
    setIsLoading(true)
    try {
      const archived = await fetchArchivedCards(boardId)
      setCards(archived)
      onHasCards?.(archived.length > 0)
    } catch {
      toast.error('Erro ao carregar cards arquivados')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [boardId])

  async function handleRestore(cardId: string) {
    setRestoring(cardId)
    try {
      await restoreCard(cardId)
      await fetchBoard(boardId)
      const next = cards.filter((c) => c.id !== cardId)
      setCards(next)
      onHasCards?.(next.length > 0)
      toast.success('Card restaurado ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao restaurar card')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      className="shrink-0 flex flex-col"
      style={{ width: 'var(--col-width)' }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-t-2xl border-t border-x border-red-500/20"
        style={{ background: 'rgba(239,68,68,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <span className="text-xs font-display font-bold tracking-widest text-red-400/80 uppercase">
            Arquivados
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/12 border border-red-500/25 text-red-400 font-mono">
            {cards.length}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed((p) => !p)}
          className="text-white/25 hover:text-white/60 transition-colors text-xs"
        >
          {isCollapsed ? '▼' : '▲'}
        </button>
      </div>

      {/* Cards list */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-2 p-2 rounded-b-2xl border-b border-x border-red-500/15 overflow-y-auto scrollbar-space"
            style={{ background: 'rgba(239,68,68,0.03)', maxHeight: 840 }}
          >
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-2xl">
                  🗃
                </motion.div>
              </div>
            )}

            {!isLoading && cards.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <span className="text-2xl">📭</span>
                <p className="text-xs text-white/25 font-body text-center">
                  Nenhum card arquivado
                </p>
              </div>
            )}

            {!isLoading && cards.map((card) => (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative group rounded-xl p-3 border border-red-500/15 bg-red-950/20 hover:border-red-500/28 hover:bg-red-950/28 transition-all"
              >
                {/* Priority stripe */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-50"
                  style={{ background: getPriorityColor(card.priority) }}
                />

                {/* Archived badge */}
                <div className="flex items-center justify-between gap-2 mb-1.5 pl-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs">{getPriorityIcon(card.priority)}</span>
                    <h4 className="text-xs font-body font-medium text-white/70 leading-snug line-clamp-2 flex-1">
                      {card.title}
                    </h4>
                  </div>
                </div>

                {/* Original column */}
                {(card as any).archivedFromColumn && (
                  <div className="pl-2 mb-2">
                    <span className="text-[10px] text-white/30 font-body">
                      📂 Era em:{' '}
                      <span
                        className="font-semibold"
                        style={{ color: (card as any).archivedFromColumn.color + 'aa' }}
                      >
                        {(card as any).archivedFromColumn.title}
                      </span>
                    </span>
                  </div>
                )}

                {/* Archive date */}
                {card.archivedAt && (
                  <div className="pl-2 mb-2">
                    <span className="text-[10px] text-white/25 font-mono">
                      🗃 {new Date(card.archivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Restore button */}
                <div className="pl-2">
                  <button
                    onClick={() => handleRestore(card.id)}
                    disabled={restoring === card.id}
                    className={cn(
                      'text-[11px] px-3 py-1 rounded-lg border font-body font-bold transition-all',
                      'border-neon-cyan/25 text-neon-cyan/60 bg-neon-cyan/6',
                      'hover:border-neon-cyan/50 hover:text-neon-cyan hover:bg-neon-cyan/12',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    {restoring === card.id ? '⏳ Restaurando...' : '↩ Restaurar card'}
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function getPriorityColor(priority: string): string {
  return { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }[priority] ?? '#a855f7'
}
