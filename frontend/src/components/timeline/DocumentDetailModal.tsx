'use client'
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { TimelineDocument } from '@/types/timeline'

const MAX_FILE_BYTES = 50 * 1024 * 1024

interface Props {
  document: TimelineDocument | null
  onClose: () => void
  onChanged: (document: TimelineDocument) => void
  onDeleted: (documentId: string) => void
}

export function DocumentDetailModal({ document: doc, onClose, onChanged, onDeleted }: Props) {
  const { user } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [replyFor, setReplyFor]   = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editing, setEditing]         = useState(false)
  const [editName, setEditName]       = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!doc) return null

  const isAdmin  = user?.role === 'ADMIN'
  const isAuthor = user?.id === doc.createdBy.id
  // Texto: só quem escreveu (ou admin). Exclusão: só admin.
  const canEdit   = isAdmin || isAuthor
  const canDelete = isAdmin

  const prettyDate = new Date(`${doc.date.slice(0, 10)}T12:00:00`)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  function startEditing() {
    if (!doc) return
    setEditName(doc.name)
    setEditDescription(doc.description ?? '')
    setEditing(true)
  }

  async function saveEdit() {
    if (!doc || savingEdit) return
    if (!editName.trim()) {
      toast.error('O nome não pode ficar vazio')
      return
    }

    setSavingEdit(true)
    try {
      const { data } = await api.patch(`/timeline/documents/${doc.id}`, {
        name:        editName.trim(),
        description: editDescription.trim() || null,
      })
      onChanged(data.document)
      setEditing(false)
      toast.success('Documento atualizado')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível salvar')
    } finally {
      setSavingEdit(false)
    }
  }

  async function removeFile(fileId: string) {
    if (!doc) return
    try {
      const { data } = await api.delete(`/timeline/documents/${doc.id}/files/${fileId}`)
      onChanged(data.document)
      toast.success('Arquivo removido da lista. Ele continua no Drive.')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível remover o arquivo')
    }
  }

  async function uploadFile(file: File) {
    if (!doc) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Arquivo muito grande. O limite é 50 MB.')
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(`/timeline/documents/${doc.id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChanged({ ...doc, files: [...doc.files, data.file] })
      toast.success('Arquivo enviado')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível enviar o arquivo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function sendReply(mentionId: string) {
    if (!replyText.trim()) return
    try {
      const { data } = await api.patch(`/timeline/mentions/${mentionId}/reply`, { reply: replyText.trim() })
      onChanged(data.document)
      setReplyFor(null)
      setReplyText('')
      toast.success('Resposta enviada')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível responder')
    }
  }

  async function handleDelete() {
    if (!doc) return
    try {
      await api.delete(`/timeline/documents/${doc.id}`)
      onDeleted(doc.id)
      toast.success('Documento excluído')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível excluir')
    }
  }

  return (
    <AnimatePresence>
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
              {prettyDate}
            </p>

            {editing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={180}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm font-body input-space"
              />
            ) : (
              <div className="flex items-start gap-2">
                <h2 className="font-display text-lg font-black text-white tracking-wide break-words flex-1">
                  {doc.name}
                </h2>
                {canEdit && (
                  <button
                    onClick={startEditing}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg font-body font-bold border border-white/14 text-white/55 hover:text-white/90 hover:border-white/30 transition-all"
                  >
                    Editar
                  </button>
                )}
              </div>
            )}

            <p className="text-[11px] font-body text-white/40 mt-1">
              criado por {doc.createdBy.name}
              {!canEdit && ' · só quem lançou pode editar o texto'}
            </p>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto scrollbar-space">
            {editing ? (
              <div className="space-y-2">
                <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
                  Descrição
                </span>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  placeholder="Sem descrição"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space resize-none"
                />
                <div className="flex items-center gap-2">
                  <button onClick={saveEdit} disabled={savingEdit}
                    className="text-xs px-3 py-1.5 rounded-lg font-body font-bold border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/12 disabled:opacity-40 transition-all">
                    {savingEdit ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                  <button onClick={() => setEditing(false)} disabled={savingEdit}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-body text-white/45 hover:text-white/80 disabled:opacity-40 transition-colors">
                    cancelar
                  </button>
                </div>
                <p className="text-[10px] font-body text-white/30">
                  Renomear também renomeia a pasta no Drive. Nenhum arquivo é perdido.
                </p>
              </div>
            ) : doc.description ? (
              <p className="text-sm font-body text-white/70 leading-relaxed whitespace-pre-wrap">
                {doc.description}
              </p>
            ) : null}

            {doc.driveFolderUrl && (
              <a href={doc.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-cyan-500/25 bg-cyan-500/8 text-sm font-body text-cyan-300 hover:bg-cyan-500/14 transition-colors">
                📁 Abrir pasta no Google Drive
              </a>
            )}

            {/* Arquivos */}
            <section>
              <h3 className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase mb-2">
                Arquivos ({doc.files.length})
              </h3>

              {doc.files.length > 0 ? (
                <ul className="space-y-1.5 mb-2">
                  {doc.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5">
                      <a href={f.driveFileUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/8 bg-white/3 hover:bg-white/7 transition-colors flex-1 min-w-0">
                        <span className="text-sm">📎</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-body text-white/85 truncate">{f.originalName}</span>
                          <span className="block text-[10px] font-body text-white/35">
                            {formatBytes(f.sizeBytes)} · {f.uploadedBy.name}
                          </span>
                        </span>
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => removeFile(f.id)}
                          title="Tirar da lista (o arquivo continua no Drive)"
                          className="shrink-0 px-2 py-2 rounded-lg text-white/30 hover:text-red-300 hover:bg-red-500/8 transition-all text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-body text-white/35 mb-2">Nenhum arquivo ainda.</p>
              )}

              <input ref={fileInputRef} type="file" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full text-xs px-3 py-2 rounded-lg font-body font-bold border border-teal-500/25 text-teal-300/90 hover:border-teal-500/50 hover:bg-teal-500/10 disabled:opacity-40 transition-all">
                {uploading ? 'Enviando...' : '+ Anexar arquivo'}
              </button>
            </section>

            {/* Marcações */}
            {doc.mentions.length > 0 && (
              <section>
                <h3 className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase mb-2">
                  Pessoas marcadas
                </h3>
                <ul className="space-y-2">
                  {doc.mentions.map((m) => {
                    const isMine = user?.id === m.mentionedUser.id
                    const canReply = !m.reply && (isMine || user?.role === 'ADMIN')

                    return (
                      <li key={m.id} className="px-3 py-2.5 rounded-xl border border-white/8 bg-white/3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.mentionedUser.name} src={m.mentionedUser.avatarUrl} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-body font-semibold text-white/85 truncate">
                              {m.mentionedUser.name}
                            </span>
                            <span className="block text-[10px] font-body text-white/35">
                              marcado por {m.mentionedBy.name}
                            </span>
                          </span>
                          {m.reply
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-emerald-500/30 text-emerald-300 font-body font-bold">respondeu</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-amber-500/30 text-amber-300 font-body font-bold">aguardando</span>}
                        </div>

                        {m.reply && (
                          <p className="mt-2 pl-8 text-sm font-body text-white/70 leading-relaxed whitespace-pre-wrap">
                            {m.reply}
                          </p>
                        )}

                        {canReply && (
                          replyFor === m.id ? (
                            <div className="mt-2 pl-8 space-y-1.5">
                              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)}
                                rows={2} autoFocus placeholder="Sua resposta"
                                className="w-full px-3 py-2 rounded-xl text-sm font-body input-space resize-none" />
                              <div className="flex gap-2">
                                <button onClick={() => sendReply(m.id)}
                                  className="text-xs px-3 py-1.5 rounded-lg font-body font-bold border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/12 transition-all">
                                  Responder
                                </button>
                                <button onClick={() => { setReplyFor(null); setReplyText('') }}
                                  className="text-xs px-2.5 py-1.5 rounded-lg font-body text-white/45 hover:text-white/80 transition-colors">
                                  cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setReplyFor(m.id); setReplyText('') }}
                              className="mt-2 ml-8 text-xs px-2.5 py-1 rounded-lg font-body font-bold border border-white/14 text-white/55 hover:text-white/85 hover:border-white/28 transition-all">
                              Responder
                            </button>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* Rodapé */}
          <div className="px-5 py-4 border-t border-white/8 flex items-center gap-2.5">
            {canDelete && (
              confirmDelete ? (
                <span className="flex items-center gap-2 mr-auto">
                  <span className="text-xs font-body text-white/60">
                    Tirar da linha do tempo? A pasta e os arquivos continuam no Drive.
                  </span>
                  <button onClick={handleDelete}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-body font-bold border border-red-500/40 text-red-300 hover:bg-red-500/12 transition-all whitespace-nowrap">
                    Sim, excluir
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-1.5 rounded-lg font-body text-white/45 hover:text-white/80 transition-colors">
                    não
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="mr-auto text-xs px-2.5 py-1.5 rounded-lg font-body font-bold text-red-300/70 hover:text-red-300 hover:bg-red-500/8 transition-all">
                  Excluir documento
                </button>
              )
            )}
            <button onClick={onClose}
              className="ml-auto px-4 py-2 rounded-xl text-sm font-body font-bold text-white/60 hover:text-white/90 transition-colors">
              Fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
