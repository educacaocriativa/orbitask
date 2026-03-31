'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, getPriorityIcon } from '@/lib/utils'
import { useBoardStore } from '@/stores/boardStore'
import toast from 'react-hot-toast'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const PRIORITY_LABELS = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítico' }

interface AddCardModalProps {
  open: boolean; onClose: () => void
  columnId: string; columnTitle: string; boardId: string
}

export function AddCardModal({ open, onClose, columnId, columnTitle, boardId }: AddCardModalProps) {
  const { addCard } = useBoardStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<string>('MEDIUM')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t])
      setTagInput('')
    }
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setIsLoading(true)
    try {
      await addCard(boardId, { title: title.trim(), description, priority, tags, columnId })
      toast.success('Card criado! 🛸')
      setTitle(''); setDescription(''); setPriority('MEDIUM'); setTags([])
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao criar card')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-md glass rounded-2xl p-6 shadow-glass"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-cyan/50 to-transparent" />

            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-sm font-semibold tracking-wider text-white">NOVO CARD</h3>
                <p className="text-xs text-white/40 font-body mt-0.5">Coluna: {columnTitle}</p>
              </div>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-display text-white/40 uppercase tracking-widest mb-1.5">Título *</label>
                <input
                  autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Descreva a tarefa..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-neon-cyan/40 transition-all"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-display text-white/40 uppercase tracking-widest mb-1.5">Descrição</label>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes da missão..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-neon-cyan/40 transition-all resize-none"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-display text-white/40 uppercase tracking-widest mb-1.5">Prioridade</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p} type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        'py-2 rounded-xl text-xs font-body border transition-all',
                        priority === p
                          ? `priority-${p} border-current`
                          : 'bg-white/3 border-white/8 text-white/40 hover:bg-white/6',
                      )}
                    >
                      <div className="text-base mb-0.5">{getPriorityIcon(p)}</div>
                      <div>{PRIORITY_LABELS[p]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-display text-white/40 uppercase tracking-widest mb-1.5">Tags</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-neon-violet/15 border border-neon-violet/25 text-neon-purple font-body">
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="text-white/30 hover:text-white/70">✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="+ adicionar tag"
                    className="flex-1 px-3 py-2 rounded-xl text-xs font-body bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-neon-violet/30 transition-all"
                  />
                  <button type="button" onClick={addTag} className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-all">
                    +
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body border border-white/10 text-white/50 hover:bg-white/5 transition-all">
                  Cancelar
                </button>
                <motion.button
                  type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  disabled={isLoading || !title.trim()}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-semibold tracking-wider text-white uppercase disabled:opacity-40 transition-all"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}
                >
                  {isLoading ? '⚡ Criando...' : '🚀 Criar Card'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

