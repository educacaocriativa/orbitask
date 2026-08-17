'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { cn } from '@/lib/utils'

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

/**
 * Cria um projeto que existe SÓ na Timeline — ele não aparece em missões
 * ativas nem ganha quadro Kanban.
 */
export function NewTimelineBoardModal({ open, onClose, onCreated }: Props) {
  useEscapeToClose(open, onClose)
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor]             = useState(COLORS[0])
  const [saving, setSaving]           = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setColor(COLORS[0])
      setTimeout(() => titleRef.current?.focus(), 80)
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!title.trim()) {
      toast.error('Dê um nome ao projeto')
      titleRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      await api.post('/timeline/boards', {
        title:       title.trim(),
        description: description.trim() || undefined,
        color,
      })
      toast.success('Projeto criado')
      onCreated()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível criar o projeto')
    } finally {
      setSaving(false)
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
            className="w-full max-w-md glass-strong rounded-2xl border border-white/16 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-[11px] font-display font-black tracking-[0.25em] text-cyan-400/70 uppercase mb-1">
                Novo projeto
              </p>
              <h2 className="font-display text-lg font-black text-white tracking-wide">
                Projeto de linha do tempo
              </h2>
            </div>

            <form onSubmit={submit} className="p-5 space-y-4">
              <label className="block">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Nome
                </span>
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Contratos 2026"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Descrição
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Para que serve esta linha do tempo"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space resize-none"
                />
              </label>

              <div>
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Cor
                </span>
                <div className="flex gap-2 mt-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Cor ${c}`}
                      className={cn(
                        'w-8 h-8 rounded-lg border-2 transition-all',
                        color === c ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <p className="text-[10px] font-body text-white/30 leading-relaxed">
                Este projeto aparece só na Timeline — ele não entra em missões ativas
                e não ganha quadro de etapas. Depois de criar, adicione as pessoas
                dentro do projeto.
              </p>
            </form>

            <div className="px-5 py-4 border-t border-white/8 flex items-center justify-end gap-2.5">
              <button type="button" onClick={onClose} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-body font-bold text-white/55 hover:text-white/85 disabled:opacity-40 transition-colors">
                Cancelar
              </button>
              <motion.button onClick={submit} disabled={saving}
                whileHover={{ scale: saving ? 1 : 1.03 }} whileTap={{ scale: 0.97 }}
                className="px-4 py-2 rounded-xl border border-neon-violet/55 bg-neon-violet/25 text-white text-sm font-display font-black tracking-wide hover:bg-neon-violet/35 disabled:opacity-40 transition-all">
                {saving ? 'Criando...' : 'Criar projeto'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
