'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, getInitials } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import api from '@/lib/api'
import { useBoardStore } from '@/stores/boardStore'
import toast from 'react-hot-toast'

interface ApiUser { id: string; name: string; email: string; avatarUrl?: string }

interface ColumnManagerProps {
  open: boolean
  onClose: () => void
  boardId: string
  editColumn?: { id: string; title: string; ownerId: string; color: string; ownerIds?: string[] } | null
}

// Fetch board members to restrict user picker
async function fetchBoardMembers(boardId: string): Promise<ApiUser[]> {
  try {
    const { data } = await api.get(`/boards/${boardId}`)
    const board = data.board
    // Include board owner + all members
    const memberUsers = board.members?.map((m: any) => m.user) ?? []
    const owner = board.owner
    const all = [owner, ...memberUsers]
    // deduplicate by id
    return all.filter((u: ApiUser, i: number, arr: ApiUser[]) => arr.findIndex((x) => x.id === u.id) === i)
  } catch {
    return []
  }
}

const COLORS = [
  { hex: '#7c3aed', label: 'Violeta' },
  { hex: '#06b6d4', label: 'Ciano' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#f59e0b', label: 'Âmbar' },
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#8b5cf6', label: 'Púrpura' },
  { hex: '#14b8a6', label: 'Teal' },
]

export function ColumnManagerModal({ open, onClose, boardId, editColumn }: ColumnManagerProps) {
  const { fetchBoard } = useBoardStore()

  const [title,       setTitle]       = useState('')
  const [color,       setColor]       = useState('#7c3aed')
  const [primaryOwner, setPrimaryOwner] = useState<ApiUser | null>(null)
  const [members,     setMembers]     = useState<ApiUser[]>([])   // all selected owners

  const [allUsers,    setAllUsers]    = useState<ApiUser[]>([])
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(false)
  const populatedRef                  = useRef(false)

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return
    populatedRef.current = false
    if (editColumn) {
      setTitle(editColumn.title)
      setColor(editColumn.color)
    } else {
      setTitle(''); setColor('#7c3aed')
      setPrimaryOwner(null)
      setMembers([])
    }
  }, [open])

  // Fetch board members (restricted list) and pre-populate owners when editing
  useEffect(() => {
    if (!open) return
    fetchBoardMembers(boardId).then((boardUsers) => {
      const filtered = search
        ? boardUsers.filter((u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
          )
        : boardUsers
      setAllUsers(filtered)
      if (editColumn && !populatedRef.current) {
        populatedRef.current = true
        const ownerIds = editColumn.ownerIds ?? [editColumn.ownerId]
        const preSelected = boardUsers.filter((u) => ownerIds.includes(u.id))
        setMembers(preSelected)
        const primary = boardUsers.find((u) => u.id === editColumn.ownerId) ?? preSelected[0] ?? null
        setPrimaryOwner(primary)
      }
    })
  }, [open, search, boardId])

  // Users NOT yet selected
  const availableUsers = allUsers.filter((u) => !members.find((m) => m.id === u.id))

  function addMember(user: ApiUser) {
    setMembers((m) => {
      if (m.find((x) => x.id === user.id)) return m
      const next = [...m, user]
      // First added becomes primary owner
      if (!primaryOwner) setPrimaryOwner(user)
      return next
    })
    setSearch('')
  }

  function removeMember(userId: string) {
    setMembers((m) => {
      const next = m.filter((x) => x.id !== userId)
      // If we removed the primary owner, promote first remaining
      if (primaryOwner?.id === userId) {
        setPrimaryOwner(next[0] ?? null)
      }
      return next
    })
  }

  function setPrimary(user: ApiUser) {
    setPrimaryOwner(user)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!primaryOwner) { toast.error('Adicione pelo menos um responsável'); return }
    setLoading(true)

    const payload = {
      title: title.trim(),
      color,
      ownerId:  primaryOwner.id,
      ownerIds: members.map((m) => m.id),
    }

    try {
      if (editColumn) {
        await api.patch(`/columns/${editColumn.id}`, payload)
        toast.success('Etapa atualizada 🛸')
      } else {
        await api.post(`/boards/${boardId}/columns`, payload)
        toast.success('Etapa criada! 🚀')
      }
      await fetchBoard(boardId)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar coluna')
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
            className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-cyan/60 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-base font-black tracking-wider text-white">
                  {editColumn ? '✏️ EDITAR ETAPA' : '+ NOVA ETAPA'}
                </h3>
                <p className="text-sm text-white/65 font-body mt-0.5">
                  Adicione um ou mais responsáveis pela etapa
                </p>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Nome da Etapa *
                </label>
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required
                  placeholder="Ex: Em Órbita, Missão Completa..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-2">
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c.hex} type="button" onClick={() => setColor(c.hex)} title={c.label}
                      className="w-9 h-9 rounded-xl transition-all duration-200 shrink-0"
                      style={{
                        background:   c.hex,
                        transform:    color === c.hex ? 'scale(1.25)' : 'scale(1)',
                        boxShadow:    color === c.hex ? `0 0 16px ${c.hex}` : 'none',
                        outline:      color === c.hex ? `2px solid ${c.hex}` : 'none',
                        outlineOffset: '3px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Member picker */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Responsáveis <span className="text-red-400">*</span>
                  <span className="text-white/40 normal-case font-body font-normal ml-1">(pelo menos 1)</span>
                </label>

                {/* Selected members — chips */}
                {members.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-body font-semibold transition-all',
                          primaryOwner?.id === m.id
                            ? 'bg-neon-violet/25 border-neon-violet/55 text-white'
                            : 'bg-white/8 border-white/18 text-white/80',
                        )}
                      >
                        <Avatar name={m.name} size="xs" />
                        <span className="truncate max-w-[100px]">{m.name.split(' ')[0]}</span>
                        {primaryOwner?.id === m.id && (
                          <span className="text-[9px] text-neon-violet/90 font-display font-black ml-0.5">PRIMARY</span>
                        )}
                        {primaryOwner?.id !== m.id && (
                          <button type="button" onClick={() => setPrimary(m)} title="Definir como principal"
                            className="text-white/30 hover:text-neon-violet transition-colors text-[10px]">
                            ★
                          </button>
                        )}
                        <button type="button" onClick={() => removeMember(m.id)}
                          className="text-white/35 hover:text-red-400 transition-colors ml-0.5">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search box */}
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Buscar tripulante para adicionar..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space mb-2" />

                {/* User list */}
                <div className="max-h-48 overflow-y-auto scrollbar-space space-y-1 rounded-xl bg-white/3 border border-white/10 p-1.5">
                  {availableUsers.length === 0 && (
                    <p className="text-xs text-white/40 font-body font-medium text-center py-4">
                      {search ? 'Nenhum resultado' : 'Todos os usuários já foram adicionados'}
                    </p>
                  )}
                  {availableUsers.map((user) => (
                    <button key={user.id} type="button" onClick={() => addMember(user)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/8 border border-transparent hover:border-white/14 transition-all group">
                      <Avatar name={user.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-body font-semibold text-white/90 truncate group-hover:text-white">{user.name}</div>
                        <div className="text-xs text-white/50 font-body truncate">{user.email}</div>
                      </div>
                      <span className="text-white/25 group-hover:text-neon-violet text-lg transition-colors">+</span>
                    </button>
                  ))}
                </div>

                {members.length > 0 && (
                  <p className="text-[11px] text-white/50 font-body mt-1.5">
                    ★ Clique na estrela para definir o responsável principal da coluna
                  </p>
                )}
              </div>

              {/* Preview */}
              {members.length > 0 && (
                <div className="px-3 py-2.5 rounded-xl border flex items-center gap-2"
                  style={{ borderColor: color + '40', background: color + '10' }}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-display font-bold text-white/90 truncate">{title || 'Nova Coluna'}</span>
                  <div className="flex -space-x-1.5 ml-auto shrink-0">
                    {members.slice(0, 4).map((m) => (
                      <div key={m.id} className="ring-1 ring-space-deep rounded-md" style={{ zIndex: 1 }}>
                        <Avatar name={m.name} size="xs" />
                      </div>
                    ))}
                    {members.length > 4 && (
                      <div className="w-5 h-5 rounded-md bg-white/15 flex items-center justify-center text-[9px] font-display font-black text-white/70 ring-1 ring-space-deep">
                        +{members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body font-semibold border border-white/18 text-white/75 hover:bg-white/7 transition-all">
                  Cancelar
                </button>
                <motion.button type="submit" disabled={loading || !title.trim() || members.length === 0}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black tracking-wider text-white uppercase disabled:opacity-40 transition-all"
                  style={{ background: `linear-gradient(135deg, ${color}cc, #06b6d4)` }}>
                  {loading ? '⚡ Salvando...' : editColumn ? '✏️ Atualizar Etapa' : '🚀 Criar Etapa'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

