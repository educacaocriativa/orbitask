'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Column } from '@/stores/boardStore'

export interface FilterState {
  priority: string | null
  isOverdue: boolean | null
  columnId: string | null
  tag: string | null
}

interface BoardFilterBarProps {
  columns: Column[]
  allTags: string[]
  filters: FilterState
  onChange: (f: FilterState) => void
}

const PRIORITIES = [
  { value: 'LOW',      label: 'Baixa',   icon: '🌿', color: '#10b981' },
  { value: 'MEDIUM',   label: 'Média',   icon: '⚡', color: '#f59e0b' },
  { value: 'HIGH',     label: 'Alta',    icon: '🔥', color: '#f97316' },
  { value: 'CRITICAL', label: 'Crítico', icon: '☢️', color: '#ef4444' },
]

export function BoardFilterBar({ columns, allTags, filters, onChange }: BoardFilterBarProps) {
  const [open, setOpen] = useState(false)

  const activeCount = [
    filters.priority, filters.isOverdue !== null, filters.columnId, filters.tag,
  ].filter(Boolean).length

  function reset() {
    onChange({ priority: null, isOverdue: null, columnId: null, tag: null })
  }

  function toggle<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: filters[key] === value ? null : value })
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display tracking-wider',
          'border transition-all duration-200',
          activeCount > 0
            ? 'text-neon-violet bg-neon-violet/10 border-neon-violet/35'
            : 'text-white/50 border-white/10 hover:border-white/20 hover:text-white/75',
        )}
      >
        <span>🔬</span>
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-neon-violet text-white text-[9px] flex items-center justify-center font-mono">
            {activeCount}
          </span>
        )}
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-2 w-72 glass rounded-2xl p-4 shadow-glass z-40"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-display tracking-widest text-white/50 uppercase">Filtros Ativos</span>
                {activeCount > 0 && (
                  <button onClick={reset} className="text-[11px] text-neon-pink/60 hover:text-neon-pink font-body transition-colors">
                    ✕ Limpar tudo
                  </button>
                )}
              </div>

              {/* Priority */}
              <div className="mb-4">
                <label className="block text-[10px] font-display text-white/30 uppercase tracking-widest mb-2">
                  Prioridade
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => toggle('priority', p.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-body border transition-all',
                        filters.priority === p.value
                          ? 'border-current bg-white/8'
                          : 'border-white/8 text-white/40 hover:bg-white/4',
                      )}
                      style={filters.priority === p.value ? { color: p.color } : {}}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="mb-4">
                <label className="block text-[10px] font-display text-white/30 uppercase tracking-widest mb-2">
                  Status
                </label>
                <button
                  onClick={() => toggle('isOverdue', true)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body border transition-all w-full',
                    filters.isOverdue
                      ? 'text-red-400 bg-red-500/10 border-red-500/30'
                      : 'border-white/8 text-white/40 hover:bg-white/4',
                  )}
                >
                  <span>⚠️</span>
                  <span>Apenas atrasados</span>
                </button>
              </div>

              {/* Column */}
              {columns.length > 0 && (
                <div className="mb-4">
                  <label className="block text-[10px] font-display text-white/30 uppercase tracking-widest mb-2">
                    Coluna
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-space">
                    {columns.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => toggle('columnId', col.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-body border transition-all text-left',
                          filters.columnId === col.id
                            ? 'border-current bg-white/5'
                            : 'border-white/6 text-white/40 hover:bg-white/3',
                        )}
                        style={filters.columnId === col.id ? { color: col.color } : {}}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                        <span className="truncate">{col.title}</span>
                        <span className="ml-auto font-mono text-white/25">{col.cards.length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {allTags.length > 0 && (
                <div>
                  <label className="block text-[10px] font-display text-white/30 uppercase tracking-widest mb-2">
                    Tag
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggle('tag', tag)}
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[11px] font-body border transition-all',
                          filters.tag === tag
                            ? 'text-neon-purple bg-neon-violet/20 border-neon-violet/40'
                            : 'text-white/35 border-white/8 hover:bg-white/5',
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

