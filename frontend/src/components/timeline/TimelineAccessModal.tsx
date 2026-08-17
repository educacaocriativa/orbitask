'use client'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { TimelineBoardPerson } from '@/types/timeline'

interface Props {
  open: boolean
  boardId: string
  boardTitle: string
  onClose: () => void
  /** Avisa a tela para recarregar quem pode ser marcado com @. */
  onChanged: () => void
}

/**
 * Pessoas da timeline DESTE projeto. Só ADMIN chega aqui.
 *
 * A lista principal traz apenas quem já faz parte do projeto — timeline é para
 * quem está na missão. Para incluir alguém de fora, o bloco "Adicionar ao
 * projeto" coloca a pessoa nos dois níveis de uma vez; é o único caminho num
 * projeto criado pela Timeline, que não tem quadro de missões.
 */
export function TimelineAccessModal({ open, boardId, boardTitle, onClose, onChanged }: Props) {
  useEscapeToClose(open, onClose)
  const [people, setPeople]         = useState<TimelineBoardPerson[]>([])
  const [candidates, setCandidates] = useState<TimelineBoardPerson[]>([])
  const [search, setSearch]         = useState('')
  const [onlyMembers, setOnlyMembers] = useState(false)
  const [adding, setAdding]         = useState(false)
  const [addSearch, setAddSearch]   = useState('')
  const [loading, setLoading]       = useState(false)
  const [savingId, setSavingId]     = useState<string | null>(null)

  const load = useMemo(() => async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/timeline/boards/${boardId}/people`)
      setPeople(data.people)
      setCandidates(data.candidates)
    } catch {
      toast.error('Não foi possível carregar as pessoas')
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    if (!open) return
    setSearch(''); setOnlyMembers(false); setAdding(false); setAddSearch('')
    load()
  }, [open, load])

  const memberCount = people.filter((p) => p.isMember).length

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return people
      .filter((p) => !onlyMembers || p.isMember)
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query))
  }, [people, search, onlyMembers])

  const addOptions = useMemo(() => {
    const query = addSearch.trim().toLowerCase()
    return candidates
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query))
      .slice(0, 8)
  }, [candidates, addSearch])

  async function toggle(person: TimelineBoardPerson) {
    setSavingId(person.id)
    const next = !person.isMember
    try {
      await api.patch(`/timeline/boards/${boardId}/people/${person.id}`, { isMember: next })
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, isMember: next } : p)))
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? `Não foi possível ${next ? 'adicionar' : 'remover'} ${person.name}`)
    } finally {
      setSavingId(null)
    }
  }

  async function addToProject(person: TimelineBoardPerson) {
    setSavingId(person.id)
    try {
      await api.post(`/timeline/boards/${boardId}/people`, { userId: person.id })
      setCandidates((prev) => prev.filter((p) => p.id !== person.id))
      setPeople((prev) => [...prev, { ...person, isMember: true, inProject: true }]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setAddSearch('')
      onChanged()
      toast.success(`${person.name} entrou no projeto e na timeline`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível adicionar a pessoa')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(4,2,15,0.72)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md glass-strong rounded-2xl border border-white/16 overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-[11px] font-display font-black tracking-[0.25em] text-cyan-400/70 uppercase mb-1 truncate">
                Pessoas · {boardTitle}
              </p>
              <h2 className="font-display text-lg font-black text-white tracking-wide">
                {memberCount} {memberCount === 1 ? 'pessoa' : 'pessoas'} nesta timeline
              </h2>
              <p className="text-[11px] font-body text-white/40 mt-1">
                Só quem faz parte do projeto pode participar da timeline.
              </p>
            </div>

            <div className="px-5 pt-4 flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar no projeto"
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-body input-space"
              />
              <button
                onClick={() => setOnlyMembers((v) => !v)}
                className={cn(
                  'shrink-0 text-xs px-3 py-2.5 rounded-xl font-body font-bold border transition-all',
                  onlyMembers
                    ? 'border-cyan-500/45 bg-cyan-500/12 text-cyan-300'
                    : 'border-white/14 text-white/55 hover:text-white/85 hover:border-white/28',
                )}
              >
                Só adicionados
              </button>
            </div>

            <div className="p-5 pt-3 overflow-y-auto scrollbar-space space-y-4">
              {loading ? (
                <p className="text-sm font-body text-white/45 text-center py-8">Carregando...</p>
              ) : visible.length === 0 ? (
                <p className="text-sm font-body text-white/45 text-center py-8">
                  {onlyMembers
                    ? 'Ninguém adicionado à timeline ainda.'
                    : search
                      ? 'Ninguém encontrado no projeto.'
                      : 'Este projeto ainda não tem pessoas. Use "Adicionar ao projeto" abaixo.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {visible.map((p) => (
                    <li key={p.id}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors',
                        p.isMember ? 'border-cyan-500/25 bg-cyan-500/6' : 'border-white/8 bg-white/2',
                      )}>
                      <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-body font-semibold text-white/85 truncate">{p.name}</span>
                        <span className="block text-[10px] font-body text-white/35 truncate">{p.email}</span>
                      </span>

                      {p.role === 'ADMIN' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-amber-500/30 text-amber-300 font-body font-bold shrink-0">
                          admin
                        </span>
                      )}

                      <button onClick={() => toggle(p)} disabled={savingId === p.id}
                        className={cn(
                          'shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-body font-bold border transition-all disabled:opacity-40',
                          p.isMember
                            ? 'border-white/16 text-white/55 hover:text-white/85 hover:border-white/30'
                            : 'border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/12',
                        )}>
                        {savingId === p.id ? '...' : p.isMember ? 'Remover' : 'Adicionar'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Incluir alguém de fora: entra no projeto e na timeline de uma vez */}
            <div className="px-5 py-4 border-t border-white/8">
              {adding ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      autoFocus
                      placeholder="Buscar pessoa fora do projeto"
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm font-body input-space"
                    />
                    <button onClick={() => { setAdding(false); setAddSearch('') }}
                      className="shrink-0 text-xs px-2.5 py-2.5 rounded-xl font-body text-white/45 hover:text-white/85 transition-colors">
                      cancelar
                    </button>
                  </div>

                  {addOptions.length === 0 ? (
                    <p className="text-xs font-body text-white/35 py-2">
                      {candidates.length === 0
                        ? 'Todo mundo já faz parte deste projeto.'
                        : 'Ninguém encontrado.'}
                    </p>
                  ) : (
                    <ul className="max-h-44 overflow-y-auto scrollbar-space space-y-1">
                      {addOptions.map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => addToProject(p)}
                            disabled={savingId === p.id}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/8 bg-white/2 hover:bg-white/6 hover:border-white/16 transition-all text-left disabled:opacity-40"
                          >
                            <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-body text-white/85 truncate">{p.name}</span>
                              <span className="block text-[10px] font-body text-white/35 truncate">{p.email}</span>
                            </span>
                            <span className="shrink-0 text-[11px] font-body font-bold text-cyan-300">
                              {savingId === p.id ? '...' : 'incluir'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[10px] font-body text-white/30">
                    A pessoa entra no projeto e na timeline ao mesmo tempo.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => setAdding(true)}
                    className="text-xs px-3 py-2 rounded-xl font-body font-bold border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/50 transition-all">
                    + Adicionar ao projeto
                  </button>
                  <button onClick={onClose}
                    className="px-4 py-2 rounded-xl text-sm font-body font-bold text-white/60 hover:text-white/90 transition-colors">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
