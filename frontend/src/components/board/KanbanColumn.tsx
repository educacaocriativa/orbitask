'use client'
import { useState, Fragment } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import type { Column } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { useIsCoordinator } from '@/hooks/useIsCoordinator'
import { useBoardStore } from '@/stores/boardStore'
import { useMemo } from 'react'
import { KanbanCard } from './KanbanCard'
import { AddCardModal } from '../cards/AddCardModal'
import { ColumnManagerModal } from './ColumnManagerModal'
import toast from 'react-hot-toast'

interface KanbanColumnProps {
  column: Column
  boardId: string
  onArchive?: (cardId: string) => void
  /** ID do card antes do qual mostrar o indicador de drop, ou 'end' para o final */
  dropPreviewBeforeCardId?: string | null
}

export function KanbanColumn({ column, boardId, onArchive, dropPreviewBeforeCardId }: KanbanColumnProps) {
  const [showAddCard,      setShowAddCard]      = useState(false)
  const [showEditColumn,   setShowEditColumn]   = useState(false)
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [confirmArchive,   setConfirmArchive]   = useState(false)
  const [archiving,        setArchiving]        = useState(false)

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id })
  const {
    attributes, listeners, setNodeRef: setDragRef,
    transform, transition, isDragging,
  } = useSortable({ id: column.id, data: { type: 'column', column } })

  const currentUser    = useAuthStore((s) => s.user)
  const isAdmin        = currentUser?.role === 'ADMIN'
  const isCoordinator  = useIsCoordinator()
  const isPrivileged   = isAdmin || isCoordinator
  const { deleteColumn, archiveColumn } = useBoardStore()

  const canDrag = useMemo(() => {
    if (isPrivileged) return true
    if (column.ownerId === currentUser?.id) return true
    return column.columnMembers.some((m) => m.user.id === currentUser?.id)
  }, [isPrivileged, currentUser?.id, column.ownerId, column.columnMembers])

  const cardIds      = column.cards.map((c) => c.id)
  const overdueCount = column.cards.filter((c) => c.isOverdue).length

  const owners: Array<{ id: string; name: string; avatarUrl?: string }> =
    (column as any).owners?.length > 0 ? (column as any).owners : [column.owner]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteColumn(column.id)
      toast.success('Etapa excluída')
      setConfirmDelete(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao excluir etapa')
    } finally {
      setDeleting(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    try {
      await archiveColumn(column.id)
      toast.success('Etapa arquivada')
      setConfirmArchive(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao arquivar etapa')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      <div ref={setDragRef} {...attributes} className="flex flex-col shrink-0 h-full" style={{ ...style, width: 'var(--col-width)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col h-full"
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
            <div className="flex items-start justify-between mb-2 gap-2">
              {/* Drag handle — Admin only */}
              {isAdmin && (
                <button
                  {...listeners}
                  className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-white/25 hover:text-white/60 transition-colors text-sm select-none"
                  title="Arrastar para reordenar"
                >
                  ⠿
                </button>
              )}

              {/* Title — wraps instead of truncating */}
              <h3 className="font-display text-sm font-bold tracking-wide text-white break-words flex-1 leading-snug">
                {column.title}
              </h3>

              <div className="flex items-center gap-1 shrink-0">
                {overdueCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/35 font-mono font-bold animate-pulse">
                    {overdueCount}⚠
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-md bg-white/6 text-white/70 font-mono font-bold border border-white/10">
                  {column.cards.length}
                </span>
                {/* Edit button */}
                {isPrivileged && (
                  <button
                    onClick={() => setShowEditColumn(true)}
                    title="Editar etapa"
                    className="flex items-center justify-center w-6 h-6 rounded-lg text-white/40 border border-white/10 hover:text-white hover:border-neon-violet/50 hover:bg-neon-violet/15 transition-all duration-200 text-xs"
                  >
                    ✏️
                  </button>
                )}
                {/* Archive button — Privileged only, column must be empty */}
                {isPrivileged && (
                  <button
                    onClick={() => setConfirmArchive(true)}
                    title="Arquivar etapa"
                    className="flex items-center justify-center w-6 h-6 rounded-lg text-white/40 border border-white/10 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/12 transition-all duration-200 text-xs"
                  >
                    🗃
                  </button>
                )}
                {/* Delete button — Admin only */}
                {isAdmin && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Excluir etapa"
                    className="flex items-center justify-center w-6 h-6 rounded-lg text-white/40 border border-white/10 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/12 transition-all duration-200 text-xs"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>

            {/* Owners */}
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
              ref={setDropRef}
              className={cn(
                'flex flex-col gap-2.5 flex-1 p-2 rounded-b-2xl glass transition-all duration-200 overflow-y-auto scrollbar-space',
                isOver && 'drop-zone-active',
                // Empty columns get a tall, generous drop zone so dragging cards into them is easy
                column.cards.length === 0 && 'min-h-[320px]',
              )}
              style={{ minHeight: column.cards.length === 0 ? undefined : 80 }}
            >
              <AnimatePresence mode="popLayout">
                {column.cards.map((card, index) => {
                  const cardCanDrag = canDrag && (isPrivileged || card.lastMovedByUserId !== currentUser?.id)
                  return (
                    <Fragment key={card.id}>
                      {dropPreviewBeforeCardId === card.id && (
                        <motion.div
                          initial={{ opacity: 0, scaleX: 0.5 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          className="h-1 rounded-full mx-1 pointer-events-none"
                          style={{ background: `linear-gradient(90deg, transparent, ${column.color}, transparent)` }}
                        />
                      )}
                      <KanbanCard card={card} index={index} columnColor={column.color} canDrag={canDrag} onArchive={onArchive} />
                    </Fragment>
                  )
                })}
              </AnimatePresence>

              {column.cards.length === 0 && !isOver && !dropPreviewBeforeCardId && (
                <div
                  className="flex-1 flex items-center justify-center py-4 rounded-xl border-2 border-dashed border-white/10 m-1 pointer-events-none"
                  style={{ minHeight: 240 }}
                >
                  <p className="text-[11px] text-white/30 font-body text-center leading-relaxed font-semibold">
                    🌌 Zona vazia<br />Arraste cards aqui
                  </p>
                </div>
              )}

              {(isOver || dropPreviewBeforeCardId === 'end') && (
                <motion.div
                  layoutId="drop-indicator"
                  className="h-1 rounded-full mx-1"
                  style={{ background: `linear-gradient(90deg, transparent, ${column.color}, transparent)` }}
                />
              )}
            </div>
          </SortableContext>

          {/* Add card button */}
          {isPrivileged && (
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
      </div>

      {/* Confirm delete dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm glass rounded-2xl p-6 shadow-glass"
            >
              <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
              <h3 className="font-display text-base font-black text-white mb-2">🗑 Excluir Etapa</h3>
              <p className="text-sm text-white/60 font-body mb-1">
                Tem certeza que deseja excluir <strong className="text-white">"{column.title}"</strong>?
              </p>
              <p className="text-xs text-red-300/70 font-body mb-5">
                Esta ação não pode ser desfeita. A etapa deve estar vazia para ser excluída.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body border border-white/15 text-white/60 hover:bg-white/5 transition-all">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black text-white bg-red-500/80 hover:bg-red-500 disabled:opacity-50 transition-all">
                  {deleting ? 'Excluindo...' : '🗑 Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm archive dialog */}
      <AnimatePresence>
        {confirmArchive && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmArchive(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm glass rounded-2xl p-6 shadow-glass"
            >
              <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
              <h3 className="font-display text-base font-black text-white mb-2">🗃 Arquivar Etapa</h3>
              <p className="text-sm text-white/60 font-body mb-1">
                Tem certeza que deseja arquivar <strong className="text-white">"{column.title}"</strong>?
              </p>
              <p className="text-xs text-amber-300/70 font-body mb-5">
                A etapa ficará oculta do board. Ela deve estar sem cards ativos para ser arquivada.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmArchive(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body border border-white/15 text-white/60 hover:bg-white/5 transition-all">
                  Cancelar
                </button>
                <button onClick={handleArchive} disabled={archiving}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black text-white bg-amber-500/80 hover:bg-amber-500 disabled:opacity-50 transition-all">
                  {archiving ? 'Arquivando...' : '🗃 Arquivar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
