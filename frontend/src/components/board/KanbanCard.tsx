'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { cn, getPriorityIcon, getPriorityLabel, formatDeadline, isOverdue, formatRelativeDate } from '@/lib/utils'
import type { Card } from '@/stores/boardStore'
import { useBoardStore } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { useIsCoordinator } from '@/hooks/useIsCoordinator'

interface KanbanCardProps {
  card: Card
  index: number
  columnColor: string
  canDrag: boolean
  onArchive?: (cardId: string) => void
}

export function KanbanCard({ card, columnColor, canDrag, onArchive }: KanbanCardProps) {
  const { setOpenCard } = useBoardStore()
  const isAdmin       = useAuthStore((s) => s.user?.role === 'ADMIN')
  const isCoordinator = useIsCoordinator()
  const isPrivileged  = isAdmin || isCoordinator

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', card },
    disabled: !canDrag,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  const overdue = card.deadline ? isOverdue(card.deadline) : false

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      ref={setNodeRef}
      style={{
        ...style,
        background: isDragging
          ? `linear-gradient(135deg, ${columnColor}15, rgba(255,255,255,0.06))`
          : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={() => setOpenCard(card.id)}
      className={cn(
        'relative group rounded-xl p-3',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        'border transition-all duration-200',
        'shadow-card hover:shadow-card-hover',
        overdue
          ? 'bg-red-950/30 border-red-500/30 hover:border-red-500/50'
          : 'bg-glass-white border-glass-border hover:border-white/14',
      )}
    >
      {/* Priority stripe */}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
        style={{ background: getPriorityColor(card.priority) }}
      />

      {/* Overdue glow */}
      {overdue && (
        <div className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.2)' }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 pl-2">
        <h4 className="text-sm font-body font-medium text-white/90 leading-snug line-clamp-2 flex-1">
          {card.title}
        </h4>
        <div className="flex items-center gap-1 shrink-0 -mt-0.5">
          {isPrivileged && onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(card.id) }}
              title="Arquivar card"
              className="text-white/25 hover:text-red-400 hover:bg-red-500/12 rounded-md px-1 py-0.5 transition-all duration-150 text-xs leading-none"
            >
              🗃
            </button>
          )}
          <span className="text-base">{getPriorityIcon(card.priority)}</span>
        </div>
      </div>

      {/* Tags */}
      {card.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 pl-2">
          {card.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/35 border border-white/8 font-body"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pl-2 mt-2">
        {/* Deadline */}
        {card.deadline ? (
          <div className={cn(
            'flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 border font-body',
            overdue
              ? 'text-red-400 bg-red-500/10 border-red-500/30'
              : 'text-white/40 bg-white/3 border-white/8',
          )}>
            <span>{overdue ? '⚠️' : '⏱'}</span>
            <span>{formatDeadline(card.deadline)}</span>
          </div>
        ) : (
          <div className="text-[10px] text-white/20 font-body italic">sem prazo</div>
        )}

        <div className="flex items-center gap-2">
          {/* Pending mention badge */}
          {(card.pendingMentionCount ?? 0) > 0 && (
            <div className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-neon-cyan/16 border border-neon-cyan/40 text-neon-cyan font-body font-bold animate-pulse"
              title="Você tem menções aguardando resposta">
              <span>💬</span>
              <span>{card.pendingMentionCount}</span>
            </div>
          )}
          {/* Sections count */}
          {card._count && card._count.sections > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-white/30 font-body">
              <span>📎</span>
              <span>{card._count.sections}</span>
            </div>
          )}
        </div>
      </div>

      {/* Creator */}
      <div className="flex items-center gap-1.5 pl-2 mt-2 pt-2 border-t border-white/5">
        <div className="w-4 h-4 rounded-md bg-neon-violet/30 flex items-center justify-center text-[8px] font-display text-white/60">
          {card.creator.name[0]}
        </div>
        <span className="text-[10px] text-white/30 font-body truncate">
          {card.creator.name.split(' ')[0]}
        </span>
      </div>
    </motion.div>
  )
}

function getPriorityColor(priority: string): string {
  return {
    LOW:      '#10b981',
    MEDIUM:   '#f59e0b',
    HIGH:     '#f97316',
    CRITICAL: '#ef4444',
  }[priority] ?? '#a855f7'
}

