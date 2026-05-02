'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useBoardStore } from '@/stores/boardStore'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatDeadline, getPriorityIcon, getPriorityLabel, isOverdue, formatBytes } from '@/lib/utils'
import { RichTextEditor } from '../sections/RichTextEditor'
import toast from 'react-hot-toast'

interface CardDetailModalProps {
  cardId: string
  onClose: () => void
  onArchived?: () => void
}

export function CardDetailModal({ cardId, onClose, onArchived }: CardDetailModalProps) {
  const { user }                            = useAuthStore()
  const { archiveCard }                     = useBoardStore()
  const [card, setCard]                     = useState<any>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [savingSection, setSavingSection]   = useState<string | null>(null)
  const [editingMentionId, setEditingMentionId] = useState<string | null>(null)
  const [savingReply, setSavingReply]           = useState<string | null>(null)
  const [editMode, setEditMode]             = useState(false)
  const [editTitle, setEditTitle]           = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority]     = useState('MEDIUM')
  const [editTags, setEditTags]             = useState('')
  const [editDeadline, setEditDeadline]     = useState('')
  const [savingCard, setSavingCard]         = useState(false)
  const [confirmAbort, setConfirmAbort]         = useState(false)
  const [aborting, setAborting]                 = useState(false)
  const [confirmDeleteSectionId, setConfirmDeleteSectionId] = useState<string | null>(null)
  const [deletingSection, setDeletingSection]   = useState(false)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    api.get(`/cards/${cardId}`)
      .then(({ data }) => setCard(data.card))
      .catch(() => toast.error('Erro ao carregar card'))
      .finally(() => setIsLoading(false))
  }, [cardId])

  function openEditMode() {
    if (!card) return
    setEditTitle(card.title)
    setEditDescription(card.description ?? '')
    setEditPriority(card.priority ?? 'MEDIUM')
    setEditTags((card.tags ?? []).join(', '))
    setEditDeadline(card.deadline ? card.deadline.substring(0, 16) : '')
    setEditMode(true)
  }

  async function saveCard() {
    setSavingCard(true)
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean)
      await api.patch(`/cards/${cardId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        tags,
        deadline: editDeadline || null,
      })
      const { data } = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      setEditMode(false)
      toast.success('Card atualizado ✨')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar card')
    } finally {
      setSavingCard(false)
    }
  }

  async function abortMission() {
    setAborting(true)
    try {
      await archiveCard(cardId)
      toast.success('Missão abortada 🚫')
      onArchived?.()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao abortar missão')
      setAborting(false)
      setConfirmAbort(false)
    }
  }

  // Check if the current user is the owner of a section OR is an admin
  function canEditSection(section: any): boolean {
    if (!user) return false
    if (user.role === 'ADMIN') return true
    return section.ownerId === user.id
  }

  async function deleteSection(sectionId: string) {
    setDeletingSection(true)
    try {
      await api.delete(`/sections/${sectionId}`)
      const { data } = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      toast.success('Seção excluída ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao excluir seção')
    } finally {
      setDeletingSection(false)
      setConfirmDeleteSectionId(null)
    }
  }

  async function saveSection(sectionId: string, content: Record<string, unknown>) {
    setSavingSection(sectionId)
    try {
      await api.patch(`/sections/${sectionId}`, { content })
      toast.success('Seção salva ✨')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingSection(null) }
  }

  async function uploadFile(sectionId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post(`/sections/${sectionId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const { data } = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      toast.success('Arquivo enviado 📎')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro no upload')
    }
  }

  async function downloadFile(file: any) {
    try {
      // If there's a direct URL use it, otherwise request presigned
      const url = file.url ?? `/sections/files/${file.id}/download`
      const link = document.createElement('a')
      link.href = url
      link.download = file.originalName
      link.target = '_blank'
      link.click()
    } catch {
      toast.error('Erro ao baixar arquivo')
    }
  }

  async function saveReply(mentionId: string, content: Record<string, unknown>) {
    setSavingReply(mentionId)
    try {
      await api.patch(`/mentions/${mentionId}/reply`, { content })
      // Re-fetch card to pick up the reply + any new mentions created
      const { data } = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      setEditingMentionId(null)
      toast.success('Resposta enviada ✓')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao enviar resposta')
    } finally {
      setSavingReply(null)
    }
  }

  async function deleteFile(sectionId: string, fileId: string) {
    try {
      await api.delete(`/sections/${sectionId}/files/${fileId}`)
      const { data } = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      toast.success('Arquivo removido')
    } catch {
      toast.error('Erro ao remover arquivo')
    }
  }

  const overdue = card?.deadline ? isOverdue(card.deadline) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full max-w-2xl max-h-[90vh] glass rounded-2xl overflow-hidden flex flex-col shadow-glass"
      >
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-neon-violet/50 to-transparent" />

        {/* Loading */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-4xl">
              🛸
            </motion.div>
          </div>
        )}

        {card && (
          <>
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-white/8">
              {/* Edit form — Admin only */}
              {editMode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-display font-black text-white/60 tracking-widest uppercase">✏️ Editando Card</span>
                    <button onClick={() => setEditMode(false)} className="text-white/35 hover:text-white/80 text-xl">✕</button>
                  </div>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Título" className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Descrição (opcional)" rows={2}
                    className="w-full px-3 py-2 rounded-xl text-sm font-body input-space resize-none" />
                  <div className="flex gap-2">
                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-body input-space">
                      <option value="LOW">🟢 Baixa</option>
                      <option value="MEDIUM">🟡 Média</option>
                      <option value="HIGH">🔴 Alta</option>
                      <option value="CRITICAL">🚨 Crítica</option>
                    </select>
                    <input type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-body input-space" />
                  </div>
                  <input value={editTags} onChange={(e) => setEditTags(e.target.value)}
                    placeholder="Tags (separadas por vírgula)" className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditMode(false)}
                      className="flex-1 py-2 rounded-xl text-sm font-body border border-white/15 text-white/60 hover:bg-white/5 transition-all">
                      Cancelar
                    </button>
                    <button onClick={saveCard} disabled={savingCard || !editTitle.trim()}
                      className="flex-[2] py-2 rounded-xl text-sm font-display font-black text-white disabled:opacity-40 transition-all"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                      {savingCard ? '⚡ Salvando...' : '✅ Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn('text-xs px-2.5 py-1 rounded-lg border font-body font-bold', `priority-${card.priority}`)}>
                      {getPriorityIcon(card.priority)} {getPriorityLabel(card.priority)}
                    </span>
                    {overdue && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-red-500/18 border border-red-500/40 text-red-300 font-body font-bold animate-pulse">
                        ⚠️ ATRASADO
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-lg font-bold text-white tracking-wide leading-snug">
                    {card.title}
                  </h2>
                  {card.description && (
                    <p className="text-sm text-white/70 font-body font-medium mt-1 leading-relaxed">{card.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isAdmin && !confirmAbort && (
                    <button onClick={openEditMode} title="Editar card"
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-white/40 border border-white/10 hover:text-white hover:border-neon-violet/50 hover:bg-neon-violet/15 transition-all text-xs">
                      ✏️
                    </button>
                  )}

                  {/* Compartilhar — visível para todos */}
                  {!confirmAbort && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/board/${card.board?.id}?card=${cardId}`
                        navigator.clipboard.writeText(url)
                        toast.success('Link copiado! 🔗 Cole no WhatsApp para compartilhar.')
                      }}
                      title="Copiar link do card"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-display font-black tracking-wide text-cyan-400/80 border border-cyan-500/25 hover:text-cyan-300 hover:border-cyan-500/55 hover:bg-cyan-500/10 transition-all">
                      🔗 Compartilhar
                    </button>
                  )}

                  {isAdmin && !confirmAbort && (
                    <button onClick={() => setConfirmAbort(true)} title="Abortar missão"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-display font-black tracking-wide text-red-400/70 border border-red-500/20 hover:text-red-300 hover:border-red-500/50 hover:bg-red-500/10 transition-all">
                      🚫 Abortar
                    </button>
                  )}
                  {isAdmin && confirmAbort && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-red-500/40 bg-red-950/40">
                      <span className="text-[11px] text-red-300 font-display font-black">Confirmar?</span>
                      <button
                        onClick={abortMission}
                        disabled={aborting}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-red-600/70 hover:bg-red-600 text-white font-display font-black disabled:opacity-40 transition-all"
                      >
                        {aborting ? '⏳' : 'Sim'}
                      </button>
                      <button
                        onClick={() => setConfirmAbort(false)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-white/15 text-white/50 hover:text-white/80 font-body transition-all"
                      >
                        Não
                      </button>
                    </div>
                  )}
                  <button onClick={onClose} className="text-white/35 hover:text-white/80 transition-colors text-xl mt-0.5">✕</button>
                </div>
              </div>
              )}

              {/* Meta */}
              <div className="flex items-center flex-wrap gap-2 mt-3">
                {card.deadline && (
                  <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-body font-semibold',
                    overdue ? 'text-red-300 bg-red-500/12 border-red-500/30' : 'text-white/70 bg-white/5 border-white/12')}>
                    <span>⏱</span><span>{formatDeadline(card.deadline)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-white/65 font-body font-semibold">
                  <span>📋</span><span>{card.board?.title}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/65 font-body font-semibold">
                  <span>📂</span><span>{card.currentColumn?.title}</span>
                </div>
                {card.tags?.map((tag: string) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-neon-violet/14 border border-neon-violet/28 text-violet-300 font-body font-semibold">
                    {tag}
                  </span>
                ))}
              </div>

            </div>

            {/* RECURSOS — destaque para todos os usuários */}
            {card.resourcesFolderUrl && (
              <div className="px-6 pb-3">
                <a
                  href={card.resourcesFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all group"
                  style={{
                    background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.06))',
                    border: '1px solid rgba(234,179,8,0.35)',
                  }}
                >
                  <span className="text-xl shrink-0">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-black tracking-widest text-yellow-300 uppercase">
                      Recursos
                    </p>
                    <p className="text-[11px] text-yellow-200/45 font-body mt-0.5">
                      Pasta compartilhada com materiais de apoio desta missão →
                    </p>
                  </div>
                  <span className="text-yellow-400/40 group-hover:text-yellow-300 group-hover:translate-x-0.5 transition-all text-lg">→</span>
                </a>
              </div>
            )}

            {/* Sections */}
            <div className="flex-1 overflow-y-auto scrollbar-space px-6 py-5 space-y-7">
              {card.sections?.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🌌</div>
                  <p className="text-sm text-white/40 font-body font-semibold">
                    Nenhuma seção ainda.<br />Mova o card para uma coluna para criar seções.
                  </p>
                </div>
              )}

              {card.sections?.map((section: any, index: number) => {
                const isOwner    = canEditSection(section)
                const ownerUser  = section.owner
                const prevSection = index > 0 ? card.sections[index - 1] : null

                return (
                  <div key={section.id} className="space-y-3">
                    {/* Section header */}
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${section.column.color}70, transparent)` }} />
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: section.column.color + '40', background: section.column.color + '14' }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: section.column.color }} />
                        <span className="text-xs font-display font-bold tracking-wide text-white">{section.column.title}</span>
                        <span className="text-white/40 text-xs">—</span>
                        <Avatar name={ownerUser.name} src={ownerUser.avatarUrl} size="xs" />
                        <span className="text-xs text-white/70 font-body font-semibold">{ownerUser.name}</span>
                      </div>
                      <div className="h-px flex-1 bg-white/6" />

                      {/* Ownership badge */}
                      {isOwner ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-neon-violet/18 border border-neon-violet/35 text-violet-300 font-display font-black tracking-wide">
                          ✏️ SEU CAMPO
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/6 border border-white/12 text-white/40 font-body font-semibold">
                          🔒 somente leitura
                        </span>
                      )}

                      {/* Admin: excluir seção — bloqueado se for a etapa atual do card */}
                      {isAdmin && section.column.id !== card.currentColumn?.id && confirmDeleteSectionId !== section.id && (
                        <button
                          onClick={() => setConfirmDeleteSectionId(section.id)}
                          title="Excluir seção (Admin)"
                          className="text-white/20 hover:text-red-400 transition-colors text-sm ml-1"
                        >
                          🗑
                        </button>
                      )}
                      {isAdmin && section.column.id !== card.currentColumn?.id && confirmDeleteSectionId === section.id && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-red-500/40 bg-red-950/40 ml-1">
                          <span className="text-[10px] text-red-300 font-display font-black">Excluir?</span>
                          <button
                            onClick={() => deleteSection(section.id)}
                            disabled={deletingSection}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/70 hover:bg-red-600 text-white font-display font-black disabled:opacity-40 transition-all"
                          >
                            {deletingSection ? '⏳' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteSectionId(null)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/50 hover:text-white/80 font-body transition-all"
                          >
                            Não
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Drive: buscar arquivo da etapa anterior */}
                    {prevSection?.driveFolderUrl && (
                      <DriveLink
                        url={prevSection.driveFolderUrl}
                        label={`Buscar arquivo — ${prevSection.owner.name} (${prevSection.column.title})`}
                        icon="📁"
                        variant="get"
                      />
                    )}

                    {/* Rich text editor — locked if not owner */}
                    <div className={cn(
                      'rounded-xl border p-3 transition-all',
                      isOwner
                        ? 'bg-white/5 border-white/10'
                        : 'bg-white/2 border-white/6 opacity-80',
                    )}>
                      {!isOwner && (
                        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/8">
                          <span className="text-xs">🔒</span>
                          <span className="text-[11px] text-white/45 font-body font-semibold">
                            Apenas <strong className="text-white/70">{ownerUser.name}</strong> pode editar este campo
                          </span>
                        </div>
                      )}
                      <RichTextEditor
                        content={section.content}
                        onSave={(content) => saveSection(section.id, content)}
                        isSaving={savingSection === section.id}
                        placeholder={isOwner ? `Escreva aqui suas atualizações...` : `Conteúdo de ${ownerUser.name}`}
                        readOnly={!isOwner}
                      />
                    </div>

                    {/* Drive: depositar arquivo nesta etapa */}
                    {section.driveFolderUrl && (
                      <DriveLink
                        url={section.driveFolderUrl}
                        label={`Depositar arquivo — ${ownerUser.name} (${section.column.title})`}
                        icon="📤"
                        variant="deposit"
                      />
                    )}

                    {/* Files */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/55 font-body font-bold uppercase tracking-widest">
                          📎 Arquivos ({section.files?.length ?? 0})
                        </span>
                        {/* Only owner can upload — anyone can download */}
                        {isOwner && (
                          <label className="text-xs text-neon-cyan/80 hover:text-neon-cyan cursor-pointer font-body font-bold transition-colors">
                            + Anexar arquivo
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(section.id, f) }} />
                          </label>
                        )}
                      </div>

                      {section.files?.length > 0 && (
                        <div className="space-y-1.5">
                          {section.files.map((file: any) => (
                            <div key={file.id}
                              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/4 border border-white/10 group hover:bg-white/7 hover:border-white/16 transition-all"
                            >
                              <span className="text-lg shrink-0">{getFileIcon(file.mimeType)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-body font-semibold text-white/90 truncate">{file.originalName}</div>
                                <div className="text-[10px] text-white/45 font-mono">{formatBytes(file.sizeBytes)}</div>
                              </div>

                              {/* Download — available to ALL */}
                              <button
                                onClick={() => downloadFile(file)}
                                title="Baixar arquivo"
                                className="text-xs px-2 py-1 rounded-lg border border-white/14 text-white/55 hover:text-neon-cyan hover:border-neon-cyan/40 hover:bg-neon-cyan/8 transition-all font-body font-bold"
                              >
                                ⬇ Baixar
                              </button>

                              {/* Delete — only owner */}
                              {isOwner && (
                                <button
                                  onClick={() => deleteFile(section.id, file.id)}
                                  title="Remover arquivo"
                                  className="text-white/25 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm ml-0.5"
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.files?.length === 0 && (
                        <p className="text-xs text-white/25 font-body font-semibold italic px-1">
                          {isOwner ? 'Nenhum arquivo anexado ainda' : 'Sem arquivos nesta seção'}
                        </p>
                      )}
                    </div>

                    {/* Mention replies ─────────────────────────── */}
                    {section.mentions?.map((mention: any) => {
                      const isMyMention  = mention.mentionedUserId === user?.id
                      const isAdminUser  = user?.role === 'ADMIN'
                      if (!isMyMention && !isAdminUser) return null

                      const hasReply  = !!mention.reply
                      const isEditing = editingMentionId === mention.id
                      const canReply  = (isMyMention || isAdminUser) && (!hasReply || isEditing)
                      const canEdit   = hasReply && !isEditing && (isAdminUser || mention.repliedById === user?.id)

                      return (
                        /* Indented thread — visually distinct from section content */
                        <div key={mention.id}
                          className="ml-5 pl-4 border-l-2 border-neon-cyan/25 space-y-3"
                        >
                          {/* Thread header */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm">💬</span>
                            <span className="text-xs text-white/55 font-body font-semibold">
                              <strong className="text-neon-cyan/80">{mention.mentionedBy?.name}</strong>
                              {' '}mencionou{' '}
                              <strong className="text-white/85">{mention.mentionedUser?.name}</strong>
                            </span>
                          </div>

                          {/* Existing reply (read-only) */}
                          {hasReply && !isEditing && (
                            <div className="rounded-xl border border-white/10 bg-white/4 p-3 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Avatar name={mention.repliedBy?.name} src={mention.repliedBy?.avatarUrl} size="xs" />
                                <span className="text-[11px] text-white/60 font-body font-semibold">
                                  {mention.repliedBy?.name}
                                </span>
                                {mention.repliedAt && (
                                  <span className="text-[10px] text-white/28 font-mono ml-auto">
                                    {new Date(mention.repliedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              {mention.replyContent ? (
                                <RichTextEditor
                                  content={mention.replyContent}
                                  onSave={async () => {}}
                                  readOnly={true}
                                />
                              ) : (
                                <p className="text-sm text-white/80 font-body leading-relaxed whitespace-pre-wrap">
                                  {mention.reply}
                                </p>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => setEditingMentionId(mention.id)}
                                  className="text-[11px] text-white/30 hover:text-neon-cyan/60 transition-colors font-body font-semibold"
                                >
                                  ✏️ Editar resposta
                                </button>
                              )}
                            </div>
                          )}

                          {/* Reply / Edit composer */}
                          {canReply && (
                            <div className="rounded-xl border border-neon-cyan/20 bg-neon-cyan/4 p-3 space-y-1.5">
                              <p className="text-[11px] text-neon-cyan/65 font-body font-bold tracking-wide">
                                ✍️ {hasReply ? 'Editar resposta' : 'Sua resposta'} · use @ para mencionar
                              </p>
                              <RichTextEditor
                                content={isEditing ? (mention.replyContent ?? null) : null}
                                onSave={(content) => saveReply(mention.id, content)}
                                isSaving={savingReply === mention.id}
                                placeholder="Escreva sua resposta... use @ para mencionar alguém"
                                readOnly={false}
                              />
                              {isEditing && (
                                <button
                                  onClick={() => setEditingMentionId(null)}
                                  className="text-[11px] text-white/35 hover:text-white/65 transition-colors font-body font-semibold"
                                >
                                  Cancelar edição
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.startsWith('image/')) return '🖼️'
  return '📎'
}

function DriveLink({ url, label, icon, variant }: {
  url: string; label: string; icon: string; variant: 'get' | 'deposit'
}) {
  const isGet = variant === 'get'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl w-full transition-all',
        isGet
          ? 'border border-blue-500/30 hover:border-blue-400/55 bg-blue-500/8 hover:bg-blue-500/15'
          : 'border border-emerald-500/30 hover:border-emerald-400/55 bg-emerald-500/8 hover:bg-emerald-500/15',
      )}
    >
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-display font-semibold truncate', isGet ? 'text-blue-300' : 'text-emerald-300')}>
          {label}
        </p>
        <p className="text-[11px] text-white/30 font-body mt-0.5">
          {isGet ? 'Abrir pasta para buscar arquivo →' : 'Abrir pasta para depositar arquivo →'}
        </p>
      </div>
    </a>
  )
}

