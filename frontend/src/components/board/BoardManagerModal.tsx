'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface ApiUser { id: string; name: string; email: string; avatarUrl?: string }

interface BoardManagerProps {
  open: boolean
  onClose: () => void
  /** undefined = create mode, object = edit mode */
  editBoard?: {
    id: string; title: string; color: string; description?: string
    memberIds: string[]; coordinatorIds?: string[]
    /** Optional: pre-resolved members with full info — avoids losing members
     *  that fall outside the first 20 results of /users (which is paginated). */
    members?: ApiUser[]
  } | null
  onSaved?: (board: any) => void
}

const COLORS = [
  { hex: '#7c3aed', label: 'Violeta' },
  { hex: '#06b6d4', label: 'Ciano'   },
  { hex: '#ec4899', label: 'Rosa'    },
  { hex: '#10b981', label: 'Verde'   },
  { hex: '#f59e0b', label: 'Âmbar'   },
  { hex: '#ef4444', label: 'Vermelho'},
  { hex: '#8b5cf6', label: 'Púrpura' },
  { hex: '#14b8a6', label: 'Teal'    },
]

export function BoardManagerModal({ open, onClose, editBoard, onSaved }: BoardManagerProps) {
  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [color,          setColor]          = useState('#7c3aed')
  const [members,        setMembers]        = useState<ApiUser[]>([])
  const [coordinatorIds, setCoordinatorIds] = useState<Set<string>>(new Set())
  const [allUsers,       setAllUsers]       = useState<ApiUser[]>([])
  const [search,         setSearch]         = useState('')
  const [loading,        setLoading]        = useState(false)
  const [populated,      setPopulated]      = useState(false)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setPopulated(false)
    setSearch('')
    if (editBoard) {
      setTitle(editBoard.title)
      setDescription(editBoard.description ?? '')
      setColor(editBoard.color)
      setCoordinatorIds(new Set(editBoard.coordinatorIds ?? []))
      // Use pre-resolved members when available to avoid losing entries beyond
      // the first 20 results of /users
      if (editBoard.members && editBoard.members.length > 0) {
        setMembers(editBoard.members)
        setPopulated(true)
      }
    } else {
      setTitle(''); setDescription(''); setColor('#7c3aed'); setMembers([]); setCoordinatorIds(new Set())
    }
  }, [open])

  // Fetch users + pre-populate members on edit
  useEffect(() => {
    if (!open) return
    api.get('/users', { params: { search: search || undefined } })
      .then(({ data }) => {
        setAllUsers(data.users)
        if (editBoard && !populated) {
          setPopulated(true)
          const pre = (data.users as ApiUser[]).filter((u) => editBoard.memberIds.includes(u.id))
          setMembers(pre)
        }
      })
      .catch(() => {})
  }, [open, search])

  const availableUsers = allUsers.filter((u) => !members.find((m) => m.id === u.id))

  function addMember(user: ApiUser) {
    setMembers((m) => m.find((x) => x.id === user.id) ? m : [...m, user])
    setSearch('')
  }

  function removeMember(userId: string) {
    setMembers((m) => m.filter((x) => x.id !== userId))
    setCoordinatorIds((prev) => { const n = new Set(prev); n.delete(userId); return n })
  }

  function toggleCoordinator(userId: string) {
    setCoordinatorIds((prev) => {
      const n = new Set(prev)
      n.has(userId) ? n.delete(userId) : n.add(userId)
      return n
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      color,
      memberIds: members.map((m) => m.id),
      coordinatorIds: [...coordinatorIds],
    }

    try {
      let board: any
      if (editBoard) {
        const { data } = await api.patch(`/boards/${editBoard.id}`, payload)
        board = data.board
        toast.success('Missão atualizada 🛸')
      } else {
        const { data } = await api.post('/boards', payload)
        board = data.board
        toast.success('Missão criada! 🚀')
      }
      onSaved?.(board)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar missão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass max-h-[90vh] flex flex-col"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-violet/60 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div>
                <h3 className="font-display text-base font-black tracking-wider text-white">
                  {editBoard ? '✏️ EDITAR MISSÃO' : '🚀 NOVA MISSÃO'}
                </h3>
                <p className="text-sm text-white/65 font-body mt-0.5">
                  {editBoard ? 'Atualize os dados e a tripulação' : 'Defina a missão e adicione a tripulação'}
                </p>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5 overflow-y-auto scrollbar-space flex-1">
              {/* Title */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Nome da Missão *
                </label>
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required
                  placeholder="Ex: Lançamento Alpha"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Descrição
                </label>
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Objetivo desta missão (opcional)"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-2">
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c.hex} type="button" onClick={() => setColor(c.hex)} title={c.label}
                      className="w-9 h-9 rounded-xl transition-all duration-200 shrink-0"
                      style={{
                        background:    c.hex,
                        transform:     color === c.hex ? 'scale(1.25)' : 'scale(1)',
                        boxShadow:     color === c.hex ? `0 0 16px ${c.hex}` : 'none',
                        outline:       color === c.hex ? `2px solid ${c.hex}` : 'none',
                        outlineOffset: '3px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Member picker */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Tripulação
                  <span className="text-white/40 normal-case font-body font-normal ml-1">(quem pode ver e participar)</span>
                </label>

                {/* Selected members */}
                {members.length > 0 && (
                  <div className="space-y-1 mb-3">
                    <p className="text-[11px] text-white/35 font-body mb-1.5">
                      Clique em ★ para tornar coordenador da missão
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {members.map((m) => {
                        const isCoord = coordinatorIds.has(m.id)
                        return (
                          <div key={m.id}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-body font-semibold transition-all',
                              isCoord
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-white/8 border-white/18 text-white/80',
                            )}>
                            <Avatar name={m.name} size="xs" />
                            <span className="truncate max-w-[80px]">{m.name.split(' ')[0]}</span>
                            <button
                              type="button"
                              onClick={() => toggleCoordinator(m.id)}
                              title={isCoord ? 'Remover coordenador' : 'Tornar coordenador'}
                              className={cn(
                                'transition-colors text-sm leading-none',
                                isCoord ? 'text-amber-400 hover:text-white/40' : 'text-white/25 hover:text-amber-400',
                              )}
                            >
                              ★
                            </button>
                            <button type="button" onClick={() => removeMember(m.id)}
                              className="text-white/35 hover:text-red-400 transition-colors">
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Buscar tripulante..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space mb-2" />

                <div className="max-h-40 overflow-y-auto scrollbar-space space-y-1 rounded-xl bg-white/3 border border-white/10 p-1.5">
                  {availableUsers.length === 0 && (
                    <p className="text-xs text-white/40 font-body text-center py-3">
                      {search ? 'Nenhum resultado' : 'Todos os usuários já adicionados'}
                    </p>
                  )}
                  {availableUsers.map((user) => (
                    <button key={user.id} type="button" onClick={() => addMember(user)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/8 border border-transparent hover:border-white/14 transition-all group">
                      <Avatar name={user.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-body font-semibold text-white/90 truncate">{user.name}</div>
                        <div className="text-xs text-white/50 font-body truncate">{user.email}</div>
                      </div>
                      <span className="text-white/25 group-hover:text-neon-violet text-lg transition-colors">+</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {title && (
                <div className="px-3 py-2.5 rounded-xl border flex items-center gap-2 shrink-0"
                  style={{ borderColor: color + '40', background: color + '10' }}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                  <span className="text-sm font-display font-bold text-white/90 truncate flex-1">{title}</span>
                  {members.length > 0 && (
                    <div className="flex -space-x-1.5 shrink-0">
                      {members.slice(0, 4).map((m) => (
                        <div key={m.id} className="ring-1 ring-space-deep rounded-md">
                          <Avatar name={m.name} size="xs" />
                        </div>
                      ))}
                      {members.length > 4 && (
                        <div className="w-5 h-5 rounded-md bg-white/15 flex items-center justify-center text-[9px] font-display font-black text-white/70 ring-1 ring-space-deep">
                          +{members.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 shrink-0">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body font-semibold border border-white/18 text-white/75 hover:bg-white/7 transition-all">
                  Cancelar
                </button>
                <motion.button type="submit" disabled={loading || !title.trim()}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black tracking-wider text-white uppercase disabled:opacity-40 transition-all"
                  style={{ background: `linear-gradient(135deg, ${color}cc, #06b6d4)` }}>
                  {loading ? '⚡ Salvando...' : editBoard ? '✏️ Atualizar Missão' : '🚀 Criar Missão'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
