'use client'
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Navbar } from '@/components/ui/Navbar'
import { useAuthStore } from '@/stores/authStore'
import { NewTimelineBoardModal } from '@/components/timeline/NewTimelineBoardModal'
import { OrphanDocumentsModal } from '@/components/timeline/OrphanDocumentsModal'
import { cn } from '@/lib/utils'
import type { TimelineBoard, TimelineBoardsResponse } from '@/types/timeline'

export default function TimelineBoardsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')

  const [boards, setBoards]           = useState<TimelineBoard[]>([])
  const [orphanCount, setOrphanCount] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TimelineBoardsResponse>('/timeline/boards')
      setBoards(data.boards)
      setOrphanCount(data.orphanCount)
    } catch {
      toast.error('Não foi possível carregar os projetos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-10">

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <p className="text-xs font-display font-black tracking-[0.3em] text-cyan-400/80 mb-1.5 uppercase">
            🗓 Linha do tempo
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-black text-white tracking-wide">
                Escolha um projeto
              </h1>
              <p className="text-sm font-body text-white/50 mt-1">
                Cada projeto tem a sua própria linha do tempo de documentos.
              </p>
            </div>

            {isAdmin && (
              <motion.button
                onClick={() => setShowCreate(true)}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="px-4 py-2 rounded-xl border border-neon-violet/55 bg-neon-violet/25 text-white text-sm font-display font-black tracking-wide hover:bg-neon-violet/35 transition-all"
              >
                + Novo projeto
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Documentos anteriores à separação por projeto */}
        {isAdmin && orphanCount > 0 && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setShowOrphans(true)}
            className="w-full mb-6 glass rounded-2xl border border-amber-500/30 bg-amber-500/6 p-4 flex items-center gap-3 text-left hover:bg-amber-500/10 transition-colors"
          >
            <span className="text-2xl">📥</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-body font-semibold text-amber-200">
                {orphanCount} {orphanCount === 1 ? 'documento sem projeto' : 'documentos sem projeto'}
              </span>
              <span className="block text-xs font-body text-amber-200/70 mt-0.5">
                Lançados antes da separação por projeto. Clique para escolher o destino de cada um.
              </span>
            </span>
            <span className="text-amber-300/60 text-sm shrink-0">organizar →</span>
          </motion.button>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-4xl">🛸</motion.div>
          </div>
        ) : boards.length === 0 ? (
          <div className="glass rounded-2xl border border-white/14 p-12 text-center">
            <div className="text-4xl mb-3">🗓</div>
            <p className="text-sm font-body text-white/60 max-w-md mx-auto">
              {isAdmin
                ? 'Nenhum projeto com linha do tempo ainda. Crie o primeiro no botão acima.'
                : 'Você ainda não foi incluído em nenhuma linha do tempo. Peça a um administrador para adicionar você a um projeto.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board, i) => (
              <motion.div
                key={board.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                <Link
                  href={`/timeline/${board.id}`}
                  className="block glass rounded-2xl border border-white/14 p-5 h-full hover:border-white/28 hover:bg-white/4 transition-all group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: board.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-base font-black text-white/90 tracking-wide truncate group-hover:text-white">
                        {board.title}
                      </h2>
                      {board.description && (
                        <p className="text-xs font-body text-white/45 mt-1 line-clamp-2">
                          {board.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-body">
                    <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/3 text-white/60">
                      📄 {board.documentCount} {board.documentCount === 1 ? 'documento' : 'documentos'}
                    </span>
                    <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/3 text-white/60">
                      👥 {board.memberCount}
                    </span>
                    {!board.timelineOnly && (
                      <span
                        className="px-2 py-1 rounded-lg border border-violet-500/25 bg-violet-500/8 text-violet-300"
                        title="Este projeto também tem quadro de missões"
                      >
                        + Kanban
                      </span>
                    )}
                  </div>

                  <p className={cn(
                    'text-[11px] font-body mt-3',
                    board.lastDocumentDate ? 'text-white/35' : 'text-white/25',
                  )}>
                    {board.lastDocumentDate
                      ? `último lançamento em ${formatDate(board.lastDocumentDate)}`
                      : 'nenhum documento lançado'}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <NewTimelineBoardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
      />

      <OrphanDocumentsModal
        open={showOrphans}
        boards={boards}
        onClose={() => setShowOrphans(false)}
        onChanged={load}
      />
    </div>
  )
}

function formatDate(date: string): string {
  // Meio-dia fixa o dia em qualquer fuso: `new Date('2026-08-05')` seria
  // meia-noite UTC e exibiria 04/08 no Brasil.
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}
