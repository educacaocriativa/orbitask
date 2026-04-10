'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '@/stores/boardStore'
import { useBoardSocket } from '@/hooks/useBoardSocket'
import { Navbar } from '@/components/ui/Navbar'
import { KanbanBoard } from '@/components/board/KanbanBoard'
import { ArchivedColumn } from '@/components/board/ArchivedColumn'
import { ArchivedColumnsModal } from '@/components/board/ArchivedColumnsModal'
import { OverdueBanner } from '@/components/board/OverdueBanner'
import { ColumnManagerModal } from '@/components/board/ColumnManagerModal'
import { BoardManagerModal } from '@/components/board/BoardManagerModal'
import { BoardFilterBar, type FilterState } from '@/components/board/BoardFilterBar'
import { useAuthStore } from '@/stores/authStore'
import { ColumnSkeleton } from '@/components/ui/Skeletons'
import { cn } from '@/lib/utils'

export default function BoardPage() {
  const params       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const boardId      = params.id as string

  const { board, isLoading, fetchBoard, archiveCard, setOpenCard } = useBoardStore()
  const { broadcast } = useBoardSocket(boardId)

  const currentUser = useAuthStore((s) => s.user)
  const isAdmin     = currentUser?.role === 'ADMIN'
  const isCoordinator = board?.members.some(
    (m) => m.userId === currentUser?.id && m.role === 'COORDINATOR'
  ) ?? false
  const isPrivileged = isAdmin || isCoordinator
  const [showAddColumn,   setShowAddColumn]   = useState(false)
  const [showEditBoard,   setShowEditBoard]   = useState(false)
  const [showArchived,         setShowArchived]         = useState(false)
  const [showArchivedColumns,  setShowArchivedColumns]  = useState(false)
  const [archivedKey,          setArchivedKey]          = useState(0)
  const [archivedColumnsKey,   setArchivedColumnsKey]   = useState(0)
  const [filters, setFilters] = useState<FilterState>({
    priority: null, isOverdue: null, columnId: null, tag: null,
  })

  useEffect(() => { if (boardId) fetchBoard(boardId) }, [boardId])

  // Auto-open card from ?card= query param
  useEffect(() => {
    const cardId = searchParams.get('card')
    if (cardId && board) setOpenCard(cardId)
  }, [board, searchParams])

  async function handleArchive(cardId: string) {
    try {
      await archiveCard(cardId)
      setArchivedKey((k) => k + 1) // refresh archived column
    } catch {}
  }

  // Collect all unique tags across all cards
  const allTags = useMemo(() => {
    if (!board) return []
    const tags = new Set<string>()
    board.columns.forEach((col) => col.cards.forEach((card) => card.tags?.forEach((t) => tags.add(t))))
    return [...tags].sort()
  }, [board])

  // Apply filters to board columns for display
  const filteredBoard = useMemo(() => {
    if (!board) return null
    const hasFilter = filters.priority || filters.isOverdue !== null || filters.columnId || filters.tag
    if (!hasFilter) return board

    return {
      ...board,
      columns: board.columns.map((col) => {
        // If filtering by column, hide other columns' cards (keep column structure)
        if (filters.columnId && col.id !== filters.columnId) {
          return { ...col, cards: [] }
        }
        return {
          ...col,
          cards: col.cards.filter((card) => {
            if (filters.priority  && card.priority !== filters.priority)    return false
            if (filters.isOverdue && !card.isOverdue)                       return false
            if (filters.tag       && !card.tags?.includes(filters.tag))     return false
            return true
          }),
        }
      }),
    }
  }, [board, filters])

  const activeFiltersCount = [
    filters.priority, filters.isOverdue !== null, filters.columnId, filters.tag,
  ].filter(Boolean).length

  const totalCards   = board?.columns.reduce((a, c) => a + c.cards.length, 0) ?? 0
  const overdueCount = board?.columns.reduce((a, c) => a + c.cards.filter((card) => card.isOverdue).length, 0) ?? 0

  // ── Loading ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex gap-4 px-6 pt-6 overflow-hidden">
          {[...Array(3)].map((_, i) => <ColumnSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────
  if (!board) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }} className="text-6xl">
            🌌
          </motion.div>
          <p className="font-display text-white/40 tracking-wider">Board não encontrado</p>
          <button onClick={() => router.push('/board')} className="text-sm text-neon-cyan/60 hover:text-neon-cyan font-body transition-colors">
            ← Voltar para missões
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* ── Sub-header ──────────────────────────────── */}
      <div
        className="shrink-0 px-5 py-2 flex items-center gap-3 border-b border-white/4 flex-wrap"
        style={{ background: 'rgba(7,3,26,0.65)', backdropFilter: 'blur(12px)' }}
      >
        {/* Color dot + title */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: board.color, boxShadow: `0 0 8px ${board.color}80` }}
          />
          <h1 className="font-display text-sm font-semibold text-white/90 truncate tracking-wide">
            {board.title}
          </h1>
          {board.description && (
            <>
              <span className="text-white/15 hidden md:block">·</span>
              <p className="text-xs text-white/30 font-body truncate hidden md:block">{board.description}</p>
            </>
          )}
        </div>

        {/* Stats pills */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <StatPill icon="📂" value={board.columns.length} label="etapas" />
          <StatPill icon="🃏" value={totalCards}           label="cards"   />
          {overdueCount > 0 && <StatPill icon="⚠️" value={overdueCount} label="atrasados" danger />}
          {activeFiltersCount > 0 && (
            <div className="text-[11px] px-2 py-1 rounded-lg bg-neon-violet/15 border border-neon-violet/30 text-neon-purple font-body">
              {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''} ativo{activeFiltersCount > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Filter bar */}
        <BoardFilterBar
          columns={board.columns}
          allTags={allTags}
          filters={filters}
          onChange={setFilters}
        />

        {/* Archived cards button — Admin or Coordinator */}
        {isPrivileged && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowArchived(true)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-display tracking-wider text-white/60',
              'border border-white/10 hover:border-red-500/40',
              'hover:text-white/90 hover:bg-red-500/8 transition-all duration-200',
            )}
          >
            <span>🗃</span>
            <span className="hidden sm:inline">Arquivados</span>
          </motion.button>
        )}

        {/* Archived columns button — Admin or Coordinator */}
        {isPrivileged && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowArchivedColumns(true)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-display tracking-wider text-white/60',
              'border border-white/10 hover:border-amber-500/40',
              'hover:text-white/90 hover:bg-amber-500/8 transition-all duration-200',
            )}
          >
            <span>📂</span>
            <span className="hidden sm:inline">Etapas</span>
          </motion.button>
        )}

        {/* Edit mission button — Admin or Coordinator */}
        {isPrivileged && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowEditBoard(true)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-display tracking-wider text-white/60',
              'border border-white/10 hover:border-neon-cyan/35',
              'hover:text-white/90 hover:bg-neon-cyan/8 transition-all duration-200',
            )}
          >
            <span>✏️</span>
            <span className="hidden sm:inline">Missão</span>
          </motion.button>
        )}

        {/* Add column button — Admin or Coordinator */}
        {isPrivileged && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddColumn(true)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-display tracking-wider text-white/60',
              'border border-white/10 hover:border-neon-violet/35',
              'hover:text-white/90 hover:bg-neon-violet/8 transition-all duration-200',
            )}
          >
            <span>+</span>
            <span className="hidden sm:inline">Etapa</span>
          </motion.button>
        )}
      </div>

      {/* ── Overdue banner (Admin or Coordinator only) ──────── */}
      {isPrivileged && <OverdueBanner key={boardId} boardId={boardId} />}

      {/* ── Kanban Board ─────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          boardId={boardId}
          filteredBoard={filteredBoard}
          onCardMoved={() => broadcast('CARD_MOVED', {})}
          onArchive={isPrivileged ? handleArchive : undefined}
          onArchived={isPrivileged ? () => setArchivedKey((k) => k + 1) : undefined}
        />
      </div>

      {/* ── Archived cards modal ─────────────────────── */}
      <AnimatePresence>
        {showArchived && isPrivileged && (
          <ArchivedColumn
            key={archivedKey}
            boardId={boardId}
            onClose={() => setShowArchived(false)}
            onRestored={() => setArchivedKey((k) => k + 1)}
          />
        )}
      </AnimatePresence>

      {/* ── Archived columns modal ───────────────────── */}
      <AnimatePresence>
        {showArchivedColumns && isPrivileged && (
          <ArchivedColumnsModal
            key={archivedColumnsKey}
            boardId={boardId}
            onClose={() => setShowArchivedColumns(false)}
            onRestored={() => setArchivedColumnsKey((k) => k + 1)}
          />
        )}
      </AnimatePresence>

      {/* ── Column manager ───────────────────────────── */}
      <ColumnManagerModal
        open={showAddColumn}
        onClose={() => setShowAddColumn(false)}
        boardId={boardId}
      />

      {/* ── Board manager ────────────────────────────── */}
      {board && (
        <BoardManagerModal
          open={showEditBoard}
          onClose={() => setShowEditBoard(false)}
          editBoard={{
            id:             board.id,
            title:          board.title,
            color:          board.color,
            description:    board.description,
            memberIds:      board.members.map((m) => m.userId),
            coordinatorIds: board.members.filter((m) => m.role === 'COORDINATOR').map((m) => m.userId),
          }}
          onSaved={() => fetchBoard(boardId)}
        />
      )}
    </div>
  )
}

function StatPill({ icon, value, label, danger }: {
  icon: string; value: number; label: string; danger?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-body border',
      danger
        ? 'text-red-400 bg-red-500/8 border-red-500/20 animate-pulse-slow'
        : 'text-white/35 bg-white/3 border-white/6',
    )}>
      <span>{icon}</span>
      <span className="font-mono font-medium">{value}</span>
      <span className="hidden lg:inline text-white/25">{label}</span>
    </div>
  )
}

