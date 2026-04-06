'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useBoardStore } from '@/stores/boardStore'

interface OverdueCard {
  id: string
  title: string
  columnEnteredAt: string
  currentColumn: {
    id: string; title: string; color: string
    owner: { id: string; name: string }
    columnMembers: { user: { id: string; name: string } }[]
  }
}

interface OverdueBannerProps {
  boardId: string
}

function hoursAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60))
}

export function OverdueBanner({ boardId }: OverdueBannerProps) {
  const { fetchOverdueCards } = useBoardStore()
  const [cards,     setCards]     = useState<OverdueCard[]>([])
  const [expanded,  setExpanded]  = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    // Fetch every time this component mounts (i.e. every time coordinator enters the board)
    fetchOverdueCards(boardId)
      .then((data) => {
        setCards(data as unknown as OverdueCard[])
        setDismissed(false) // reset dismiss on re-entry
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [boardId])

  if (!loaded || cards.length === 0 || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="shrink-0 mx-5 mt-3 rounded-2xl border border-amber-500/35 bg-amber-500/8 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 animate-pulse">⚠</span>
            <span className="text-xs font-display font-bold tracking-widest text-amber-300 uppercase">
              {cards.length} card{cards.length > 1 ? 's' : ''} sem movimentação há mais de 24h
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-amber-400/70 hover:text-amber-300 font-body transition-colors"
            >
              {expanded ? '▲ recolher' : '▼ ver detalhes'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/30 hover:text-white/60 transition-colors text-sm ml-1"
              title="Dispensar alerta (reaparece na próxima visita)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Card list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
                {cards.map((card) => {
                  const responsible = card.currentColumn.owner
                  const hours = hoursAgo(card.columnEnteredAt)
                  return (
                    <div key={card.id} className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl',
                      'bg-amber-500/5 border border-amber-500/20',
                    )}>
                      {/* Column color dot */}
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: card.currentColumn.color }}
                      />
                      {/* Card title */}
                      <span className="text-xs font-body font-semibold text-white/85 flex-1 truncate">
                        {card.title}
                      </span>
                      {/* Column */}
                      <span className="text-[11px] text-white/45 font-body hidden sm:block shrink-0">
                        {card.currentColumn.title}
                      </span>
                      {/* Responsible */}
                      <span className="text-[11px] text-amber-300/70 font-body shrink-0">
                        👤 {responsible.name.split(' ')[0]}
                      </span>
                      {/* Hours */}
                      <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0">
                        {hours}h
                      </span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
