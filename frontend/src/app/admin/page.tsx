'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/ui/Navbar'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatRelativeDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ImportCSVModal } from '@/components/admin/ImportCSVModal'

interface User {
  id: string; name: string; email: string; role: string
  isActive: boolean; phoneWhatsapp?: string
  lastAccessAt?: string; lastCommentAt?: string; lastCommentText?: string
  _count: { createdCards: number; accessLogs: number }
}
interface Stats {
  counts: { totalUsers: number; activeUsers: number; totalBoards: number; totalCards: number; overdueCards: number }
  recentLogins: Array<{ id: string; createdAt: string; user: { id: string; name: string; email: string } }>
}
interface Log {
  id: string; action: string; ipAddress?: string; userAgent?: string; createdAt: string
  metadata?: Record<string, any>
  user: { id: string; name: string; email: string; avatarUrl?: string }
}
interface UserFile {
  id: string; originalName: string; mimeType: string; fileType: string
  sizeBytes: number; createdAt: string
  cardSection: {
    card: { id: string; title: string }
    column: { title: string; board: { id: string; title: string } }
  }
}
type Tab = 'stats' | 'users' | 'logs'

const ROLE_BADGE: Record<string, string> = {
  ADMIN:  'text-amber-300  bg-amber-500/12  border-amber-500/35',
  MEMBER: 'text-cyan-300   bg-cyan-500/10   border-cyan-500/30',
  GUEST:  'text-white/55   bg-white/6       border-white/16',
}
const ROLES = [
  { value: 'ADMIN',  label: 'Admin',     icon: '⚙️', desc: 'Acesso total' },
  { value: 'MEMBER', label: 'Membro',    icon: '👨‍🚀', desc: 'Acesso padrão' },
  { value: 'GUEST',  label: 'Visitante', icon: '🌐', desc: 'Somente leitura' },
]

// ── Action label helper ──────────────────────────────────
function actionLabel(action: string): { label: string; color: string } {
  if (action === 'LOGIN')           return { label: '🟢 Entrou no sistema',          color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' }
  if (action === 'LOGOUT')          return { label: '⚪ Saiu do sistema',             color: 'text-white/55 bg-white/5 border-white/14' }
  if (action === 'MOVE_BLOCKED')    return { label: '🚫 Tentou mover sem permissão', color: 'text-red-300 bg-red-500/12 border-red-500/30' }
  if (action === 'CARD_CREATED')    return { label: '✨ Criou um card',               color: 'text-violet-300 bg-violet-500/10 border-violet-500/25' }
  if (action === 'CARD_MOVED')      return { label: '🚀 Moveu um card',               color: 'text-amber-300 bg-amber-500/10 border-amber-500/25' }
  if (action === 'CARD_ARCHIVED')   return { label: '📦 Arquivou um card',            color: 'text-orange-300 bg-orange-500/10 border-orange-500/25' }
  if (action === 'CARD_RESTORED')   return { label: '♻️ Restaurou um card',           color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' }
  if (action === 'SECTION_SAVED')   return { label: '💬 Enviou mensagem/comentário', color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' }
  if (action === 'FILE_UPLOADED')   return { label: '📎 Enviou um arquivo',           color: 'text-teal-300 bg-teal-500/10 border-teal-500/25' }
  if (action === 'MENTION_REPLIED')       return { label: '↩️ Respondeu uma marcação',  color: 'text-pink-300 bg-pink-500/10 border-pink-500/25' }
  if (action === 'ANNOUNCEMENT_CREATED')  return { label: '📢 Criou um comunicado',      color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/25' }
  if (action === 'ANNOUNCEMENT_REPLIED')  return { label: '💬 Respondeu um comunicado', color: 'text-yellow-200 bg-yellow-500/8 border-yellow-500/20' }
  if (action.startsWith('POST:/boards') && action.includes('/cards')) return { label: '✨ Criou um card',      color: 'text-violet-300 bg-violet-500/10 border-violet-500/25' }
  if (action.startsWith('POST:/boards'))   return { label: '🛸 Criou uma missão',     color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/22' }
  if (action.startsWith('PATCH:/columns')) return { label: '⚙️ Editou uma etapa',    color: 'text-amber-300 bg-amber-500/10 border-amber-500/25' }
  if (action.startsWith('POST:/users/me/avatar')) return { label: '🖼️ Atualizou avatar', color: 'text-pink-300 bg-pink-500/10 border-pink-500/25' }
  if (action.startsWith('PATCH:/users/me'))       return { label: '✏️ Atualizou perfil', color: 'text-pink-300 bg-pink-500/10 border-pink-500/25' }
  return { label: action, color: 'text-cyan-300 bg-cyan-500/8 border-cyan-500/22' }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Log detail modal ─────────────────────────────────────
function formatActivityTxt(user: { name: string; email: string }, logs: any[]): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const sep = '═'.repeat(60)
  const lines: string[] = [
    sep,
    `RELATÓRIO DE ATIVIDADES — ${user.name}`,
    `E-mail: ${user.email}`,
    `Gerado em: ${now} (Horário de Brasília)`,
    `Total de registros: ${logs.length}`,
    sep,
    '',
  ]

  logs.forEach((log: any, i: number) => {
    const num = String(i + 1).padStart(3, '0')
    const dt = new Date(log.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const { label } = actionLabel(log.action)
    lines.push(`[${num}] ${dt}`)
    lines.push(`     Ação: ${label}`)
    if (log.ipAddress)  lines.push(`     IP: ${log.ipAddress}`)
    if (log.userAgent)  lines.push(`     Dispositivo: ${log.userAgent.substring(0, 120)}`)

    const m = log.metadata as Record<string, any> | null
    if (m) {
      if (m.cardTitle)        lines.push(`     Card: "${m.cardTitle}"`)
      if (m.columnTitle)      lines.push(`     Etapa: ${m.columnTitle}`)
      if (m.fromColumnTitle)  lines.push(`     De: ${m.fromColumnTitle}`)
      if (m.toColumnTitle)    lines.push(`     Para: ${m.toColumnTitle}`)
      if (m.toColumn)         lines.push(`     Para: ${m.toColumn}`)
      if (m.deadline)         lines.push(`     Prazo: ${new Date(m.deadline).toLocaleString('pt-BR')}`)
      if (m.reason === 'already_moved')      lines.push(`     Motivo: já havia movido este card`)
      if (m.reason === 'not_column_member')  lines.push(`     Motivo: não é membro da etapa de origem`)
      if (m.movedBy)          lines.push(`     Movido por: ${m.movedBy}`)
      if (m.boardTitle)       lines.push(`     Missão: ${m.boardTitle}`)
      if (m.preview)             lines.push(`     Mensagem: "${m.preview}"`)
      if (m.fileName)            lines.push(`     Arquivo: ${m.fileName} (${m.fileType ?? ''} · ${m.sizeBytes ? Math.round(m.sizeBytes / 1024) + ' KB' : ''})`)
      if (m.mentionId)           lines.push(`     Resposta a marcação`)
      if (m.title && m.content)  lines.push(`     Comunicado: "${m.title}" — ${m.content}`)
      if (m.announcementTitle && !m.title) lines.push(`     Comunicado: "${m.announcementTitle}"`)
      if (m.announcementTitle && m.content) lines.push(`     Resposta: "${m.content}"`)
      if (m.targetType) {
        const targets: Record<string, string> = { ALL: 'Todos', BOARD: 'Missão', CARD: 'Card', USER: 'Usuário específico' }
        lines.push(`     Destinatário: ${targets[m.targetType] ?? m.targetType}`)
      }
    }
    lines.push('')
  })

  lines.push(sep)
  lines.push('Fim do relatório')
  lines.push(sep)
  return lines.join('\n')
}

function LogDetailModal({ log, onClose }: { log: Log | null; onClose: () => void }) {
  const [files, setFiles] = useState<UserFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)

  useEffect(() => {
    if (!log) return
    setLoadingFiles(true)
    api.get(`/admin/users/${log.user.id}/files`)
      .then(({ data }) => setFiles(data.files))
      .catch(() => {})
      .finally(() => setLoadingFiles(false))
  }, [log?.user.id])

  async function downloadReport() {
    if (!log) return
    setDownloadingReport(true)
    try {
      const { data } = await api.get(`/admin/users/${log.user.id}/activity`)
      const content = formatActivityTxt(data.user, data.logs)
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeName = log.user.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      a.href = url
      a.download = `relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao gerar relatório')
    } finally {
      setDownloadingReport(false)
    }
  }

  const { label, color } = log ? actionLabel(log.action) : { label: '', color: '' }

  return (
    <AnimatePresence>
      {log && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass max-h-[85vh] flex flex-col"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-cyan/60 to-transparent" />

            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar name={log.user.name} size="sm" />
                <div>
                  <div className="text-sm font-body font-bold text-white/95">{log.user.name}</div>
                  <div className="text-xs text-white/50 font-body">{log.user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadReport}
                  disabled={downloadingReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/12 disabled:opacity-50 transition-all"
                >
                  {downloadingReport ? '⏳ Gerando...' : '📄 Baixar Relatório TXT'}
                </button>
                <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
              </div>
            </div>

            {/* Action */}
            <div className="glass rounded-xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-xs px-2.5 py-1 rounded-lg border font-body font-bold', color)}>
                  {label}
                </span>
                <span className="text-xs text-white/45 font-mono">{formatRelativeDate(log.createdAt)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-body">
                <div>
                  <span className="text-white/40 uppercase tracking-wider text-[10px] font-display font-black">IP</span>
                  <p className="text-white/75 font-mono mt-0.5">{log.ipAddress ?? '—'}</p>
                </div>
                <div>
                  <span className="text-white/40 uppercase tracking-wider text-[10px] font-display font-black">Ação técnica</span>
                  <p className="text-white/55 font-mono mt-0.5 truncate" title={log.action}>{log.action}</p>
                </div>
                {log.userAgent && (
                  <div className="col-span-2">
                    <span className="text-white/40 uppercase tracking-wider text-[10px] font-display font-black">Dispositivo</span>
                    <p className="text-white/55 font-body mt-0.5 truncate" title={log.userAgent}>{log.userAgent}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Files */}
            <div className="flex-1 overflow-y-auto scrollbar-space">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-display font-black text-white/50 uppercase tracking-widest">Arquivos enviados por este usuário</span>
                {!loadingFiles && <span className="text-xs text-white/30 font-mono">({files.length})</span>}
              </div>

              {loadingFiles && (
                <div className="flex justify-center py-6">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="text-2xl">🛸</motion.div>
                </div>
              )}

              {!loadingFiles && files.length === 0 && (
                <p className="text-xs text-white/35 font-body text-center py-6">Nenhum arquivo enviado por este usuário</p>
              )}

              {!loadingFiles && files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8">
                      <span className="text-lg shrink-0">
                        {f.fileType === 'IMAGE' ? '🖼️' : f.fileType === 'PDF' ? '📄' : f.fileType === 'WORD' ? '📝' : '📎'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-body font-semibold text-white/90 truncate">{f.originalName}</p>
                        <p className="text-[10px] text-white/45 font-body truncate">
                          {f.cardSection.column.board.title} › {f.cardSection.column.title} › {f.cardSection.card.title}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-white/40 font-mono">{formatBytes(f.sizeBytes)}</p>
                        <p className="text-[10px] text-white/35 font-body">{formatRelativeDate(f.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ── User form modal ──────────────────────────────────────
function UserFormModal({ open, onClose, onSave, editUser }: {
  open: boolean; onClose: () => void
  onSave: (u: User) => void; editUser: User | null
}) {
  const isEdit = !!editUser
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [role,     setRole]     = useState('MEMBER')
  const [password, setPassword] = useState('')
  const [active,   setActive]   = useState(true)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (editUser) {
      setName(editUser.name); setEmail(editUser.email)
      setPhone(editUser.phoneWhatsapp ?? ''); setRole(editUser.role)
      setActive(editUser.isActive); setPassword('')
    } else {
      setName(''); setEmail(''); setPhone(''); setRole('MEMBER'); setPassword(''); setActive(true)
    }
  }, [editUser, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        const roleChanged = role !== editUser!.role
        await Promise.all([
          api.patch(`/admin/users/${editUser!.id}/role`,    { role }),
          api.patch(`/admin/users/${editUser!.id}/status`,  { isActive: active }),
          api.patch(`/admin/users/${editUser!.id}/profile`, { name: name.trim(), phoneWhatsapp: phone.trim() || null }),
        ])
        toast.success('Usuário atualizado ✅')
        if (roleChanged) {
          toast('⚠️ Função alterada. O usuário precisa fazer logout e login para as permissões entrarem em vigor em todas as telas.', { duration: 6000 })
        }
        onSave({ ...editUser!, name, role, isActive: active, phoneWhatsapp: phone.trim() || undefined })
      } else {
        const { data } = await api.post('/admin/users', {
          name: name.trim(), email: email.trim().toLowerCase(),
          password, role, phoneWhatsapp: phone.trim() || undefined,
        })
        toast.success('Usuário criado 🚀')
        onSave(data.user)
      }
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-violet/60 to-transparent" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-base font-black tracking-wider text-white">
                  {isEdit ? '✏️ EDITAR USUÁRIO' : '+ NOVO USUÁRIO'}
                </h3>
                <p className="text-sm text-white/65 font-body mt-0.5">
                  {isEdit ? `Editando: ${editUser?.name}` : 'Novo membro da tripulação'}
                </p>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">Nome *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome completo"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  E-mail {!isEdit && '*'}
                </label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                  required={!isEdit} readOnly={isEdit} placeholder="email@missao.com"
                  className={cn('w-full px-4 py-2.5 rounded-xl text-sm font-body input-space', isEdit && 'opacity-50 cursor-not-allowed')} />
                {isEdit && <p className="text-[11px] text-white/45 mt-1 font-body">E-mail não pode ser alterado</p>}
              </div>
              {!isEdit && (
                <div>
                  <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">Senha *</label>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
                    required minLength={8} placeholder="Mínimo 8 caracteres"
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
                </div>
              )}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">WhatsApp</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>

              {/* Role picker */}
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-2">Nível de Acesso</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center transition-all',
                        role === r.value
                          ? 'border-neon-violet/65 bg-neon-violet/22 text-white'
                          : 'border-white/14 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white/90',
                      )}
                    >
                      <span className="text-2xl">{r.icon}</span>
                      <span className="text-xs font-display font-black tracking-wide">{r.label}</span>
                      <span className="text-[10px] text-white/55 font-body">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status toggle — edit only */}
              {isEdit && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/6 border border-white/14">
                  <div>
                    <div className="text-sm font-body font-semibold text-white/95">Status da conta</div>
                    <div className="text-xs text-white/60 font-body mt-0.5">
                      {active ? 'Usuário pode acessar o sistema' : 'Acesso bloqueado'}
                    </div>
                  </div>
                  <button type="button" onClick={() => setActive(!active)}
                    className={cn('relative w-12 h-6 rounded-full transition-all duration-300', active ? 'bg-neon-emerald' : 'bg-white/22')}>
                    <div className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300', active ? 'left-6' : 'left-0.5')} />
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body font-semibold border border-white/18 text-white/75 hover:bg-white/7 transition-all">
                  Cancelar
                </button>
                <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black tracking-wider text-white uppercase disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
                  {saving ? '⚡ Salvando...' : isEdit ? '💾 Salvar' : '🚀 Criar Usuário'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ── Reset password modal ─────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => { setPassword(''); setConfirm('') }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }
    if (password.length < 8)  { toast.error('Mínimo 8 caracteres'); return }
    setSaving(true)
    try {
      await api.patch(`/admin/users/${user!.id}/password`, { password })
      toast.success('Senha redefinida com sucesso 🔑')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao redefinir senha')
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      {user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-sm glass rounded-2xl p-6 shadow-glass"
          >
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-base font-black tracking-wider text-white">🔑 RESETAR SENHA</h3>
                <p className="text-sm text-white/60 font-body mt-0.5">{user.name}</p>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Nova Senha *
                </label>
                <input
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  type="password" required minLength={8} placeholder="Mínimo 8 caracteres"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-body input-space"
                />
              </div>
              <div>
                <label className="block text-xs font-display font-black text-white/75 uppercase tracking-widest mb-1.5">
                  Confirmar Senha *
                </label>
                <input
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  type="password" required minLength={8} placeholder="Repita a nova senha"
                  className={cn('w-full px-4 py-2.5 rounded-xl text-sm font-body input-space',
                    confirm && password !== confirm ? 'border border-red-500/60' : '')}
                />
                {confirm && password !== confirm && (
                  <p className="text-[11px] text-red-400 mt-1 font-body">As senhas não coincidem</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-body font-semibold border border-white/18 text-white/75 hover:bg-white/7 transition-all">
                  Cancelar
                </button>
                <motion.button type="submit"
                  disabled={saving || password.length < 8 || password !== confirm}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black tracking-wider text-white uppercase disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', boxShadow: '0 0 20px rgba(217,119,6,0.4)' }}>
                  {saving ? '⏳ Salvando...' : '🔑 Redefinir Senha'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ── Main page ────────────────────────────────────────────
export default function AdminPage() {
  const [activeTab, setActiveTab]   = useState<Tab>('stats')
  const [stats, setStats]           = useState<Stats | null>(null)
  const [users, setUsers]           = useState<User[]>([])
  const [logs, setLogs]             = useState<Log[]>([])
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean } | null>(null)
  const [isLoading, setIsLoading]   = useState(true)
  const [showUserForm, setShowUserForm]       = useState(false)
  const [showImportUsers, setShowImportUsers] = useState(false)
  const [editingUser, setEditingUser]         = useState<User | null>(null)
  const router = useRouter()
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [logSearch, setLogSearch]   = useState('')
  const [selectedLog, setSelectedLog] = useState<Log | null>(null)
  const [syncingDrive, setSyncingDrive] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/admin/dashboard').then(({ data }) => setStats(data)),
      api.get('/admin/users').then(({ data }) => setUsers(data.users)),
      api.get('/admin/logs?limit=50').then(({ data }) => setLogs(data.logs)),
      api.get('/admin/whatsapp/status').then(({ data }) => setWhatsappStatus(data)),
    ]).catch(() => toast.error('Erro ao carregar dados')).finally(() => setIsLoading(false))
  }, [])

  async function syncDrive() {
    setSyncingDrive(true)
    try {
      const { data } = await api.post('/admin/drive/sync')
      toast.success(`Drive sincronizado ✅ +${data.added} adicionado(s), -${data.removed} removido(s)`, { duration: 5000 })
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao sincronizar Drive')
    } finally { setSyncingDrive(false) }
  }

  async function toggleUser(user: User) {
    try {
      await api.patch(`/admin/users/${user.id}/status`, { isActive: !user.isActive })
      setUsers((u) => u.map((x) => x.id === user.id ? { ...x, isActive: !x.isActive } : x))
      toast.success(user.isActive ? 'Usuário desativado' : 'Usuário ativado ✅')
    } catch { toast.error('Erro') }
  }

  function openCreate() { setEditingUser(null); setShowUserForm(true) }
  function openEdit(user: User) { setEditingUser(user); setShowUserForm(true) }
  function handleUserSaved(saved: User) {
    setUsers((u) => u.find((x) => x.id === saved.id)
      ? u.map((x) => x.id === saved.id ? { ...x, ...saved } : x)
      : [{ ...saved, _count: saved._count ?? { createdCards: 0, accessLogs: 0 } }, ...u])
  }

  const filteredLogs = logs.filter((l) =>
    !logSearch ||
    l.user.name.toLowerCase().includes(logSearch.toLowerCase()) ||
    l.action.toLowerCase().includes(logSearch.toLowerCase())
  )

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'stats', label: 'Visão Geral', icon: '🌐' },
    { id: 'users', label: 'Tripulação',  icon: '👨‍🚀' },
    { id: 'logs',  label: 'Logs',        icon: '📡' },
  ]

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-5 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <p className="text-xs font-display font-black tracking-[0.3em] text-amber-400/80 mb-1.5 uppercase">⚙ Mission Control</p>
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-black text-white tracking-wide">Painel Administrativo</h1>
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => router.push('/admin/crm')}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neon-violet/35 bg-neon-violet/10 text-violet-300 text-xs font-body font-bold hover:bg-neon-violet/20 transition-all"
              >
                🎯 CRM
              </motion.button>
              <motion.button
                onClick={syncDrive}
                disabled={syncingDrive}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                title="Sincronizar acessos do Google Drive agora"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/35 bg-blue-500/10 text-blue-300 text-xs font-body font-bold hover:bg-blue-500/20 disabled:opacity-50 transition-all"
              >
                {syncingDrive ? '⏳ Sincronizando...' : '🔄 Sync Drive'}
              </motion.button>
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-body font-bold',
                whatsappStatus?.connected
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : 'bg-red-500/12 border-red-500/30 text-red-300')}>
                <div className={cn('w-2 h-2 rounded-full', whatsappStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')} />
                WhatsApp {whatsappStatus?.connected ? 'Conectado' : 'Desconectado'}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl glass-strong border border-white/16 w-fit mb-8">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('px-4 py-2 rounded-lg text-sm font-display font-black tracking-wide transition-all',
                activeTab === tab.id ? 'bg-neon-violet/35 text-white border border-neon-violet/55' : 'text-white/65 hover:text-white')}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-5xl">🛸</motion.div>
          </div>
        ) : (
          <>
            {/* STATS */}
            {activeTab === 'stats' && stats && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Usuários',  value: stats.counts.totalUsers,   icon: '👨‍🚀', color: '#7c3aed' },
                    { label: 'Ativos',    value: stats.counts.activeUsers,  icon: '🟢',  color: '#10b981' },
                    { label: 'Boards',    value: stats.counts.totalBoards,  icon: '🛸',  color: '#06b6d4' },
                    { label: 'Cards',     value: stats.counts.totalCards,   icon: '🃏',  color: '#a855f7' },
                    { label: 'Atrasados', value: stats.counts.overdueCards, icon: '⚠️', color: '#ef4444' },
                  ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="glass rounded-2xl p-4 border border-white/14" style={{ borderTopColor: s.color + '60' }}>
                      <div className="text-2xl mb-2">{s.icon}</div>
                      <div className="font-display text-3xl font-black text-white" style={{ textShadow: `0 0 20px ${s.color}80` }}>{s.value}</div>
                      <div className="text-xs font-body font-bold text-white/70 mt-0.5">{s.label}</div>
                    </motion.div>
                  ))}
                </div>
                {/* CRM Card */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  onClick={() => router.push('/admin/crm')}
                  className="glass rounded-2xl p-5 border border-neon-violet/30 cursor-pointer hover:border-neon-violet/60 hover:bg-neon-violet/5 transition-all group"
                  style={{ borderTopColor: '#7c3aed90' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-display font-black tracking-[0.3em] text-neon-violet/70 uppercase mb-1">⚙ Mission Control</p>
                      <h3 className="font-display text-lg font-black text-white">🎯 CRM — Pipeline de Vendas</h3>
                      <p className="text-xs text-white/50 font-body mt-1">Gerencie leads, decisores e automação com IA</p>
                    </div>
                    <div className="text-3xl group-hover:scale-110 transition-transform">→</div>
                  </div>
                </motion.div>

                <div className="glass rounded-2xl p-5 border border-white/14">
                  <h3 className="font-display text-sm font-black tracking-wider text-white mb-4">📡 Logins Recentes (24h)</h3>
                  {stats.recentLogins.length === 0 && <p className="text-sm text-white/50 font-body">Nenhum login nas últimas 24 horas</p>}
                  <div className="divide-y divide-white/6">
                    {stats.recentLogins.map((login) => (
                      <div key={login.id} className="flex items-center gap-3 py-2.5">
                        <Avatar name={login.user.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-body font-semibold text-white/95 truncate">{login.user.name}</div>
                          <div className="text-xs text-white/55 font-body">{login.user.email}</div>
                        </div>
                        <div className="text-xs text-white/55 font-mono">{formatRelativeDate(login.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* USERS */}
            {activeTab === 'users' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-body font-semibold text-white/75">
                    {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setShowImportUsers(true)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-display tracking-wider text-white/70 border border-white/12 hover:border-neon-cyan/35 hover:text-white hover:bg-neon-cyan/8 transition-all">
                      📂 Importar CSV
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={openCreate}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-display font-black tracking-wider text-white"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.45)' }}>
                      + Novo Usuário
                    </motion.button>
                  </div>
                </div>

                <div className="glass rounded-2xl border border-white/14 overflow-hidden">
                  <div className="overflow-x-auto scrollbar-space">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/12">
                          {['Usuário', 'Role', 'WhatsApp', 'Último Acesso', 'Último Comentário', 'Cards', 'Status', 'Ações'].map((h) => (
                            <th key={h} className="px-4 py-4 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-white/3 transition-colors group">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar name={user.name} size="sm" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-body font-semibold text-white/95">{user.name}</span>
                                    <button
                                      onClick={() => openEdit(user)}
                                      title="Editar usuário"
                                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded-md text-white/40 border border-white/12 hover:text-violet-300 hover:border-neon-violet/45 hover:bg-neon-violet/14 transition-all text-[10px]"
                                    >
                                      ✏️
                                    </button>
                                  </div>
                                  <div className="text-xs text-white/60 font-body truncate">{user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={cn('text-xs px-2.5 py-1 rounded-lg border font-display font-black tracking-wide', ROLE_BADGE[user.role] ?? ROLE_BADGE.GUEST)}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={cn('text-xs font-mono font-semibold', user.phoneWhatsapp ? 'text-emerald-300' : 'text-white/40')}>
                                {user.phoneWhatsapp ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-xs text-white/70 font-body font-medium">
                                {user.lastAccessAt ? formatRelativeDate(user.lastAccessAt) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 max-w-[180px]">
                              {user.lastCommentText
                                ? <div>
                                    <p className="text-xs text-white/80 font-body font-medium truncate">{user.lastCommentText}</p>
                                    <p className="text-[10px] text-white/45 font-body">{user.lastCommentAt ? formatRelativeDate(user.lastCommentAt) : ''}</p>
                                  </div>
                                : <span className="text-xs text-white/35">—</span>}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-sm font-mono font-black text-white/80">{user._count.createdCards}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-body font-bold border',
                                user.isActive
                                  ? 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30'
                                  : 'text-white/50 bg-white/5 border-white/14')}>
                                <div className={cn('w-1.5 h-1.5 rounded-full', user.isActive ? 'bg-emerald-400' : 'bg-white/35')} />
                                {user.isActive ? 'Ativo' : 'Inativo'}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(user)}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-neon-violet/40 text-violet-300 font-body font-bold hover:bg-neon-violet/18 transition-all">
                                  ✏️ Editar
                                </button>
                                <button onClick={() => setResetPasswordUser(user)}
                                  title="Redefinir senha"
                                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/35 text-amber-300 font-body font-bold hover:bg-amber-500/12 transition-all">
                                  🔑 Senha
                                </button>
                                <button onClick={() => toggleUser(user)}
                                  className={cn('text-xs px-2.5 py-1.5 rounded-lg border font-body font-bold transition-all',
                                    user.isActive
                                      ? 'text-red-300/85 border-red-500/28 hover:bg-red-500/12 hover:text-red-300'
                                      : 'text-emerald-300/85 border-emerald-500/28 hover:bg-emerald-500/12 hover:text-emerald-300')}>
                                  {user.isActive ? 'Desativar' : 'Ativar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* LOGS */}
            {activeTab === 'logs' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="flex items-center gap-3">
                  <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="🔍 Filtrar por usuário ou ação..."
                    className="w-full max-w-xs px-4 py-2 rounded-xl text-sm font-body input-space" />
                  <span className="text-xs text-white/65 font-body font-semibold">{filteredLogs.length} registros</span>
                </div>
                <div className="glass rounded-2xl border border-white/14 overflow-hidden">
                  <div className="overflow-x-auto scrollbar-space">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/12">
                          {['Usuário', 'O que fez', 'Ação técnica', 'IP', 'Quando', ''].map((h) => (
                            <th key={h} className="px-4 py-3.5 text-left text-[11px] font-display font-black tracking-widest text-white/35 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredLogs.map((log) => {
                          const { label, color } = actionLabel(log.action)
                          return (
                            <tr key={log.id} className="hover:bg-white/3 transition-colors group">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={log.user.name} size="xs" />
                                  <div className="min-w-0">
                                    <div className="text-sm font-body font-semibold text-white/90 truncate">{log.user.name}</div>
                                    <div className="text-[10px] text-white/45 font-body truncate">{log.user.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn('text-xs px-2.5 py-1 rounded-lg border font-body font-bold whitespace-nowrap', color)}>
                                  {label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[10px] text-white/35 font-mono truncate max-w-[140px] block" title={log.action}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-white/55 font-mono">{log.ipAddress ?? '—'}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-white/70 font-body font-semibold whitespace-nowrap">{formatRelativeDate(log.createdAt)}</span>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => setSelectedLog(log)}
                                  className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1.5 rounded-lg border border-neon-cyan/30 text-cyan-300 font-body font-bold hover:bg-neon-cyan/10 transition-all whitespace-nowrap"
                                >
                                  Ver detalhes
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>

      <UserFormModal open={showUserForm} onClose={() => setShowUserForm(false)} onSave={handleUserSaved} editUser={editingUser} />
      <ResetPasswordModal user={resetPasswordUser} onClose={() => setResetPasswordUser(null)} />
      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      <ImportCSVModal
        open={showImportUsers}
        type="users"
        onClose={() => setShowImportUsers(false)}
        onSuccess={() => {
          setShowImportUsers(false)
          api.get('/admin/users').then(({ data }) => setUsers(data.users)).catch(() => {})
        }}
      />
    </div>
  )
}

