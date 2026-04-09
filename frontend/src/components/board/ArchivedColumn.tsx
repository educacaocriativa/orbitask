'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, type Card } from '@/stores/boardStore'
import { cn, getPriorityIcon } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ArchivedCardsModalProps {
  boardId: string
  onClose: () => void
  onRestored?: () => void
}

export function ArchivedColumn({ boardId, onClose, onRestored }: ArchivedCardsModalProps) {
  const { fetchArchivedCards, restoreCard, fetchBoard } = useBoardStore()
  const [cards, setCards]         = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    fetchArchivedCards(boardId)
      .then((archived) => setCards(archived))
      .catch(() => toast.error('Erro ao carregar cards arquivados'))
      .finally(() => setIsLoading(false))
  }, [boardId])

  async function handleRestore(cardId: string) {
    setRestoring(cardId)
    try {
      await restoreCard(cardId)
      await fetchBoard(boardId)
      setCards((prev) => prev.filter((c) => c.id !== cardId))
      onRestored?.()
      toast.success('Card restaurado ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao restaurar card')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[80vh] glass rounded-2xl overflow-hidden flex flex-col shadow-glass"
      >
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-red-500/70" />
            <span className="text-sm font-display font-bold tracking-widest text-red-400/90 uppercase">
              Cards Arquivados
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-red-500/14 border border-red-500/28 text-red-400 font-mono">
              {cards.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/35 hover:text-white/80 transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-space p-4 space-y-2.5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="text-3xl"
              >
                🗃
              </motion.div>
            </div>
          )}

          {!isLoading && cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm text-white/30 font-body text-center">
                Nenhum card arquivado nesta missão
              </p>
            </div>
          )}

          <AnimatePresence>
            {!isLoading && cards.map((card) => (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative rounded-xl p-3.5 border border-red-500/15 bg-red-950/20 hover:border-red-500/28 transition-all"
              >
                {/* Priority stripe */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-50"
                  style={{ background: getPriorityColor(card.priority) }}
                />

                <div className="pl-2">
                  {/* Title */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{getPriorityIcon(card.priority)}</span>
                    <h4 className="text-sm font-body font-semibold text-white/80 leading-snug flex-1">
                      {card.title}
                    </h4>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 mb-2.5 flex-wrap">
                    {(card as any).archivedFromColumn && (
                      <span className="text-[11px] text-white/30 font-body">
                        📂{' '}
                        <span
                          className="font-semibold"
                          style={{ color: (card as any).archivedFromColumn.color + 'bb' }}
                        >
                          {(card as any).archivedFromColumn.title}
                        </span>
                      </span>
                    )}
                    {card.archivedAt && (
                      <span className="text-[10px] text-white/22 font-mono">
                        🗃 {new Date(card.archivedAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {/* Restore */}
                  <button
                    onClick={() => handleRestore(card.id)}
                    disabled={restoring === card.id}
                    className={cn(
                      'text-[11px] px-3 py-1.5 rounded-lg border font-display font-black transition-all',
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
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

function getPriorityColor(priority: string): string {
  return { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }[priority] ?? '#a855f7'
}
