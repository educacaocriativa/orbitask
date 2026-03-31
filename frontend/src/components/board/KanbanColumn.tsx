'use client'
import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import type { Column } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { useMemo } from 'react'
import { KanbanCard } from './KanbanCard'
import { AddCardModal } from '../cards/AddCardModal'
import { ColumnManagerModal } from './ColumnManagerModal'

interface KanbanColumnProps {
  column: Column
  boardId: string
  onArchive?: (cardId: string) => void
}

export function KanbanColumn({ column, boardId, onArchive }: KanbanColumnProps) {
  const [showAddCard,    setShowAddCard]    = useState(false)
  const [showEditColumn, setShowEditColumn] = useState(false)
  const { setNodeRef, isOver }              = useDroppable({ id: column.id })
  const currentUser                         = useAuthStore((s) => s.user)
  const isAdmin                             = currentUser?.role === 'ADMIN'

  // User can drag cards from this column only if they are owner or member
  const canDrag = useMemo(() => {
    if (isAdmin) return true
    if (column.ownerId === currentUser?.id) return true
    return column.columnMembers.some((m) => m.user.id === currentUser?.id)
  }, [isAdmin, currentUser?.id, column.ownerId, column.columnMembers])

  const cardIds      = column.cards.map((c) => c.id)
  const overdueCount = column.cards.filter((c) => c.isOverdue).length

  // Support multiple owners if present, fallback to single owner
  const owners: Array<{ id: string; name: string; avatarUrl?: string }> =
    (column as any).owners?.length > 0 ? (column as any).owners : [column.owner]

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col shrink-0"
        style={{ width: 'var(--col-width)' }}
      >
        {/* Column header */}
        <div
          className="glass rounded-t-2xl px-4 py-3 border-b border-white/6"
          style={{
            borderLeft: `3px solid ${column.color}`,
            background: `linear-gradient(180deg, ${column.color}12 0%, rgba(255,255,255,0.04) 100%)`,
          }}
        >
          {/* Title + controls */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-display text-sm font-bold tracking-wide text-white truncate flex-1">
              {column.title}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {overdueCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/35 font-mono font-bold animate-pulse">
                  {overdueCount}⚠
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-md bg-white/6 text-white/70 font-mono font-bold border border-white/10">
                {column.cards.length}
              </span>
              {/* Edit button — Admin only */}
              {isAdmin && (
                <button
                  onClick={() => setShowEditColumn(true)}
                  title="Editar etapa"
                  className="flex items-center justify-center w-6 h-6 rounded-lg text-white/40 border border-white/10 hover:text-white hover:border-neon-violet/50 hover:bg-neon-violet/15 transition-all duration-200 text-xs"
                >
                  ✏️
                </button>
              )}
            </div>
          </div>

          {/* Owners — supports multiple */}
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {owners.slice(0, 4).map((owner) => (
                <div key={owner.id} title={owner.name} className="ring-1 ring-space-deep rounded-md">
                  <Avatar name={owner.name} src={owner.avatarUrl} size="xs" />
                </div>
              ))}
              {owners.length > 4 && (
                <div className="w-5 h-5 rounded-md bg-white/12 flex items-center justify-center text-[8px] font-display font-black text-white/60 ring-1 ring-space-deep">
                  +{owners.length - 4}
                </div>
              )}
            </div>
            <span className="text-[11px] text-white/60 font-body font-semibold truncate">
              {owners.length === 1
                ? owners[0].name
                : `${owners[0].name.split(' ')[0]} +${owners.length - 1}`}
            </span>
            <span className="text-[11px] text-white/25 ml-auto shrink-0">👨‍🚀</span>
          </div>
        </div>

        {/* Cards area */}
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn(
              'flex flex-col gap-2.5 flex-1 p-2 rounded-b-2xl glass transition-all duration-200',
              isOver && 'drop-zone-active',
            )}
            style={{ minHeight: 80 }}
          >
            <AnimatePresence mode="popLayout">
              {column.cards.map((card, index) => {
                // Also block if this user was the last one to move the card
                const cardCanDrag = canDrag && card.lastMovedByUserId !== currentUser?.id
                return (
                  <KanbanCard key={card.id} card={card} index={index} columnColor={column.color} canDrag={cardCanDrag} onArchive={onArchive} />
                )
              })}
            </AnimatePresence>

            {column.cards.length === 0 && !isOver && (
              <div className="flex-1 flex items-center justify-center py-4">
                <p className="text-[11px] text-white/25 font-body text-center leading-relaxed font-semibold">
                  🌌 Zona vazia<br />Arraste cards aqui
                </p>
              </div>
            )}

            {isOver && (
              <motion.div
                layoutId="drop-indicator"
                className="h-1 rounded-full mx-1"
                style={{ background: `linear-gradient(90deg, transparent, ${column.color}, transparent)` }}
              />
            )}
          </div>
        </SortableContext>

        {/* Add card button — Admin only */}
        {isAdmin && (
          <motion.button
            onClick={() => setShowAddCard(true)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="mt-2 w-full py-2.5 rounded-xl text-xs font-body font-semibold border border-dashed border-white/14 text-white/50 hover:border-neon-violet/40 hover:text-white/85 hover:bg-white/4 transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            <span className="text-sm">+</span> Novo card
          </motion.button>
        )}
      </motion.div>

      <AddCardModal
        open={showAddCard}
        onClose={() => setShowAddCard(false)}
        columnId={column.id}
        columnTitle={column.title}
        boardId={boardId}
      />

      <ColumnManagerModal
        open={showEditColumn}
        onClose={() => setShowEditColumn(false)}
        boardId={boardId}
        editColumn={{
          id:       column.id,
          title:    column.title,
          ownerId:  column.ownerId,
          color:    column.color,
          ownerIds: [column.ownerId, ...column.columnMembers.map((m) => m.user.id)],
        }}
      />
    </>
  )
}

