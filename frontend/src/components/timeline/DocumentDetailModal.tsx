'use client'
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { TimelineDocument, TimelineApproval } from '@/types/timeline'

const MAX_FILE_BYTES = 50 * 1024 * 1024

const APPROVAL_BADGE: Record<TimelineApproval, { label: string; verb: string; color: string }> = {
  PENDING:  { label: '⏳ aguardando', verb: 'solicitado',  color: 'border-amber-500/30 text-amber-300'     },
  APPROVED: { label: '✓ aprovou',     verb: 'aprovou',     color: 'border-emerald-500/30 text-emerald-300' },
  REJECTED: { label: '✕ reprovou',    verb: 'reprovou',    color: 'border-red-500/35 text-red-300'         },
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

interface Props {
  document: TimelineDocument | null
  onClose: () => void
  onChanged: (document: TimelineDocument) => void
  onDeleted: (documentId: string) => void
}

export function DocumentDetailModal({ document: doc, onClose, onChanged, onDeleted }: Props) {
  const { user } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [decidingFor, setDecidingFor]         = useState<string | null>(null)
  const [decisionComment, setDecisionComment] = useState('')
  const [savingDecision, setSavingDecision]   = useState(false)
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

  // Dois papéis distintos: quem assina e quem só foi avisado.
  const approvers = doc.mentions.filter((m) => m.isApprover)
  const cited     = doc.mentions.filter((m) => !m.isApprover)

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

  /**
   * Envia vários arquivos, um de cada vez — a Drive API não faz lote.
   *
   * Falha em um não descarta os outros: os que subiram ficam, e a pessoa é
   * avisada de quais não foram, em vez de perder tudo.
   */
  async function uploadFiles(selected: File[]) {
    if (!doc || selected.length === 0) return

    const tooBig = selected.filter((f) => f.size > MAX_FILE_BYTES)
    const toSend = selected.filter((f) => f.size <= MAX_FILE_BYTES)
    if (tooBig.length > 0) {
      toast.error(`${tooBig.map((f) => f.name).join(', ')}: acima de 50 MB`)
    }
    if (toSend.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    const uploaded: TimelineDocument['files'] = []
    const failed: string[] = []

    for (let i = 0; i < toSend.length; i++) {
      setUploadProgress({ done: i, total: toSend.length })
      try {
        const form = new FormData()
        form.append('file', toSend[i])
        const { data } = await api.post(`/timeline/documents/${doc.id}/files`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploaded.push(data.file)
      } catch {
        failed.push(toSend[i].name)
      }
    }

    if (uploaded.length > 0) onChanged({ ...doc, files: [...doc.files, ...uploaded] })

    if (failed.length === 0) {
      toast.success(uploaded.length === 1 ? 'Arquivo enviado' : `${uploaded.length} arquivos enviados`)
    } else if (uploaded.length === 0) {
      toast.error('Nenhum arquivo foi enviado. Tente de novo.')
    } else {
      toast.error(`${uploaded.length} enviado(s). Falhou: ${failed.join(', ')}`)
    }

    setUploading(false)
    setUploadProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function decide(mentionId: string, approval: 'APPROVED' | 'REJECTED') {
    const comment = decisionComment.trim()

    // Espelha a regra do backend para a pessoa saber antes de enviar.
    if (approval === 'REJECTED' && !comment) {
      toast.error('Explique o motivo ao reprovar')
      return
    }

    setSavingDecision(true)
    try {
      const { data } = await api.patch(`/timeline/mentions/${mentionId}/approval`, {
        approval,
        comment: comment || undefined,
      })
      onChanged(data.document)
      setDecidingFor(null)
      setDecisionComment('')
      toast.success(approval === 'APPROVED' ? 'Documento aprovado' : 'Documento reprovado')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível registrar a decisão')
    } finally {
      setSavingDecision(false)
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

              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full text-xs px-3 py-2 rounded-lg font-body font-bold border border-teal-500/25 text-teal-300/90 hover:border-teal-500/50 hover:bg-teal-500/10 disabled:opacity-40 transition-all">
                {uploading
                  ? uploadProgress
                    ? `Enviando ${uploadProgress.done + 1} de ${uploadProgress.total}...`
                    : 'Enviando...'
                  : '+ Anexar arquivos'}
              </button>
            </section>

            {/* Citados: só ciência, sem botão nenhum */}
            {cited.length > 0 && (
              <section>
                <h3 className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase mb-2">
                  Citados
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {cited.map((m) => (
                    <li key={m.id}
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border border-cyan-500/25 bg-cyan-500/8">
                      <Avatar name={m.mentionedUser.name} src={m.mentionedUser.avatarUrl} size="xs" />
                      <span className="text-xs font-body text-cyan-200">
                        {m.mentionedUser.name}
                        {user?.id === m.mentionedUser.id && <span className="text-cyan-300/50"> (você)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] font-body text-white/30 mt-1.5">
                  Foram avisados para tomar ciência. Não precisam aprovar nada.
                </p>
              </section>
            )}

            {/* Aprovações */}
            {approvers.length > 0 && (
              <section>
                <h3 className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase mb-2">
                  Aprovações
                  <span className="ml-1.5 text-white/25 font-body font-normal normal-case tracking-normal">
                    · {approvers.filter((m) => m.approval !== 'PENDING').length} de {approvers.length} decidiram
                  </span>
                </h3>
                <ul className="space-y-2">
                  {approvers.map((m) => {
                    const isMine = user?.id === m.mentionedUser.id
                    // Aprovação é assinatura: só a própria pessoa assina.
                    // Nem o admin decide no lugar dela.
                    const canDecide = isMine
                    const badge = APPROVAL_BADGE[m.approval]

                    return (
                      <li key={m.id} className="px-3 py-2.5 rounded-xl border border-white/8 bg-white/3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.mentionedUser.name} src={m.mentionedUser.avatarUrl} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-body font-semibold text-white/85 truncate">
                              {m.mentionedUser.name}
                              {isMine && <span className="text-white/35 font-normal"> (você)</span>}
                            </span>
                            <span className="block text-[10px] font-body text-white/35">
                              {m.decidedAt
                                ? `${badge.verb} em ${formatDateTime(m.decidedAt)}`
                                : `solicitado por ${m.mentionedBy.name}`}
                            </span>
                          </span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-md border font-body font-bold whitespace-nowrap',
                            badge.color,
                          )}>
                            {badge.label}
                          </span>
                        </div>

                        {m.reply && (
                          <p className="mt-2 pl-8 text-sm font-body text-white/70 leading-relaxed whitespace-pre-wrap">
                            {m.reply}
                          </p>
                        )}

                        {canDecide && (
                          decidingFor === m.id ? (
                            <div className="mt-2 pl-8 space-y-1.5">
                              <textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)}
                                rows={2} autoFocus
                                placeholder="Comentário (obrigatório ao reprovar)"
                                className="w-full px-3 py-2 rounded-xl text-sm font-body input-space resize-none" />
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => decide(m.id, 'APPROVED')} disabled={savingDecision}
                                  className="text-xs px-3 py-1.5 rounded-lg font-body font-bold border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/12 disabled:opacity-40 transition-all">
                                  ✓ Aprovar
                                </button>
                                <button onClick={() => decide(m.id, 'REJECTED')} disabled={savingDecision}
                                  className="text-xs px-3 py-1.5 rounded-lg font-body font-bold border border-red-500/35 text-red-300 hover:bg-red-500/12 disabled:opacity-40 transition-all">
                                  ✕ Reprovar
                                </button>
                                <button onClick={() => { setDecidingFor(null); setDecisionComment('') }}
                                  className="text-xs px-2.5 py-1.5 rounded-lg font-body text-white/45 hover:text-white/80 transition-colors">
                                  cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setDecidingFor(m.id); setDecisionComment(m.reply ?? '') }}
                              className="mt-2 ml-8 text-xs px-2.5 py-1 rounded-lg font-body font-bold border border-white/14 text-white/55 hover:text-white/85 hover:border-white/28 transition-all">
                              {m.approval === 'PENDING' ? 'Aprovar ou reprovar' : 'Mudar decisão'}
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
