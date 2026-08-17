'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { PersonPicker } from './PersonPicker'
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
  useEscapeToClose(!!date, onClose)
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [mentioned, setMentioned]     = useState<TimelinePerson[]>([])
  const [approvers, setApprovers]     = useState<TimelinePerson[]>([])
  const [files, setFiles]             = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [saving, setSaving]           = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (date) {
      setName(''); setDescription(''); setMentioned([]); setApprovers([])
      setFiles([]); setUploadProgress(null)
      // Foca o primeiro campo assim que abre — quem clicou numa data já sabe
      // o que quer escrever.
      setTimeout(() => nameInputRef.current?.focus(), 80)
    }
  }, [date])

  const prettyDate = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : ''

  function pickFiles(selected: File[]) {
    const tooBig = selected.filter((f) => f.size > MAX_FILE_BYTES)
    if (tooBig.length > 0) {
      toast.error(`${tooBig.map((f) => f.name).join(', ')}: acima de 50 MB`)
    }
    // Acumula em vez de substituir: dá para escolher em várias levas.
    setFiles((prev) => [...prev, ...selected.filter((f) => f.size <= MAX_FILE_BYTES)])
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
        approverIds:      approvers.map((p) => p.id),
        mentionIds:       mentioned.map((p) => p.id),
      })

      let document: TimelineDocument = data.document

      // O documento já existe neste ponto. Se um upload falhar, o registro e os
      // arquivos que subiram ficam de pé, e a pessoa anexa o resto depois pela
      // tela de detalhe — melhor que perder tudo que ela acabou de escrever.
      const failed: string[] = []
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ done: i, total: files.length })
        try {
          const form = new FormData()
          form.append('file', files[i])
          const upload = await api.post(`/timeline/documents/${document.id}/files`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          document = { ...document, files: [...document.files, upload.data.file] }
        } catch {
          failed.push(files[i].name)
        }
      }
      setUploadProgress(null)

      if (failed.length > 0) {
        toast.error(`Documento criado, mas não subiu: ${failed.join(', ')}. Anexe pelo documento.`)
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
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
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

              {/* Citar: só chama a atenção */}
              <PersonPicker
                label="Citar pessoas"
                placeholder="@ digite um nome"
                hint="Recebem um aviso no WhatsApp para tomar ciência. Nada é cobrado delas."
                people={people}
                selected={mentioned}
                onChange={setMentioned}
                excludeIds={approvers.map((p) => p.id)}
                tone="cyan"
              />

              {/* Pedir aprovação: assina */}
              <PersonPicker
                label="Pedir aprovação de"
                placeholder="@ digite um nome"
                hint="Recebem um pedido de aprovação e assinam aqui, aprovando ou reprovando. A decisão fica registrada, mas não bloqueia nada."
                people={people}
                selected={approvers}
                onChange={setApprovers}
                excludeIds={mentioned.map((p) => p.id)}
                tone="violet"
              />

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

              {/* Arquivos */}
              <div>
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Arquivos
                  {files.length > 0 && (
                    <span className="ml-1.5 text-white/25 font-body font-normal normal-case tracking-normal">
                      · {files.length} selecionado{files.length > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={(e) => {
                    pickFiles(Array.from(e.target.files ?? []))
                    // Limpa para permitir escolher o mesmo arquivo de novo.
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }} />

                {files.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-teal-500/25 bg-teal-500/8">
                        <span className="text-sm">📎</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-body text-white/85 truncate">{f.name}</span>
                          <span className="block text-[10px] font-body text-white/40">{formatBytes(f.size)}</span>
                        </span>
                        <button type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label={`Remover ${f.name}`}
                          className="shrink-0 text-xs text-white/45 hover:text-white/85 transition-colors">
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 w-full px-3 py-3 rounded-xl border border-dashed border-white/16 text-sm font-body text-white/45 hover:border-white/30 hover:text-white/70 transition-all">
                  {files.length > 0 ? '+ Escolher mais arquivos' : 'Escolher arquivos (até 50 MB cada)'}
                </button>
                <p className="text-[10px] font-body text-white/30 mt-1">
                  Os arquivos vão para a pasta do documento no Google Drive. Dá para anexar mais depois.
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
                {saving
                  ? uploadProgress
                    ? `Enviando ${uploadProgress.done + 1} de ${uploadProgress.total}...`
                    : 'Criando...'
                  : 'Criar documento'}
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
