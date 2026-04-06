'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Board } from '@/stores/boardStore'

interface MoveCardModalProps {
  open: boolean
  onConfirm: (deadline: string) => Promise<void>
  onCancel: () => void
  targetColumnId?: string
  board?: Board | null
  sourceDriveFolderUrl?: string | null
}

export function MoveCardModal({ open, onConfirm, onCancel, targetColumnId, board, sourceDriveFolderUrl }: MoveCardModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const targetColumn = board?.columns.find((c) => c.id === targetColumnId)

  async function handleConfirm() {
    setIsLoading(true)
    try {
      // Deadline automático: 24 horas a partir de agora
      const deadline24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await onConfirm(deadline24h)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative w-full max-w-sm glass rounded-2xl p-6 shadow-glass"
          >
            {/* Top glow */}
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-amber/60 to-transparent" />

            {/* Icon */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                🚀
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold tracking-wider text-white">
                  CONFIRMAR MOVIMENTAÇÃO
                </h3>
                <p className="text-xs text-white/40 font-body mt-0.5">
                  O responsável terá 24h para avançar
                </p>
              </div>
            </div>

            {/* Target column info */}
            {targetColumn && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
                style={{
                  background: `${targetColumn.color}10`,
                  border: `1px solid ${targetColumn.color}30`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: targetColumn.color }}
                />
                <span className="text-xs font-body text-white/60">Destino:</span>
                <span className="text-xs font-display font-semibold text-white/90">
                  {targetColumn.title}
                </span>
                <span className="ml-auto text-xs text-white/40 font-body">
                  👤 {targetColumn.owner.name.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Drive: buscar arquivo da etapa anterior */}
            {sourceDriveFolderUrl && (
              <a
                href={sourceDriveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl mb-3 w-full transition-all',
                  'border border-blue-500/25 hover:border-blue-400/50',
                  'bg-blue-500/8 hover:bg-blue-500/15',
                )}
              >
                <span className="text-lg">📁</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-semibold text-blue-300">
                    Buscar arquivo da etapa anterior
                  </p>
                  <p className="text-[11px] text-white/30 font-body truncate mt-0.5">
                    Abrir pasta do Google Drive →
                  </p>
                </div>
              </a>
            )}

            {/* 24h info */}
            <div
              className="flex items-center gap-3 px-3 py-3 rounded-xl mb-5"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <span className="text-lg">⏱</span>
              <div>
                <p className="text-xs font-display font-semibold text-amber-300">
                  Prazo automático: 24 horas
                </p>
                <p className="text-[11px] text-white/35 font-body mt-0.5">
                  {sourceDriveFolderUrl
                    ? 'Após confirmar, um link para depositar o arquivo será gerado 📤'
                    : 'O dono da etapa será notificado via WhatsApp 🛸'
                  }
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-sm font-body',
                  'border border-white/10 text-white/50',
                  'hover:bg-white/5 hover:text-white/70 transition-all',
                )}
              >
                Cancelar
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                disabled={isLoading}
                className={cn(
                  'flex-[2] py-2.5 rounded-xl text-sm font-display font-semibold tracking-wider',
                  'text-white uppercase transition-all',
                  'disabled:opacity-50',
                )}
                style={{ background: 'linear-gradient(135deg, #7c3aed, #f59e0b)' }}
              >
                {isLoading ? '⚡ Movendo...' : '🚀 Confirmar Movimento'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
