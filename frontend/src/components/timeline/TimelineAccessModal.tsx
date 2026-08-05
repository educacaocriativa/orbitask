'use client'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { TimelineAccessUser } from '@/types/timeline'

interface Props {
  open: boolean
  onClose: () => void
  /** Avisa a página para recarregar a lista de quem pode ser marcado com @. */
  onChanged: () => void
}

/** Gerência de quem entra e sai da Timeline. Só ADMIN chega aqui. */
export function TimelineAccessModal({ open, onClose, onChanged }: Props) {
  const [users, setUsers]     = useState<TimelineAccessUser[]>([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/timeline/access')
      .then(({ data }) => setUsers(data.users))
      .catch(() => toast.error('Não foi possível carregar as pessoas'))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((u) => u.name.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query))
  }, [users, search])

  const withAccess = users.filter((u) => u.role === 'ADMIN' || u.timelineAccess).length

  async function toggle(user: TimelineAccessUser) {
    if (user.role === 'ADMIN') return
    setSavingId(user.id)
    const next = !user.timelineAccess
    try {
      await api.patch(`/timeline/access/${user.id}`, { hasAccess: next })
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, timelineAccess: next } : u)))
      onChanged()
    } catch {
      toast.error(`Não foi possível ${next ? 'adicionar' : 'remover'} ${user.name}`)
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
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-strong rounded-2xl border border-white/16 overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-[11px] font-display font-black tracking-[0.25em] text-cyan-400/70 uppercase mb-1">
                Acesso à Timeline
              </p>
              <h2 className="font-display text-lg font-black text-white tracking-wide">
                {withAccess} {withAccess === 1 ? 'pessoa' : 'pessoas'} com acesso
              </h2>
              <p className="text-[11px] font-body text-white/40 mt-1">
                Quem estiver marcado vê o botão Timeline e pode lançar documentos.
              </p>
            </div>

            <div className="px-5 pt-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar pessoa"
                className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space" />
            </div>

            <div className="p-5 pt-3 overflow-y-auto scrollbar-space">
              {loading ? (
                <p className="text-sm font-body text-white/45 text-center py-8">Carregando...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm font-body text-white/45 text-center py-8">Ninguém encontrado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((u) => {
                    const isAdmin = u.role === 'ADMIN'
                    const hasAccess = isAdmin || u.timelineAccess

                    return (
                      <li key={u.id}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors',
                          hasAccess ? 'border-cyan-500/25 bg-cyan-500/6' : 'border-white/8 bg-white/2',
                        )}>
                        <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-body font-semibold text-white/85 truncate">{u.name}</span>
                          <span className="block text-[10px] font-body text-white/35 truncate">{u.email}</span>
                        </span>

                        {isAdmin ? (
                          <span className="text-[10px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-300 font-body font-bold">
                            admin · sempre
                          </span>
                        ) : (
                          <button onClick={() => toggle(u)} disabled={savingId === u.id}
                            className={cn(
                              'text-xs px-2.5 py-1.5 rounded-lg font-body font-bold border transition-all disabled:opacity-40',
                              u.timelineAccess
                                ? 'border-white/16 text-white/55 hover:text-white/85 hover:border-white/30'
                                : 'border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/12',
                            )}>
                            {savingId === u.id ? '...' : u.timelineAccess ? 'Remover' : 'Adicionar'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/8 flex justify-end">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-body font-bold text-white/60 hover:text-white/90 transition-colors">
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
