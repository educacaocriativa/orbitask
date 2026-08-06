'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { TimelinePerson, TimelineDocument } from '@/types/timeline'

const MAX_FILE_BYTES = 50 * 1024 * 1024

interface Props {
  boardId: string
  date: string | null
  people: TimelinePerson[]
  onClose: () => void
  onCreated: (document: TimelineDocument) => void
}

export function NewDocumentModal({ boardId, date, people, onClose, onCreated }: Props) {
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [mentioned, setMentioned]     = useState<TimelinePerson[]>([])
  const [personQuery, setPersonQuery] = useState('')
  const [showPeople, setShowPeople]   = useState(false)
  const [file, setFile]               = useState<File | null>(null)
  const [saving, setSaving]           = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (date) {
      setName(''); setDescription(''); setMentioned([])
      setPersonQuery(''); setShowPeople(false); setFile(null)
      // Foca o primeiro campo assim que abre — quem clicou numa data já sabe
      // o que quer escrever.
      setTimeout(() => nameInputRef.current?.focus(), 80)
    }
  }, [date])

  const available = useMemo(() => {
    const chosen = new Set(mentioned.map((p) => p.id))
    const query  = personQuery.trim().toLowerCase()
    return people
      .filter((p) => !chosen.has(p.id))
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query))
      .slice(0, 6)
  }, [people, mentioned, personQuery])

  const prettyDate = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : ''

  function pickFile(selected: File | null) {
    if (selected && selected.size > MAX_FILE_BYTES) {
      toast.error('Arquivo muito grande. O limite é 50 MB.')
      return
    }
    setFile(selected)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || saving) return

    if (!name.trim()) {
      toast.error('Dê um nome ao documento')
      nameInputRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const { data } = await api.post('/timeline/documents', {
        boardId,
        name:             name.trim(),
        description:      description.trim() || undefined,
        date,
        mentionedUserIds: mentioned.map((p) => p.id),
      })

      let document: TimelineDocument = data.document

      // O documento já existe neste ponto. Se o upload falhar, o registro fica
      // de pé e a pessoa anexa o arquivo depois pela tela de detalhe — melhor
      // que perder tudo que ela acabou de escrever.
      if (file) {
        try {
          const form = new FormData()
          form.append('file', file)
          const upload = await api.post(`/timeline/documents/${document.id}/files`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          document = { ...document, files: [...document.files, upload.data.file] }
        } catch (err: any) {
          toast.error(err?.response?.data?.message ?? 'Documento criado, mas o arquivo não subiu. Anexe pelo documento.')
        }
      }

      onCreated(document)
      toast.success('Documento criado')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível criar o documento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {date && (
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
            className="w-full max-w-lg glass-strong rounded-2xl border border-white/16 overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Cabeçalho */}
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-[11px] font-display font-black tracking-[0.25em] text-cyan-400/70 uppercase mb-1">
                Novo documento
              </p>
              <h2 className="font-display text-lg font-black text-white tracking-wide">{prettyDate}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto scrollbar-space">
              {/* Nome */}
              <label className="block">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Nome do documento
                </span>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={180}
                  placeholder="Contrato de prestação de serviço"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space"
                />
              </label>

              {/* Marcar pessoas */}
              <div className="relative">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Marcar pessoas
                </span>

                {mentioned.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {mentioned.map((p) => (
                      <span key={p.id}
                        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10">
                        <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                        <span className="text-xs font-body text-violet-200">{p.name}</span>
                        <button type="button"
                          onClick={() => setMentioned((prev) => prev.filter((x) => x.id !== p.id))}
                          className="text-violet-300/60 hover:text-violet-200 text-xs leading-none"
                          aria-label={`Remover ${p.name}`}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <input
                  value={personQuery}
                  onChange={(e) => { setPersonQuery(e.target.value); setShowPeople(true) }}
                  onFocus={() => setShowPeople(true)}
                  onBlur={() => setTimeout(() => setShowPeople(false), 140)}
                  placeholder="@ digite um nome"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space"
                />

                {showPeople && available.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full mt-1 z-20 glass-strong rounded-xl border border-white/14 p-1 max-h-52 overflow-y-auto scrollbar-space">
                    {available.map((p) => (
                      <li key={p.id}>
                        <button type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setMentioned((prev) => [...prev, p]); setPersonQuery('') }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/6 transition-colors text-left">
                          <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                          <span className="min-w-0">
                            <span className="block text-sm font-body text-white/85 truncate">{p.name}</span>
                            <span className="block text-[10px] font-body text-white/35 truncate">{p.email}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] font-body text-white/30 mt-1">
                  Quem for marcado recebe um aviso no WhatsApp e pode responder aqui.
                </p>
              </div>

              {/* Descrição */}
              <label className="block">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Descrição
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="O que é este documento e o que precisa ser feito com ele"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space resize-none"
                />
              </label>

              {/* Arquivo */}
              <div>
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Arquivo
                </span>
                <input ref={fileInputRef} type="file" className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />

                {file ? (
                  <div className="mt-1.5 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-teal-500/25 bg-teal-500/8">
                    <span className="text-base">📎</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-body text-white/85 truncate">{file.name}</span>
                      <span className="block text-[10px] font-body text-white/40">{formatBytes(file.size)}</span>
                    </span>
                    <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="text-xs text-white/45 hover:text-white/85 transition-colors">
                      remover
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="mt-1.5 w-full px-3 py-3 rounded-xl border border-dashed border-white/16 text-sm font-body text-white/45 hover:border-white/30 hover:text-white/70 transition-all">
                    Escolher arquivo (até 50 MB)
                  </button>
                )}
                <p className="text-[10px] font-body text-white/30 mt-1">
                  O arquivo vai para a pasta do documento no Google Drive. Dá para anexar depois também.
                </p>
              </div>
            </form>

            {/* Rodapé */}
            <div className="px-5 py-4 border-t border-white/8 flex items-center justify-end gap-2.5">
              <button type="button" onClick={onClose} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-body font-bold text-white/55 hover:text-white/85 disabled:opacity-40 transition-colors">
                Cancelar
              </button>
              <motion.button onClick={handleSubmit} disabled={saving}
                whileHover={{ scale: saving ? 1 : 1.03 }} whileTap={{ scale: 0.97 }}
                className="px-4 py-2 rounded-xl border border-neon-violet/55 bg-neon-violet/25 text-white text-sm font-display font-black tracking-wide hover:bg-neon-violet/35 disabled:opacity-40 transition-all">
                {saving ? 'Criando...' : 'Criar documento'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
