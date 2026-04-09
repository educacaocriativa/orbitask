'use client'
import { useState, useCallback } from 'react'
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCorners,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, type Card, type Column } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { useIsCoordinator } from '@/hooks/useIsCoordinator'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { MoveCardModal } from '../cards/MoveCardModal'
import { CardDetailModal } from '../cards/CardDetailModal'
import toast from 'react-hot-toast'

interface KanbanBoardProps {
  boardId: string
  filteredBoard?: import('@/stores/boardStore').Board | null
  onCardMoved?: () => void
  onArchive?: (cardId: string) => void
  onArchived?: () => void
}

export function KanbanBoard({ boardId, filteredBoard, onCardMoved, onArchive, onArchived }: KanbanBoardProps) {
  const { board, setActiveCard, activeCard, optimisticMove, moveCard, reorderCard, reorderColumns, openCardId, setOpenCard } = useBoardStore()
  const currentUser   = useAuthStore((s) => s.user)
  const isCoordinator = useIsCoordinator()
  const isAdmin       = currentUser?.role === 'ADMIN'
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn]         = useState<Column | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    cardId: string; fromColumnId: string; toColumnId: string; position: number
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const type = event.active.data.current?.type
    if (type === 'column') {
      setActiveColumn(event.active.data.current?.column as Column)
    } else {
      const card = event.active.data.current?.card as Card
      if (card) setActiveCard(card)
    }
  }, [setActiveCard])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | null
    if (!overId || !board) return

    // Check if dragging over a column
    const isColumn = board.columns.some((c) => c.id === overId)
    setDragOverColumnId(isColumn ? overId : null)
  }, [board])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setDragOverColumnId(null)

    // ── Column reorder ────────────────────────────────────────
    if (active.data.current?.type === 'column') {
      setActiveColumn(null)
      if (!over || !board || active.id === over.id) return
      const oldIndex = board.columns.findIndex((c) => c.id === active.id)
      const newIndex = board.columns.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      const newOrder = arrayMove(board.columns, oldIndex, newIndex)
      reorderColumns(boardId, newOrder.map((c) => c.id))
        .catch(() => toast.error('Erro ao reordenar etapas'))
      return
    }

    setActiveCard(null)
    if (!over || !board || !activeCard) return

    const activeCardId = active.id as string
    const overId = over.id as string

    // Find source column
    const fromColumn = board.columns.find((col) =>
      col.cards.some((c) => c.id === activeCardId)
    )
    if (!fromColumn) return

    // Find target column: could be over a column or a card inside a column
    const toColumn =
      board.columns.find((c) => c.id === overId) ??
      board.columns.find((c) => c.cards.some((card) => card.id === overId))

    if (!toColumn) return

    if (fromColumn.id === toColumn.id) {
      // Reorder within same column
      const oldIndex = fromColumn.cards.findIndex((c) => c.id === activeCardId)
      const newIndex = fromColumn.cards.findIndex((c) => c.id === overId)
      if (oldIndex !== newIndex) {
        const newOrder = arrayMove(fromColumn.cards, oldIndex, newIndex)
        reorderCard(fromColumn.id, newOrder.map((c) => c.id))
          .catch(() => toast.error('Erro ao reordenar'))
      }
      return
    }

    // Moving to a different column → check permission first
    const isAdmin      = currentUser?.role === 'ADMIN'
    const isPrivileged = isAdmin || isCoordinator
    const isOwner      = fromColumn.ownerId === currentUser?.id
    const isMember     = fromColumn.columnMembers?.some((m) => m.user.id === currentUser?.id) ?? false
    const alreadyMoved = activeCard.lastMovedByUserId === currentUser?.id

    if (!isPrivileged && (!isOwner && !isMember)) {
      toast.error('Você não tem permissão para mover este card.\nEle pertence a uma etapa da qual você não faz parte.', { duration: 4000 })
      return
    }
    if (!isPrivileged && alreadyMoved) {
      toast.error('Você já moveu este card. Para movê-lo novamente, outro usuário ou o Admin precisa devolvê-lo à sua etapa.', { duration: 5000 })
      return
    }

    // Optimistic UI
    const targetPosition = toColumn.cards.findIndex((c) => c.id === overId)
    const position = targetPosition === -1 ? toColumn.cards.length : targetPosition

    optimisticMove(activeCardId, fromColumn.id, toColumn.id, position, currentUser?.id ?? '')

    // Show modal to collect deadline
    setPendingMove({
      cardId: activeCardId,
      fromColumnId: fromColumn.id,
      toColumnId: toColumn.id,
      position,
    })
  }, [board, activeCard, currentUser, isCoordinator, setActiveCard, optimisticMove, reorderCard])

  async function confirmMove(deadline: string) {
    if (!pendingMove) return
    try {
      const result = await moveCard(pendingMove.cardId, pendingMove.toColumnId, pendingMove.position, deadline)
      onCardMoved?.()
      toast.success('🚀 Card movido com sucesso!')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao mover card')
      // Re-fetch to restore state
      useBoardStore.getState().fetchBoard(boardId)
    } finally {
      setPendingMove(null)
    }
  }

  function cancelMove() {
    // Restore original position by re-fetching
    useBoardStore.getState().fetchBoard(boardId)
    setPendingMove(null)
  }

  const displayBoard = filteredBoard ?? board
  if (!displayBoard) return null

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board-canvas scrollbar-space pt-4">
          <SortableContext items={displayBoard.columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {displayBoard.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                boardId={boardId}
                onArchive={onArchive}
              />
            ))}
          </SortableContext>

          {/* Add column placeholder */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="shrink-0 flex items-start pt-0"
            style={{ width: 'var(--col-width)' }}
          >
            <button
              className="w-full py-3 rounded-2xl border border-dashed border-white/8 text-white/25 text-sm font-body hover:border-neon-violet/25 hover:text-white/50 transition-all duration-200"
              onClick={() => toast('Em breve: adicionar colunas', { icon: '🛸' })}
            >
              + Nova coluna
            </button>
          </motion.div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeCard && (
            <div className="drag-overlay">
              <KanbanCard card={activeCard} index={0} columnColor="#7c3aed" canDrag={true} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Deadline modal when moving between columns */}
      <MoveCardModal
        open={!!pendingMove}
        onConfirm={confirmMove}
        onCancel={cancelMove}
        targetColumnId={pendingMove?.toColumnId}
        board={board}
        sourceDriveFolderUrl={
          pendingMove
            ? board?.columns
                .flatMap((c) => c.cards)
                .find((c) => c.id === pendingMove.cardId)
                ?.driveFolderUrl ?? null
            : null
        }
      />

      {/* Card detail drawer */}
      <AnimatePresence>
        {openCardId && (
          <CardDetailModal
            cardId={openCardId}
            onClose={() => setOpenCard(null)}
            onArchived={onArchived}
          />
        )}
      </AnimatePresence>
    </>
  )
}

