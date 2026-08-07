'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useEscapeToClose } from './useEscapeToClose'
import type { TimelineBoard, TimelineDocument } from '@/types/timeline'

interface Props {
  open: boolean
  boards: TimelineBoard[]
  onClose: () => void
  onChanged: () => void
}

/**
 * Documentos lançados antes da Timeline ser separada por projeto.
 *
 * Eles não têm dono, e a migração não inventou um: cada um é realocado aqui,
 * um por um. Conforme são movidos somem da lista; quando ela zera, a faixa na
 * tela de projetos desaparece sozinha.
 */
export function OrphanDocumentsModal({ open, boards, onClose, onChanged }: Props) {
  useEscapeToClose(open, onClose)
  const [documents, setDocuments] = useState<TimelineDocument[]>([])
  const [loading, setLoading]     = useState(false)
  const [movingId, setMovingId]   = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/timeline/orphans')
      .then(({ data }) => setDocuments(data.documents))
      .catch(() => toast.error('Não foi possível carregar os documentos'))
      .finally(() => setLoading(false))
  }, [open])

  async function moveTo(documentId: string, boardId: string) {
    if (!boardId) return
    setMovingId(documentId)
    try {
      await api.patch(`/timeline/documents/${documentId}`, { boardId })
      setDocuments((prev) => prev.filter((d) => d.id !== documentId))
      onChanged()
      toast.success('Documento movido')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível mover o documento')
    } finally {
      setMovingId(null)
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
            className="w-full max-w-2xl glass-strong rounded-2xl border border-white/16 overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-[11px] font-display font-black tracking-[0.25em] text-amber-400/70 uppercase mb-1">
                Sem projeto
              </p>
              <h2 className="font-display text-lg font-black text-white tracking-wide">
                {documents.length} {documents.length === 1 ? 'documento a organizar' : 'documentos a organizar'}
              </h2>
              <p className="text-[11px] font-body text-white/40 mt-1">
                Lançados antes da Timeline ser dividida por projeto. Escolha o destino de cada um.
              </p>
            </div>

            <div className="p-5 overflow-y-auto scrollbar-space">
              {loading ? (
                <p className="text-sm font-body text-white/45 text-center py-10">Carregando...</p>
              ) : documents.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-3xl mb-2">✓</div>
                  <p className="text-sm font-body text-white/55">
                    Tudo organizado. Nenhum documento sem projeto.
                  </p>
                </div>
              ) : boards.length === 0 ? (
                <p className="text-sm font-body text-amber-200/80 text-center py-10">
                  Crie um projeto primeiro para ter para onde mover estes documentos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li key={doc.id}
                      className="flex flex-wrap items-center gap-3 px-3 py-3 rounded-xl border border-white/8 bg-white/3">
                      <span className="text-sm shrink-0">📄</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-body font-semibold text-white/85 truncate">
                          {doc.name}
                        </span>
                        <span className="block text-[10px] font-body text-white/40">
                          {formatDate(doc.date)} · {doc.createdBy.name}
                          {doc.files.length > 0 && ` · 📎 ${doc.files.length}`}
                        </span>
                      </span>

                      <select
                        defaultValue=""
                        disabled={movingId === doc.id}
                        onChange={(e) => moveTo(doc.id, e.target.value)}
                        className="px-3 py-2 rounded-xl text-xs font-body input-space max-w-[190px] disabled:opacity-40"
                      >
                        <option value="">
                          {movingId === doc.id ? 'movendo...' : 'mover para...'}
                        </option>
                        {boards.map((b) => (
                          <option key={b.id} value={b.id}>{b.title}</option>
                        ))}
                      </select>
                    </li>
                  ))}
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

function formatDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}
