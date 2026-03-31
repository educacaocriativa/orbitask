'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { cn, formatDeadline, getPriorityIcon } from '@/lib/utils'
import { useBoardStore } from '@/stores/boardStore'

interface SearchCard {
  id: string; title: string; priority: string; isOverdue: boolean
  deadline?: string
  currentColumn: { id: string; title: string; color: string }
  board: { id: string; title: string }
}

interface SearchBoard {
  id: string; title: string; color: string
  _count: { columns: number; cards: number }
}

export function GlobalSearch() {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [cards, setCards]     = useState<SearchCard[]>([])
  const [boards, setBoards]   = useState<SearchBoard[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()
  const { setOpenCard } = useBoardStore()

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setCards([]); setBoards([]) }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) { setCards([]); setBoards([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get('/search', { params: { q: query } })
        setCards(data.cards)
        setBoards(data.boards)
        setSelected(0)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }, 280)
    return () => clearTimeout(t)
  }, [query])

  const allResults = [
    ...boards.map((b) => ({ type: 'board' as const, data: b })),
    ...cards.map((c)  => ({ type: 'card'  as const, data: c })),
  ]

  function navigate(item: typeof allResults[0]) {
    setOpen(false)
    if (item.type === 'board') {
      router.push(`/board/${(item.data as SearchBoard).id}`)
    } else {
      const card = item.data as SearchCard
      router.push(`/board/${card.board.id}`)
      setTimeout(() => setOpenCard(card.id), 400)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && allResults[selected]) navigate(allResults[selected])
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-body',
          'bg-white/4 border border-white/8 text-white/35',
          'hover:bg-white/7 hover:text-white/60 hover:border-white/14',
          'transition-all duration-200',
        )}
      >
        <span>🔭</span>
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-white/20">
          ⌘K
        </kbd>
      </button>

      {/* Search overlay */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -16 }}
              transition={{ type: 'spring', damping: 24, stiffness: 360 }}
              className="relative w-full max-w-xl"
            >
              {/* Search input */}
              <div className="glass rounded-2xl overflow-hidden shadow-glass">
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/6">
                  <span className="text-lg shrink-0">{loading ? '⏳' : '🔭'}</span>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Buscar cards, boards, missões..."
                    className="flex-1 bg-transparent text-sm font-body text-white placeholder-white/25 focus:outline-none"
                  />
                  <kbd className="text-[10px] font-mono text-white/20 bg-white/5 px-1.5 py-0.5 rounded-md border border-white/8">ESC</kbd>
                </div>

                {/* Results */}
                <div className="max-h-[50vh] overflow-y-auto scrollbar-space p-2">
                  {query.length < 2 && (
                    <div className="py-8 text-center text-white/20 text-sm font-body">
                      <div className="text-3xl mb-2">🌌</div>
                      Digite para explorar o universo...
                    </div>
                  )}

                  {query.length >= 2 && allResults.length === 0 && !loading && (
                    <div className="py-8 text-center text-white/25 text-sm font-body">
                      <div className="text-3xl mb-2">🛸</div>
                      Nenhum resultado para "{query}"
                    </div>
                  )}

                  {/* Boards */}
                  {boards.length > 0 && (
                    <div className="mb-2">
                      <div className="px-2 py-1 text-[10px] font-display tracking-widest text-white/25 uppercase">Boards</div>
                      {boards.map((board, i) => {
                        const idx = i
                        return (
                          <button key={board.id} onClick={() => navigate({ type: 'board', data: board })}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                              selected === idx ? 'bg-white/8' : 'hover:bg-white/4',
                            )}
                          >
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: board.color + '25', border: `1px solid ${board.color}40` }}>
                              🛸
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-body text-white/85 truncate">{board.title}</div>
                              <div className="text-[11px] text-white/30 font-body">
                                {board._count.columns} colunas · {board._count.cards} cards
                              </div>
                            </div>
                            <span className="text-white/20 text-xs">→</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Cards */}
                  {cards.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-display tracking-widest text-white/25 uppercase">Cards</div>
                      {cards.map((card, i) => {
                        const idx = boards.length + i
                        return (
                          <button key={card.id} onClick={() => navigate({ type: 'card', data: card })}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                              selected === idx ? 'bg-white/8' : 'hover:bg-white/4',
                            )}
                          >
                            <span className="text-lg shrink-0">{getPriorityIcon(card.priority)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-body text-white/85 truncate">{card.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-white/30 font-body">{card.board.title}</span>
                                <span className="text-white/15">·</span>
                                <span className="text-[11px] font-body" style={{ color: card.currentColumn.color }}>
                                  {card.currentColumn.title}
                                </span>
                                {card.deadline && (
                                  <>
                                    <span className="text-white/15">·</span>
                                    <span className={cn('text-[10px] font-body', card.isOverdue ? 'text-red-400' : 'text-white/30')}>
                                      {card.isOverdue ? '⚠️ ' : '⏱ '}{formatDeadline(card.deadline)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

