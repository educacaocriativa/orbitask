'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import api from '@/lib/api'
import { Navbar } from '@/components/ui/Navbar'
import { cn, formatRelativeDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { BoardManagerModal } from '@/components/board/BoardManagerModal'
import { ImportCSVModal } from '@/components/admin/ImportCSVModal'

interface BoardSummary {
  id: string; title: string; description?: string; color: string
  owner: { id: string; name: string }
  createdAt: string
  archivedAt?: string
  _count: { columns: number; cards: number }
}

interface Task {
  id: string
  title: string
  priority: string
  deadline?: string
  isOverdue: boolean
  board: { id: string; title: string; color: string }
  currentColumn: { id: string; title: string; color: string }
}

const PRIORITY_STYLE: Record<string, { label: string; className: string }> = {
  LOW:      { label: 'Baixa',    className: 'bg-slate-500/20 border-slate-500/40 text-slate-300' },
  MEDIUM:   { label: 'Média',    className: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
  HIGH:     { label: 'Alta',     className: 'bg-orange-500/20 border-orange-500/40 text-orange-300' },
  CRITICAL: { label: 'Crítica',  className: 'bg-red-500/20 border-red-500/40 text-red-300' },
}

export default function BoardListPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')
  const [boards, setBoards]                 = useState<BoardSummary[]>([])
  const [archivedBoards, setArchivedBoards] = useState<BoardSummary[]>([])
  const [tasks, setTasks]                   = useState<Task[]>([])
  const [isLoading, setIsLoading]           = useState(true)
  const [tasksLoading, setTasksLoading]     = useState(true)
  const [showCreate, setShowCreate]         = useState(false)
  const [showImport, setShowImport]         = useState(false)
  const [confirmAbortId, setConfirmAbortId] = useState<string | null>(null)
  const [aborting, setAborting]             = useState<string | null>(null)
  const [restoring, setRestoring]           = useState<string | null>(null)
  const [showArchived, setShowArchived]     = useState(false)

  useEffect(() => {
    api.get('/boards')
      .then(({ data }) => setBoards(data.boards))
      .catch(() => toast.error('Erro ao carregar boards'))
      .finally(() => setIsLoading(false))

    api.get('/users/me/tasks')
      .then(({ data }) => setTasks(data.tasks))
      .catch(() => {})
      .finally(() => setTasksLoading(false))

    if (isAdmin) {
      api.get('/boards/archived')
        .then(({ data }) => setArchivedBoards(data.boards))
        .catch(() => {})
    }
  }, [isAdmin])

  function handleBoardSaved(board: BoardSummary) {
    setBoards((prev) => {
      const exists = prev.find((b) => b.id === board.id)
      return exists
        ? prev.map((b) => b.id === board.id ? board : b)
        : [board, ...prev]
    })
  }

  async function abortMission(boardId: string) {
    setAborting(boardId)
    try {
      await api.delete(`/boards/${boardId}/archive`)
      const aborted = boards.find((b) => b.id === boardId)
      setBoards((prev) => prev.filter((b) => b.id !== boardId))
      if (aborted) setArchivedBoards((prev) => [{ ...aborted, archivedAt: new Date().toISOString() }, ...prev])
      setConfirmAbortId(null)
      toast.success('Missão abortada 🚫')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao abortar missão')
    } finally {
      setAborting(null)
    }
  }

  async function restoreMission(boardId: string) {
    setRestoring(boardId)
    try {
      await api.post(`/boards/${boardId}/restore`)
      const restored = archivedBoards.find((b) => b.id === boardId)
      setArchivedBoards((prev) => prev.filter((b) => b.id !== boardId))
      if (restored) {
        const { archivedAt, ...rest } = restored
        setBoards((prev) => [rest, ...prev])
      }
      toast.success('Missão reintegrada ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao restaurar missão')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">

        {/* ── Meus Cards ─────────────────────────────────────── */}
        <section>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5"
          >
            <p className="text-xs font-display tracking-[0.3em] text-neon-cyan/60 mb-1 uppercase">
              👨‍🚀 Tripulação
            </p>
            <h2 className="font-display text-xl font-bold text-white">
              Meus Cards
            </h2>
            <p className="text-sm text-white/35 font-body mt-0.5">
              Cards nas etapas sob sua responsabilidade
            </p>
          </motion.div>

          {tasksLoading && (
            <div className="glass rounded-2xl overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 border-b border-white/5 animate-pulse" />
              ))}
            </div>
          )}

          {!tasksLoading && tasks.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass rounded-2xl py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="text-4xl mb-3">🌌</div>
              <p className="text-sm text-white/40 font-body">Nenhum card atribuído a você ainda</p>
            </motion.div>
          )}

          {!tasksLoading && tasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl overflow-hidden"
            >
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1.6fr_1fr_90px_90px_56px] gap-3 px-4 py-2.5 border-b border-white/8 text-[11px] font-display font-black tracking-widest text-white/35 uppercase">
                <span>Missão</span>
                <span>Card</span>
                <span>Etapa</span>
                <span>Prioridade</span>
                <span>Prazo</span>
                <span></span>
              </div>

              {/* Rows — max 10 visible, scroll after */}
              <div className="overflow-y-auto scrollbar-space" style={{ maxHeight: 520 }}>
              {tasks.map((task, i) => {
                const prio = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.LOW
                const deadlineDate = task.deadline ? new Date(task.deadline) : null
                const deadlineLabel = deadlineDate
                  ? deadlineDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                  : '—'

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      'grid grid-cols-[1fr_1.6fr_1fr_90px_90px_56px] gap-3 px-4 py-3 items-center',
                      'border-b border-white/5 last:border-0',
                      'hover:bg-white/3 transition-colors',
                      task.isOverdue && 'bg-red-500/4',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: task.board.color }} />
                      <span className="text-xs font-body font-semibold text-white/70 truncate">{task.board.title}</span>
                    </div>
                    <span className="text-xs font-body font-semibold text-white/90 truncate">{task.title}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: task.currentColumn.color }} />
                      <span className="text-xs font-body text-white/55 truncate">{task.currentColumn.title}</span>
                    </div>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-body font-bold w-fit', prio.className)}>
                      {prio.label}
                    </span>
                    <span className={cn('text-xs font-mono font-bold', task.isOverdue ? 'text-red-400' : 'text-white/45')}>
                      {task.isOverdue && '⚠ '}{deadlineLabel}
                    </span>
                    <Link
                      href={`/board/${task.board.id}`}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/35 hover:text-white hover:border-neon-cyan/40 hover:bg-neon-cyan/10 transition-all text-sm"
                      title="Ir para a missão"
                    >
                      →
                    </Link>
                  </motion.div>
                )
              })}
              </div>
            </motion.div>
          )}
        </section>

        {/* ── Missões Ativas ─────────────────────────────────── */}
        <section>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between mb-6"
          >
            <div>
              <p className="text-xs font-display tracking-[0.3em] text-neon-violet/60 mb-1 uppercase">
                🛸 Centro de Controle
              </p>
              <h1 className="font-display text-3xl font-bold text-white text-glow-violet">
                Missões Ativas
              </h1>
              <p className="text-sm text-white/35 font-body mt-1">
                {boards.length} {boards.length === 1 ? 'missão' : 'missões'} em andamento
              </p>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setShowImport(true)}
                  className="px-3 py-2.5 rounded-xl text-sm font-display tracking-wider text-white/70 border border-white/12 hover:border-neon-cyan/35 hover:text-white hover:bg-neon-cyan/8 transition-all"
                >
                  📂 Importar CSV
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2.5 rounded-xl text-sm font-display tracking-wider text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}
                >
                  + Nova Missão
                </motion.button>
              </div>
            )}
          </motion.div>

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-44 rounded-2xl glass animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {boards.map((board, i) => (
                <motion.div
                  key={board.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="relative"
                >
                  <Link href={`/board/${board.id}`} className="group block">
                    <div className={cn(
                      'relative h-44 rounded-2xl p-5 flex flex-col justify-between',
                      'glass glass-hover border border-white/6',
                      'transition-all duration-300',
                      'group-hover:shadow-card-hover',
                    )}>
                      <div
                        className="absolute top-0 left-6 right-6 h-px rounded-full"
                        style={{ background: `linear-gradient(90deg, transparent, ${board.color}, transparent)` }}
                      />
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-2"
                        style={{ background: board.color + '20', border: `1px solid ${board.color}40` }}
                      >
                        🛸
                      </div>

                      <div>
                        <h3 className="font-display text-base font-semibold text-white/90 group-hover:text-white transition-colors line-clamp-2 leading-snug">
                          {board.title}
                        </h3>
                        {board.description && (
                          <p className="text-xs text-white/35 font-body mt-0.5 line-clamp-2">{board.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-white/30 font-body">
                        <span>📂 {board._count.columns} etapas</span>
                        <span>🃏 {board._count.cards} cards</span>
                        <span className="ml-auto">{formatRelativeDate(board.createdAt)}</span>
                      </div>

                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/10 group-hover:text-white/50 group-hover:translate-x-1 transition-all duration-200 text-lg">
                        →
                      </div>
                    </div>
                  </Link>

                  {/* Admin — Abortar Missão (outside Link to avoid nav) */}
                  {isAdmin && (
                    <div
                      className="absolute bottom-3 left-3 z-10"
                      onClick={(e) => e.preventDefault()}
                    >
                      <AnimatePresence mode="wait">
                        {confirmAbortId === board.id ? (
                          <motion.div
                            key="confirm"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/50 bg-black/80 backdrop-blur-sm"
                          >
                            <span className="text-[11px] text-red-300 font-display font-black">Abortar?</span>
                            <button
                              onClick={() => abortMission(board.id)}
                              disabled={aborting === board.id}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-display font-black disabled:opacity-40 transition-all"
                            >
                              {aborting === board.id ? '⏳' : 'Sim'}
                            </button>
                            <button
                              onClick={() => setConfirmAbortId(null)}
                              className="text-[11px] px-2 py-0.5 rounded-md border border-white/20 text-white/55 hover:text-white/80 font-body transition-all"
                            >
                              Não
                            </button>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="abort-btn"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setConfirmAbortId(board.id)}
                            className="text-[11px] px-2.5 py-1 rounded-lg border border-red-500/20 text-red-400/55 bg-black/50 hover:border-red-500/55 hover:text-red-300 hover:bg-red-950/70 transition-all font-display font-black backdrop-blur-sm"
                          >
                            🚫 Abortar Missão
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              ))}

              {boards.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="text-6xl mb-4 animate-float">🌌</div>
                  <h3 className="font-display text-lg text-white/40 tracking-wide">Nenhuma missão ainda</h3>
                  <p className="text-sm text-white/20 font-body mt-1">Aguarde o Admin criar a primeira missão</p>
                </motion.div>
              )}
            </div>
          )}
        </section>

        {/* ── Missões Abortadas — Admin only ──────────────────── */}
        {isAdmin && (
          <section>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between mb-4 cursor-pointer select-none"
              onClick={() => setShowArchived((p) => !p)}
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                <p className="text-xs font-display tracking-[0.25em] text-red-400/70 uppercase font-black">
                  🚫 Missões Abortadas
                </p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/12 border border-red-500/25 text-red-400 font-mono">
                  {archivedBoards.length}
                </span>
              </div>
              <span className="text-white/25 hover:text-white/60 transition-colors text-xs">
                {showArchived ? '▲ ocultar' : '▼ exibir'}
              </span>
            </motion.div>

            <AnimatePresence>
              {showArchived && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {archivedBoards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center glass rounded-2xl border border-red-500/10">
                      <span className="text-3xl mb-2">📭</span>
                      <p className="text-sm text-white/25 font-body">Nenhuma missão abortada</p>
                    </div>
                  ) : (
                    <div className="glass rounded-2xl overflow-hidden border border-red-500/12">
                      {archivedBoards.map((board, i) => (
                        <motion.div
                          key={board.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-4 px-5 py-3.5 border-b border-red-500/8 last:border-0 hover:bg-red-500/4 transition-colors"
                        >
                          {/* Color dot */}
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 opacity-50" style={{ background: board.color }} />

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-display font-semibold text-white/60 truncate">{board.title}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[11px] text-white/25 font-body">
                                📂 {board._count.columns} etapas · 🃏 {board._count.cards} cards
                              </span>
                              {board.archivedAt && (
                                <span className="text-[10px] text-red-400/50 font-mono">
                                  🚫 {new Date(board.archivedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Restore button */}
                          <button
                            onClick={() => restoreMission(board.id)}
                            disabled={restoring === board.id}
                            className={cn(
                              'shrink-0 text-[11px] px-3 py-1.5 rounded-lg border font-display font-black transition-all',
                              'border-neon-cyan/25 text-neon-cyan/60 bg-neon-cyan/5',
                              'hover:border-neon-cyan/55 hover:text-neon-cyan hover:bg-neon-cyan/12',
                              'disabled:opacity-40 disabled:cursor-not-allowed',
                            )}
                          >
                            {restoring === board.id ? '⏳ Reintegrando...' : '↩ Reintegrar Missão'}
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

      </main>

      <BoardManagerModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={handleBoardSaved}
      />

      <ImportCSVModal
        open={showImport}
        type="missions"
        onClose={() => setShowImport(false)}
        onSuccess={() => {
          setShowImport(false)
          api.get('/boards').then(({ data }) => setBoards(data.boards)).catch(() => {})
        }}
      />
    </div>
  )
}
