'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '@/stores/boardStore'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ArchivedColumn {
  id: string
  title: string
  color: string
  position: number
  owner: { id: string; name: string; avatarUrl?: string }
  _count: { cards: number }
  updatedAt: string
}

interface ArchivedColumnsModalProps {
  boardId: string
  onClose: () => void
  onRestored?: () => void
}

export function ArchivedColumnsModal({ boardId, onClose, onRestored }: ArchivedColumnsModalProps) {
  const { fetchArchivedColumns, restoreColumn, fetchBoard } = useBoardStore()
  const [columns, setColumns]   = useState<ArchivedColumn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    fetchArchivedColumns(boardId)
      .then((archived) => setColumns(archived))
      .catch(() => toast.error('Erro ao carregar etapas arquivadas'))
      .finally(() => setIsLoading(false))
  }, [boardId])

  async function handleRestore(columnId: string) {
    setRestoring(columnId)
    try {
      await restoreColumn(columnId)
      await fetchBoard(boardId)
      setColumns((prev) => prev.filter((c) => c.id !== columnId))
      onRestored?.()
      toast.success('Etapa restaurada ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao restaurar etapa')
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
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-500/70" />
            <span className="text-sm font-display font-bold tracking-widest text-amber-400/90 uppercase">
              Etapas Arquivadas
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-500/14 border border-amber-500/28 text-amber-400 font-mono">
              {columns.length}
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

          {!isLoading && columns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm text-white/30 font-body text-center">
                Nenhuma etapa arquivada nesta missão
              </p>
            </div>
          )}

          <AnimatePresence>
            {!isLoading && columns.map((col) => (
              <motion.div
                key={col.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative rounded-xl p-3.5 border border-amber-500/15 bg-amber-950/20 hover:border-amber-500/28 transition-all"
                style={{ borderLeft: `3px solid ${col.color}60` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                      <h4 className="text-sm font-display font-bold text-white/85 leading-snug">
                        {col.title}
                      </h4>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 flex-wrap mt-1.5">
                      <span className="text-[11px] text-white/35 font-body">
                        👤 {col.owner.name.split(' ')[0]}
                      </span>
                      <span className="text-[11px] text-white/35 font-body">
                        🃏 {col._count.cards} card{col._count.cards !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] text-white/22 font-mono">
                        🗃 {new Date(col.updatedAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Restore */}
                  <button
                    onClick={() => handleRestore(col.id)}
                    disabled={restoring === col.id}
                    className={cn(
                      'shrink-0 text-[11px] px-3 py-1.5 rounded-lg border font-display font-black transition-all',
                      'border-neon-cyan/25 text-neon-cyan/60 bg-neon-cyan/6',
                      'hover:border-neon-cyan/50 hover:text-neon-cyan hover:bg-neon-cyan/12',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    {restoring === col.id ? '⏳' : '↩ Restaurar'}
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
