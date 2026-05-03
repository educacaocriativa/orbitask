'use client'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { Navbar } from '@/components/ui/Navbar'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────
type CrmStage =
  | 'LEAD' | 'PRIMEIRO_CONTATO'
  | 'NIVEL_CONSCIENCIA_1' | 'NIVEL_CONSCIENCIA_2' | 'NIVEL_CONSCIENCIA_3'
  | 'FINALIZADO' | 'FECHADO'

interface Skill {
  id: string; name: string; description?: string
  content: string; trigger?: string; isActive: boolean; order: number
}

interface Product {
  id: string; name: string; description?: string; price?: string
  videoUrl?: string; features?: string[]
}
interface LeadProduct {
  id: string; productId: string; suggestedByAi: boolean
  product: Product
}
interface DecisionMaker {
  id: string; name: string; role?: string; email?: string
  phoneCompany?: string; phonePersonal?: string; linkedin?: string; isPrimary: boolean
}
interface CrmMessage {
  id: string; leadId: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  sentBy?: 'AI' | 'HUMAN' | null
  senderName?: string
  createdAt: string
}
interface StageHistory {
  id: string; fromStage?: CrmStage; toStage: CrmStage
  notes?: string; isAiMove: boolean; createdAt: string
  movedBy?: { name: string }
  aiConversation?: any
}
const SEGMENTS = ['Editora', 'Escola', 'Varejo', 'Indústria', 'Tecnologia', 'Saúde', 'Outro']

interface Lead {
  id: string; companyName: string; companyPhone?: string; companyWebsite?: string; segment?: string
  stage: CrmStage; position: number
  decisionMakers: DecisionMaker[]
  stageHistory: StageHistory[]
  leadProducts: LeadProduct[]
  _count?: { stageHistory: number }
  createdAt: string
}

// ── Stage config ──────────────────────────────────────────
const STAGES: { id: CrmStage; label: string; color: string; emoji: string }[] = [
  { id: 'LEAD',               label: 'Lead',                color: '#6366f1', emoji: '🎯' },
  { id: 'PRIMEIRO_CONTATO',   label: 'Primeiro Contato',    color: '#06b6d4', emoji: '👋' },
  { id: 'NIVEL_CONSCIENCIA_1',label: 'Nível de Consciência 1', color: '#8b5cf6', emoji: '💡' },
  { id: 'NIVEL_CONSCIENCIA_2',label: 'Nível de Consciência 2', color: '#a855f7', emoji: '🔍' },
  { id: 'NIVEL_CONSCIENCIA_3',label: 'Nível de Consciência 3', color: '#ec4899', emoji: '🎯' },
  { id: 'FINALIZADO',         label: 'Finalizado',          color: '#f59e0b', emoji: '✅' },
  { id: 'FECHADO',            label: 'Fechado com Cliente', color: '#10b981', emoji: '🏆' },
]

function stageConfig(id: CrmStage) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]
}

function waLink(phone?: string) {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  return `https://wa.me/${clean}`
}

// ── Lead Card (compact) ───────────────────────────────────
function LeadCard({ lead, onClick, onDelete }: { lead: Lead; onClick: () => void; onDelete: () => void }) {
  const primary = lead.decisionMakers.find((d) => d.isPrimary) ?? lead.decisionMakers[0]
  const cfg = stageConfig(lead.stage)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    } else {
      onDelete()
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="glass rounded-xl p-3.5 border border-white/10 cursor-pointer hover:border-white/25 hover:bg-white/5 transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-display font-bold text-white leading-snug flex-1 min-w-0 truncate">
          {lead.companyName}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {lead.companyPhone && (
            <a
              href={waLink(lead.companyPhone)!}
              target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-emerald-400 hover:text-emerald-300 text-xs transition-colors"
              title="WhatsApp empresa"
            >💬</a>
          )}
          <button
            onClick={handleDelete}
            title={confirmDelete ? 'Clique para confirmar exclusão' : 'Arquivar lead'}
            className={`text-xs transition-all rounded px-1 py-0.5 ${
              confirmDelete
                ? 'text-red-400 bg-red-500/20 border border-red-500/40 font-black animate-pulse'
                : 'text-white/25 hover:text-red-400'
            }`}
          >
            {confirmDelete ? '⚠ Confirmar?' : '🗑'}
          </button>
        </div>
      </div>
      {lead.segment && (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-display font-black tracking-wider bg-neon-violet/20 text-neon-violet/90 border border-neon-violet/30">
          {lead.segment}
        </span>
      )}

      {primary && (
        <div className="flex items-center gap-1.5">
          <Avatar name={primary.name} size="xs" />
          <div className="min-w-0">
            <p className="text-xs font-body font-semibold text-white/80 truncate">{primary.name}</p>
            {primary.role && <p className="text-[10px] text-white/45 font-body truncate">{primary.role}</p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40 font-body">
          {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
        </span>
        <div className="flex items-center gap-1">
          {lead.decisionMakers.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 border border-white/12 text-white/50 font-body">
              {lead.decisionMakers.length} decisores
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-body font-bold"
            style={{ borderColor: cfg.color + '50', background: cfg.color + '18', color: cfg.color }}>
            {cfg.emoji}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Decision Maker Form ───────────────────────────────────
function DmForm({ onSave, onCancel, initial }: {
  onSave: (data: Partial<DecisionMaker>) => Promise<void>
  onCancel: () => void
  initial?: Partial<DecisionMaker>
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '', role: initial?.role ?? '',
    email: initial?.email ?? '', phoneCompany: initial?.phoneCompany ?? '',
    phonePersonal: initial?.phonePersonal ?? '', linkedin: initial?.linkedin ?? '',
    isPrimary: initial?.isPrimary ?? false,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1">{label}</label>
      <input
        type={type} value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-sm font-body input-space"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-xl bg-white/4 border border-white/10">
      <div className="grid grid-cols-2 gap-3">
        {field('Nome *', 'name', 'text', 'Nome completo')}
        {field('Cargo / Função', 'role', 'text', 'CEO, Diretor...')}
        {field('E-mail', 'email', 'email', 'email@empresa.com')}
        {field('LinkedIn', 'linkedin', 'url', 'https://linkedin.com/in/...')}
        {field('Tel. Empresa (WhatsApp)', 'phoneCompany', 'text', '+5511...')}
        {field('Tel. Pessoal (WhatsApp)', 'phonePersonal', 'text', '+5511...')}
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isPrimary" checked={form.isPrimary}
          onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
          className="rounded" />
        <label htmlFor="isPrimary" className="text-xs text-white/70 font-body">Decisor principal</label>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 rounded-xl text-sm font-body border border-white/15 text-white/60 hover:bg-white/5 transition-all">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex-[2] py-2 rounded-xl text-sm font-display font-black text-white disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
          {saving ? '⏳ Salvando...' : '✅ Salvar'}
        </button>
      </div>
    </form>
  )
}

// ── Lead Modal ────────────────────────────────────────────
function LeadModal({ leadId, onClose, onUpdated }: {
  leadId: string; onClose: () => void; onUpdated: () => void
}) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [tab, setTab] = useState<'info' | 'decisores' | 'historico' | 'mensagens'>('info')
  const [messages, setMessages]     = useState<CrmMessage[]>([])
  const [msgInput, setMsgInput]     = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [addingDm, setAddingDm] = useState(false)
  const [editingDmId, setEditingDmId] = useState<string | null>(null)
  const [movingStage, setMovingStage] = useState<CrmStage | null>(null)
  const [moveNotes, setMoveNotes] = useState('')
  const [moving, setMoving] = useState(false)
  const [editingCompany, setEditingCompany] = useState(false)
  const [companyName, setCompanyName]       = useState('')
  const [companyPhone, setCompanyPhone]     = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [segment, setSegment]               = useState('')

  const reload = useCallback(async () => {
    const { data } = await api.get(`/crm/leads/${leadId}`)
    setLead(data.lead)
    setCompanyName(data.lead.companyName)
    setCompanyPhone(data.lead.companyPhone ?? '')
    setCompanyWebsite(data.lead.companyWebsite ?? '')
    setSegment(data.lead.segment ?? '')
  }, [leadId])

  useEffect(() => { reload() }, [reload])

  const loadMessages = useCallback(async () => {
    const { data } = await api.get(`/crm/leads/${leadId}/messages`)
    setMessages(data.messages)
  }, [leadId])

  useEffect(() => {
    if (tab === 'mensagens') loadMessages()
  }, [tab, loadMessages])

  async function sendMessage() {
    if (!msgInput.trim()) return
    setSendingMsg(true)
    try {
      await api.post(`/crm/leads/${leadId}/messages`, { content: msgInput.trim() })
      setMsgInput('')
      loadMessages()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao enviar mensagem')
    } finally { setSendingMsg(false) }
  }

  async function handleMove() {
    if (!movingStage) return
    setMoving(true)
    try {
      await api.post(`/crm/leads/${leadId}/move`, { toStage: movingStage, notes: moveNotes })
      toast.success('Lead movido ✅')
      setMovingStage(null); setMoveNotes('')
      await reload(); onUpdated()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao mover')
    } finally { setMoving(false) }
  }

  async function handleSaveCompany() {
    try {
      await api.patch(`/crm/leads/${leadId}`, { companyName, companyPhone: companyPhone || null, companyWebsite: companyWebsite || null, segment: segment || null })
      await reload(); onUpdated()
      setEditingCompany(false)
      toast.success('Atualizado ✅')
    } catch { toast.error('Erro ao salvar') }
  }

  async function handleAddDm(data: Partial<DecisionMaker>) {
    await api.post(`/crm/leads/${leadId}/decision-makers`, data)
    await reload(); setAddingDm(false)
    toast.success('Decisor adicionado ✅')
  }

  async function handleEditDm(id: string, data: Partial<DecisionMaker>) {
    await api.patch(`/crm/decision-makers/${id}`, data)
    await reload(); setEditingDmId(null)
    toast.success('Decisor atualizado ✅')
  }

  async function handleDeleteDm(id: string) {
    await api.delete(`/crm/decision-makers/${id}`)
    await reload(); onUpdated()
    toast.success('Decisor removido')
  }

  async function handleArchive() {
    await api.delete(`/crm/leads/${leadId}`)
    toast.success('Lead arquivado')
    onClose(); onUpdated()
  }

  if (!lead) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="text-4xl animate-spin">🛸</div>
    </div>
  )

  const cfg = stageConfig(lead.stage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full max-w-2xl max-h-[92vh] glass rounded-2xl flex flex-col shadow-glass overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              {editingCompany ? (
                <div className="space-y-2">
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-sm font-display font-bold input-space" />
                  <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="Telefone / WhatsApp (+55...)" className="w-full px-3 py-1.5 rounded-xl text-sm font-body input-space" />
                  <input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder="Site (https://...)" className="w-full px-3 py-1.5 rounded-xl text-sm font-body input-space" />
                  <select value={segment} onChange={(e) => setSegment(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-sm font-body input-space">
                    <option value="">Segmento...</option>
                    {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingCompany(false)} className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/60 hover:bg-white/5 transition-all">Cancelar</button>
                    <button onClick={handleSaveCompany} className="text-xs px-3 py-1.5 rounded-lg text-white font-display font-black transition-all" style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>Salvar</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-black text-white">{lead.companyName}</h2>
                    <button onClick={() => setEditingCompany(true)} className="text-white/30 hover:text-white/70 text-sm transition-colors">✏️</button>
                  </div>
                  {lead.companyPhone && (
                    <a href={waLink(lead.companyPhone)!} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 mt-0.5 transition-colors">
                      💬 {lead.companyPhone}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-lg border font-display font-black"
                style={{ borderColor: cfg.color + '50', background: cfg.color + '18', color: cfg.color }}>
                {cfg.emoji} {cfg.label}
              </span>
              <button onClick={handleArchive} title="Arquivar lead"
                className="text-white/25 hover:text-red-400 transition-colors text-sm">🗑</button>
              <button onClick={onClose} className="text-white/35 hover:text-white transition-colors text-xl">✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 flex-wrap">
            {([
              { id: 'info',      label: '🏢 Empresa' },
              { id: 'decisores', label: '👥 Decisores' },
              { id: 'mensagens', label: '💬 Mensagens' },
              { id: 'historico', label: '📋 Histórico' },
            ] as const).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-display font-black tracking-wide transition-all',
                  tab === t.id ? 'bg-neon-violet/35 text-white border border-neon-violet/55' : 'text-white/50 hover:text-white')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-space px-6 py-5">

          {/* ── Mover etapa (sempre visível) ── */}
          <div className="mb-5 p-4 rounded-xl bg-white/4 border border-white/10 space-y-3">
            <p className="text-xs font-display font-black text-white/60 uppercase tracking-widest">🚀 Mover para etapa</p>
            <div className="flex flex-wrap gap-2">
              {STAGES.filter((s) => s.id !== lead.stage).map((s) => (
                <button key={s.id} onClick={() => setMovingStage(movingStage === s.id ? null : s.id)}
                  className={cn('text-xs px-2.5 py-1.5 rounded-lg border font-body font-bold transition-all',
                    movingStage === s.id
                      ? 'border-white/50 bg-white/15 text-white'
                      : 'border-white/14 text-white/60 hover:border-white/30 hover:text-white/90')}
                  style={movingStage === s.id ? { borderColor: s.color, background: s.color + '20', color: s.color } : {}}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            {movingStage && (
              <div className="space-y-2">
                <textarea value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)}
                  placeholder="Observações sobre esta movimentação (opcional)..."
                  rows={2} className="w-full px-3 py-2 rounded-xl text-sm font-body input-space resize-none" />
                <button onClick={handleMove} disabled={moving}
                  className="w-full py-2 rounded-xl text-sm font-display font-black text-white disabled:opacity-40 transition-all"
                  style={{ background: `linear-gradient(135deg, ${stageConfig(movingStage).color}, #7c3aed)` }}>
                  {moving ? '⏳ Movendo...' : `🚀 Mover para ${stageConfig(movingStage).label}`}
                </button>
              </div>
            )}
          </div>

          {/* ── Tab: Empresa ── */}
          {tab === 'info' && (
            <div className="space-y-3">
              <InfoRow label="Empresa" value={lead.companyName} />
              <InfoRow label="Telefone de Contato" value={lead.companyPhone} phone />
              {lead.companyWebsite && (
                <div className="flex items-center justify-between py-1.5 border-b border-white/6">
                  <span className="text-xs text-white/45 font-body font-semibold w-32 shrink-0">Site</span>
                  <a href={lead.companyWebsite} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-neon-violet/80 hover:text-neon-violet font-body truncate transition-colors"
                    title={lead.companyWebsite}>
                    🌐 {lead.companyWebsite.replace(/^https?:\/\//, '').split('/')[0]}
                  </a>
                </div>
              )}
              <InfoRow label="Segmento" value={lead.segment} />
              <InfoRow label="Criado em" value={new Date(lead.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} />
              <InfoRow label="Etapa atual" value={`${cfg.emoji} ${cfg.label}`} />
              <InfoRow label="Total de movimentações" value={String(lead.stageHistory.length)} />
            </div>
          )}

          {/* ── Tab: Decisores ── */}
          {tab === 'decisores' && (
            <div className="space-y-4">
              {lead.decisionMakers.map((dm) => (
                <div key={dm.id}>
                  {editingDmId === dm.id ? (
                    <DmForm
                      initial={dm}
                      onSave={(d) => handleEditDm(dm.id, d)}
                      onCancel={() => setEditingDmId(null)}
                    />
                  ) : (
                    <div className="p-4 rounded-xl bg-white/4 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar name={dm.name} size="sm" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-body font-bold text-white/95">{dm.name}</span>
                              {dm.isPrimary && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-neon-violet/18 border border-neon-violet/35 text-violet-300 font-display font-black">
                                  Principal
                                </span>
                              )}
                            </div>
                            {dm.role && <p className="text-xs text-white/55 font-body">{dm.role}</p>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingDmId(dm.id)} className="text-white/30 hover:text-white/70 text-sm transition-colors">✏️</button>
                          <button onClick={() => handleDeleteDm(dm.id)} className="text-white/25 hover:text-red-400 text-sm transition-colors">🗑</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {dm.email && <DmContact icon="✉️" label={dm.email} href={`mailto:${dm.email}`} />}
                        {dm.linkedin && <DmContact icon="🔗" label="LinkedIn" href={dm.linkedin} />}
                        {dm.phoneCompany && <DmContact icon="💬" label={`Empresa: ${dm.phoneCompany}`} href={waLink(dm.phoneCompany)!} />}
                        {dm.phonePersonal && <DmContact icon="📱" label={`Pessoal: ${dm.phonePersonal}`} href={waLink(dm.phonePersonal)!} />}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addingDm ? (
                <DmForm onSave={handleAddDm} onCancel={() => setAddingDm(false)} />
              ) : (
                <button onClick={() => setAddingDm(true)}
                  className="w-full py-2.5 rounded-xl border border-dashed border-white/20 text-white/50 hover:border-neon-violet/40 hover:text-white/80 text-sm font-body font-semibold transition-all">
                  + Adicionar decisor
                </button>
              )}
            </div>
          )}

          {/* ── Tab: Histórico ── */}
          {/* ── Tab: Mensagens ── */}
          {tab === 'mensagens' && (
            <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
              {/* Lista de mensagens */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1 scrollbar-space">
                {messages.length === 0 ? (
                  <div className="text-center py-10 text-white/30">
                    <p className="text-3xl mb-2">💬</p>
                    <p className="text-sm font-body">Nenhuma mensagem ainda.</p>
                    <p className="text-xs font-body mt-1">Mensagens trocadas via WhatsApp aparecem aqui.</p>
                  </div>
                ) : messages.map((msg) => {
                  const isOut = msg.direction === 'OUTBOUND'
                  return (
                    <div key={msg.id} className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm font-body leading-relaxed ${
                        isOut
                          ? msg.sentBy === 'AI'
                            ? 'bg-neon-violet/25 border border-neon-violet/40 text-white rounded-tr-sm'
                            : 'bg-emerald-600/25 border border-emerald-500/40 text-white rounded-tr-sm'
                          : 'bg-white/10 border border-white/15 text-white/90 rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <span className="text-[10px] text-white/30 font-body">
                          {new Date(msg.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                        {msg.senderName && (
                          <span className="text-[10px] text-white/40 font-body">
                            · {msg.sentBy === 'AI' ? '🤖' : msg.direction === 'INBOUND' ? '📱' : '👤'} {msg.senderName}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Campo de envio manual */}
              <div className="flex gap-2 pt-3 border-t border-white/8 shrink-0">
                <input
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Digite uma mensagem para enviar via WhatsApp..."
                  className="flex-1 px-3 py-2 rounded-xl text-sm font-body input-space"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={sendMessage}
                  disabled={sendingMsg || !msgInput.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-display font-black text-white disabled:opacity-40 shrink-0"
                  style={{ background: 'linear-gradient(135deg,#059669,#06b6d4)' }}
                >
                  {sendingMsg ? '⏳' : '➤'}
                </motion.button>
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              {lead.stageHistory.length === 0 && (
                <p className="text-sm text-white/40 font-body text-center py-8">Nenhum registro ainda</p>
              )}
              {lead.stageHistory.map((h) => {
                const toCfg = stageConfig(h.toStage)
                const fromCfg = h.fromStage ? stageConfig(h.fromStage) : null
                return (
                  <div key={h.id} className="p-4 rounded-xl bg-white/4 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {fromCfg && (
                          <>
                            <span className="text-xs px-2 py-0.5 rounded-md border font-body font-bold"
                              style={{ borderColor: fromCfg.color + '40', background: fromCfg.color + '14', color: fromCfg.color }}>
                              {fromCfg.emoji} {fromCfg.label}
                            </span>
                            <span className="text-white/40 text-sm">→</span>
                          </>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-md border font-body font-bold"
                          style={{ borderColor: toCfg.color + '50', background: toCfg.color + '18', color: toCfg.color }}>
                          {toCfg.emoji} {toCfg.label}
                        </span>
                        {h.isAiMove && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/12 border border-cyan-500/30 text-cyan-300 font-display font-black">
                            🤖 IA
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">
                        {new Date(h.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </span>
                    </div>
                    {h.movedBy && (
                      <p className="text-xs text-white/50 font-body">Por: {h.movedBy.name}</p>
                    )}
                    {h.notes && (
                      <p className="text-sm text-white/80 font-body leading-relaxed bg-white/5 rounded-lg px-3 py-2">
                        {h.notes}
                      </p>
                    )}
                    {h.aiConversation && (
                      <AiConversation messages={h.aiConversation} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function InfoRow({ label, value, phone }: { label: string; value?: string | null; phone?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/6">
      <span className="text-xs text-white/50 font-body font-semibold">{label}</span>
      {phone ? (
        <a href={waLink(value)!} target="_blank" rel="noopener noreferrer"
          className="text-sm text-emerald-400 hover:text-emerald-300 font-body font-semibold transition-colors">
          💬 {value}
        </a>
      ) : (
        <span className="text-sm text-white/90 font-body font-semibold">{value}</span>
      )}
    </div>
  )
}

function DmContact({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors truncate">
      <span>{icon}</span><span className="truncate">{label}</span>
    </a>
  )
}

function AiConversation({ messages }: { messages: any }) {
  if (!messages) return null
  const list = Array.isArray(messages) ? messages : [messages]
  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-white/8">
      <p className="text-[10px] text-cyan-400 font-display font-black uppercase tracking-widest">🤖 Conversa IA</p>
      {list.map((msg: any, i: number) => (
        <div key={i} className={cn('text-xs px-3 py-2 rounded-xl font-body',
          msg.role === 'assistant' ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-200' : 'bg-white/6 border border-white/10 text-white/80')}>
          <span className="font-bold mr-1">{msg.role === 'assistant' ? '🤖' : '👤'}</span>
          {msg.content}
        </div>
      ))}
    </div>
  )
}

// ── Product Modal ─────────────────────────────────────────
// ── Products Manager Modal ────────────────────────────────
function ProductsManagerModal({ onClose }: { onClose: () => void }) {
  const [products, setProducts]   = useState<Product[]>([])
  const [editing, setEditing]     = useState<Product | null>(null)
  const [showForm, setShowForm]   = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get('/crm/products')
    setProducts(data.products)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    await api.delete(`/crm/products/${id}`)
    toast.success('Produto removido')
    load()
  }

  if (showForm) {
    return (
      <ProductModal
        editProduct={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSaved={() => { setShowForm(false); setEditing(null); load() }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-xl glass rounded-2xl shadow-glass flex flex-col max-h-[85vh]"
      >
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h3 className="font-display text-base font-black tracking-wider text-white">📦 PRODUTOS</h3>
            <p className="text-xs text-white/50 font-body mt-0.5">{products.length} produto(s) cadastrado(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setEditing(null); setShowForm(true) }}
              className="px-3 py-2 rounded-xl text-xs font-display font-black text-white"
              style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
              + Novo Produto
            </motion.button>
            <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-space">
          {products.length === 0 ? (
            <div className="text-center py-10 text-white/30">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm font-body">Nenhum produto cadastrado.</p>
            </div>
          ) : products.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-3 p-4 rounded-xl bg-white/4 border border-white/10">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-white">{p.name}</p>
                {p.price && <p className="text-xs text-amber-400 font-body mt-0.5">💰 {p.price}</p>}
                {p.description && <p className="text-xs text-white/50 font-body mt-1 line-clamp-2">{p.description}</p>}
                {p.videoUrl && <p className="text-[11px] text-neon-violet/70 font-body mt-1 truncate">🎥 {p.videoUrl}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => { setEditing(p); setShowForm(true) }}
                  className="text-xs px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:bg-white/5 transition-all">✏️</button>
                <button onClick={() => handleDelete(p.id)}
                  className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400/60 hover:bg-red-500/10 transition-all">🗑</button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ── CRM Access Modal ──────────────────────────────────────
function CrmAccessModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string; crmAccess: boolean }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/users?limit=100').then(({ data }) => {
      setUsers(data.users ?? data.data ?? [])
      setLoading(false)
    })
  }, [])

  async function toggle(id: string, current: boolean) {
    await api.patch(`/admin/users/${id}/crm-access`, { crmAccess: !current })
    setUsers(u => u.map(x => x.id === id ? { ...x, crmAccess: !current } : x))
    toast.success(!current ? 'Acesso CRM liberado ✅' : 'Acesso CRM removido')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-lg glass rounded-2xl shadow-glass flex flex-col max-h-[80vh]"
      >
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-cyan/60 to-transparent" />
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h3 className="font-display text-base font-black tracking-wider text-white">👥 ACESSO AO CRM</h3>
            <p className="text-xs text-white/50 font-body mt-0.5">ADMINs sempre têm acesso. Libere para membros abaixo.</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-2 scrollbar-space">
          {loading ? (
            <div className="text-center py-10 text-white/30">Carregando...</div>
          ) : users.filter(u => u.role !== 'ADMIN').map(u => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/4 border border-white/10">
              <div className="min-w-0">
                <p className="text-sm font-body font-semibold text-white truncate">{u.name}</p>
                <p className="text-xs text-white/45 font-body truncate">{u.email}</p>
              </div>
              <button onClick={() => toggle(u.id, u.crmAccess)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-xl border font-display font-black transition-all ${
                  u.crmAccess
                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'border-white/15 text-white/40 hover:bg-white/5'
                }`}>
                {u.crmAccess ? '✓ Com acesso' : 'Liberar'}
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function ProductModal({ onClose, onSaved, editProduct }: {
  onClose: () => void; onSaved: () => void; editProduct?: Product | null
}) {
  const isEdit = !!editProduct
  const [name, setName]           = useState(editProduct?.name ?? '')
  const [description, setDesc]    = useState(editProduct?.description ?? '')
  const [price, setPrice]         = useState(editProduct?.price ?? '')
  const [videoUrl, setVideo]      = useState(editProduct?.videoUrl ?? '')
  const [features, setFeatures]   = useState((editProduct?.features ?? []).join('\n'))
  const [saving, setSaving]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        price: price.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        features: features.split('\n').map((f) => f.trim()).filter(Boolean),
      }
      if (isEdit) {
        await api.patch(`/crm/products/${editProduct!.id}`, body)
        toast.success('Produto atualizado ✅')
      } else {
        await api.post('/crm/products', body)
        toast.success('Produto cadastrado 📦')
      }
      onSaved(); onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar produto')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass max-h-[90vh] overflow-y-auto scrollbar-space"
      >
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-base font-black tracking-wider text-white">
              {isEdit ? '✏️ EDITAR PRODUTO' : '📦 NOVO PRODUTO'}
            </h3>
            <p className="text-sm text-white/55 font-body mt-0.5">
              {isEdit ? editProduct?.name : 'Cadastrar produto para o CRM'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            ['Nome do Produto *', name, setName, 'text', 'Ex: Plano Pro, Consultoria Anual...'],
            ['Preço / Condição', price, setPrice, 'text', 'Ex: R$ 197/mês, A partir de R$ 500...'],
            ['Link do Vídeo 🎬', videoUrl, setVideo, 'url', 'https://youtube.com/... ou qualquer link'],
          ].map(([label, val, setter, type, ph]) => (
            <div key={label as string}>
              <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1.5">{label as string}</label>
              <input value={val as string} onChange={(e) => (setter as any)(e.target.value)}
                type={type as string} placeholder={ph as string}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space" />
            </div>
          ))}

          <div>
            <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1.5">Descrição</label>
            <textarea value={description} onChange={(e) => setDesc(e.target.value)}
              rows={2} placeholder="Descreva o produto brevemente..."
              className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space resize-none" />
          </div>

          <div>
            <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1.5">
              Diferenciais / Features
              <span className="text-white/35 font-body font-normal ml-1">(um por linha)</span>
            </label>
            <textarea value={features} onChange={(e) => setFeatures(e.target.value)}
              rows={3} placeholder={"Economia de 30% no processo\nSuporte 24/7\nIntegração com qualquer sistema"}
              className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space resize-none" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-body border border-white/18 text-white/70 hover:bg-white/7 transition-all">
              Cancelar
            </button>
            <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', boxShadow: '0 0 20px rgba(217,119,6,0.4)' }}>
              {saving ? '⏳ Salvando...' : isEdit ? '✅ Salvar' : '📦 Cadastrar Produto'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── New Lead Modal ────────────────────────────────────────
function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [companyName, setCompanyName] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [segment, setSegment] = useState('')
  const [dmName, setDmName] = useState('')
  const [dmRole, setDmRole] = useState('')
  const [dmEmail, setDmEmail] = useState('')
  const [dmPhone, setDmPhone] = useState('')
  const [dmLinkedin, setDmLinkedin] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) { toast.error('Nome da empresa é obrigatório'); return }
    setSaving(true)
    try {
      await api.post('/crm/leads', {
        companyName: companyName.trim(),
        companyPhone: companyPhone.trim() || undefined,
        segment: segment || undefined,
        decisionMakers: dmName.trim()
          ? [{ name: dmName.trim(), role: dmRole.trim() || undefined, email: dmEmail.trim() || undefined, phonePersonal: dmPhone.trim() || undefined, linkedin: dmLinkedin.trim() || undefined, isPrimary: true }]
          : [],
      })
      toast.success('Lead criado 🎯')
      onCreated(); onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao criar lead')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-lg glass rounded-2xl p-6 shadow-glass max-h-[90vh] overflow-y-auto scrollbar-space"
      >
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-neon-violet/60 to-transparent" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-base font-black tracking-wider text-white">🎯 NOVO LEAD</h3>
            <p className="text-sm text-white/55 font-body mt-0.5">Criar lead manualmente</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-xs font-display font-black text-white/50 uppercase tracking-widest mb-3">🏢 Empresa</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1">Nome da Empresa *</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                  placeholder="Nome da empresa" className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>
              <div>
                <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1">Telefone Empresa (WhatsApp)</label>
                <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)}
                  placeholder="+55 11 9..." className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space" />
              </div>
              <div>
                <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1">Segmento</label>
                <select value={segment} onChange={(e) => setSegment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-body input-space">
                  <option value="">Selecione...</option>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-display font-black text-white/50 uppercase tracking-widest mb-3">👤 Decisor Principal (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Nome', dmName, setDmName, 'text', 'Nome completo'],
                ['Cargo', dmRole, setDmRole, 'text', 'CEO, Diretor...'],
                ['E-mail', dmEmail, setDmEmail, 'email', 'email@...'],
                ['Tel. Pessoal WhatsApp', dmPhone, setDmPhone, 'text', '+55 11 9...'],
                ['LinkedIn', dmLinkedin, setDmLinkedin, 'url', 'https://linkedin.com/in/...'],
              ].map(([label, val, setter, type, ph]) => (
                <div key={label as string} className={label === 'LinkedIn' ? 'col-span-2' : ''}>
                  <label className="block text-[11px] font-display font-black text-white/60 uppercase tracking-widest mb-1">{label as string}</label>
                  <input value={val as string} onChange={(e) => (setter as any)(e.target.value)}
                    type={type as string} placeholder={ph as string}
                    className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-body border border-white/18 text-white/70 hover:bg-white/7 transition-all">
              Cancelar
            </button>
            <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex-[2] py-2.5 rounded-xl text-sm font-display font-black text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
              {saving ? '⏳ Criando...' : '🎯 Criar Lead'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── Skills Modal ──────────────────────────────────────────
function SkillsModal({ onClose }: { onClose: () => void }) {
  const [skills, setSkills]       = useState<Skill[]>([])
  const [editing, setEditing]     = useState<Skill | null>(null)
  const [creating, setCreating]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ name: '', description: '', content: '', trigger: '' })

  const load = useCallback(async () => {
    const { data } = await api.get('/crm/skills')
    setSkills(data.skills)
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ name: '', description: '', content: '', trigger: '' })
    setEditing(null)
    setCreating(true)
  }

  function openEdit(s: Skill) {
    setForm({ name: s.name, description: s.description ?? '', content: s.content, trigger: s.trigger ?? '' })
    setEditing(s)
    setCreating(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) { toast.error('Nome e conteúdo são obrigatórios'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/crm/skills/${editing.id}`, form)
        toast.success('Skill atualizada ✅')
      } else {
        await api.post('/crm/skills', form)
        toast.success('Skill criada ✅')
      }
      setCreating(false); await load()
    } catch { toast.error('Erro ao salvar skill') } finally { setSaving(false) }
  }

  async function toggleActive(s: Skill) {
    await api.patch(`/crm/skills/${s.id}`, { isActive: !s.isActive })
    await load()
  }

  async function handleDelete(id: string) {
    await api.delete(`/crm/skills/${id}`)
    toast.success('Skill removida')
    await load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-2xl glass rounded-2xl shadow-glass flex flex-col max-h-[88vh]"
      >
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div>
            <h3 className="font-display text-base font-black tracking-wider text-white">🧠 SKILLS DE VENDAS</h3>
            <p className="text-xs text-white/50 font-body mt-0.5">Técnicas injetadas no prompt do Claude Opus 4.7</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-black text-white"
              style={{ background: 'linear-gradient(135deg,#059669,#06b6d4)' }}>
              + Nova Skill
            </motion.button>
            <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-space">
          {/* Form criar/editar */}
          {creating && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/30 space-y-3 mb-4">
              <p className="text-xs font-display font-black text-emerald-400 uppercase tracking-widest">
                {editing ? '✏️ Editar Skill' : '✨ Nova Skill'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-display font-black text-white/50 uppercase tracking-widest mb-1">Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Tratamento de Objeção de Preço"
                    className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                </div>
                <div>
                  <label className="block text-[11px] font-display font-black text-white/50 uppercase tracking-widest mb-1">Gatilho (quando usar)</label>
                  <input value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                    placeholder="Ex: lead mencionar preço"
                    className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                </div>
                <div>
                  <label className="block text-[11px] font-display font-black text-white/50 uppercase tracking-widest mb-1">Descrição</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Breve descrição"
                    className="w-full px-3 py-2 rounded-xl text-sm font-body input-space" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-display font-black text-white/50 uppercase tracking-widest mb-1">Técnica / Conteúdo * <span className="text-white/30 normal-case font-body font-normal">(texto injetado no prompt do Claude)</span></label>
                  <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Descreva a técnica em detalhes. Ex: Quando o decisor mencionar preço antes da hora, responda: 'Antes de falar em investimento, quero garantir que estamos falando da solução certa para você...'"
                    rows={5} className="w-full px-3 py-2 rounded-xl text-sm font-body input-space resize-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCreating(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-body border border-white/15 text-white/60 hover:bg-white/5 transition-all">
                  Cancelar
                </button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleSave} disabled={saving}
                  className="flex-[2] py-2 rounded-xl text-sm font-display font-black text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#059669,#06b6d4)' }}>
                  {saving ? '⏳ Salvando...' : '✅ Salvar Skill'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Lista de skills */}
          {skills.length === 0 && !creating ? (
            <div className="text-center py-12 text-white/30">
              <p className="text-4xl mb-3">🧠</p>
              <p className="text-sm font-body">Nenhuma skill criada ainda.</p>
              <p className="text-xs font-body mt-1">Clique em &quot;+ Nova Skill&quot; para começar.</p>
            </div>
          ) : (
            skills.map((s) => (
              <motion.div key={s.id} layout
                className={`p-4 rounded-xl border transition-all ${s.isActive ? 'bg-white/4 border-white/10' : 'bg-white/2 border-white/5 opacity-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
                      <p className="text-sm font-display font-bold text-white truncate">{s.name}</p>
                    </div>
                    {s.trigger && (
                      <p className="text-[11px] text-emerald-400/80 font-body mb-1">⚡ {s.trigger}</p>
                    )}
                    {s.description && (
                      <p className="text-xs text-white/50 font-body mb-2">{s.description}</p>
                    )}
                    <p className="text-xs text-white/35 font-body line-clamp-2 italic">{s.content}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => toggleActive(s)}
                      title={s.isActive ? 'Desativar' : 'Ativar'}
                      className={`text-xs px-2 py-1 rounded-lg border transition-all ${s.isActive ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-white/15 text-white/40 hover:bg-white/5'}`}>
                      {s.isActive ? '✓ Ativo' : 'Inativo'}
                    </button>
                    <button onClick={() => openEdit(s)}
                      className="text-xs px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:bg-white/5 transition-all">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400/60 hover:bg-red-500/10 transition-all">
                      🗑
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Main CRM Page ─────────────────────────────────────────
export default function CrmPage() {
  const { user }  = useAuthStore()
  const router    = useRouter()
  const [kanban, setKanban]     = useState<Record<CrmStage, Lead[]> | null>(null)
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [openLeadId, setOpenLeadId]     = useState<string | null>(null)
  const [showNewLead, setShowNewLead]   = useState(false)
  const [showProduct, setShowProduct]   = useState(false)
  const [editProduct, setEditProduct]   = useState<Product | null>(null)
  const [showSkills, setShowSkills]         = useState(false)
  const [showProducts, setShowProducts]     = useState(false)
  const [showCrmAccess, setShowCrmAccess]   = useState(false)
  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.replace('/board'); return }
  }, [user, router])

  const fetchLeads = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/leads')
      setKanban(data.kanban)
      setTotal(data.total)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? 'Erro desconhecido'
      toast.error(`CRM: ${msg}`)
    }
    finally { setLoading(false) }
  }, [])

  async function deleteLead(id: string) {
    try {
      await api.delete(`/crm/leads/${id}`)
      toast.success('Lead arquivado')
      fetchLeads()
    } catch { toast.error('Erro ao arquivar lead') }
  }

  useEffect(() => { fetchLeads() }, [fetchLeads])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin')}
                className="text-white/40 hover:text-white transition-colors text-sm font-body">
                ← Painel Admin
              </button>
              <span className="text-white/20">/</span>
              <div>
                <p className="text-xs font-display font-black tracking-[0.3em] text-neon-violet/80 uppercase">⚙ Mission Control</p>
                <h1 className="font-display text-2xl font-black text-white tracking-wide">CRM — Pipeline de Vendas</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/55 font-body font-semibold">{total} lead{total !== 1 ? 's' : ''}</span>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowCrmAccess(true)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-display font-black border border-neon-cyan/40 text-neon-cyan/80 hover:bg-neon-cyan/8 transition-all">
                👥 Acesso
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowSkills(true)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-display font-black border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/12 transition-all">
                🧠 Skills
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowProducts(true)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-display font-black border border-amber-500/40 text-amber-300 hover:bg-amber-500/12 transition-all">
                📦 Produtos
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowNewLead(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-display font-black text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.45)' }}>
                + Novo Lead
              </motion.button>
            </div>
          </div>
        </div>

        {/* Kanban */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-5xl">🛸</motion.div>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 px-6">
            <div className="flex gap-4 h-full" style={{ minWidth: `${STAGES.length * 280}px` }}>
              {STAGES.map((stage) => {
                const leads = kanban?.[stage.id] ?? []
                return (
                  <div key={stage.id} className="flex flex-col w-[268px] shrink-0">
                    {/* Column header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                        <span className="text-xs font-display font-black text-white tracking-wide">{stage.label}</span>
                      </div>
                      <span className="text-xs text-white/45 font-mono font-bold px-2 py-0.5 rounded-md bg-white/6">
                        {leads.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto scrollbar-space space-y-2 pr-1"
                      style={{ borderTop: `2px solid ${stage.color}50`, paddingTop: '10px' }}>
                      {leads.length === 0 && (
                        <div className="text-center py-8 text-white/20 text-xs font-body">
                          Nenhum lead
                        </div>
                      )}
                      {leads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} onClick={() => setOpenLeadId(lead.id)} onDelete={() => { deleteLead(lead.id) }} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modais */}
      <AnimatePresence>
        {openLeadId && (
          <LeadModal
            key={openLeadId}
            leadId={openLeadId}
            onClose={() => setOpenLeadId(null)}
            onUpdated={fetchLeads}
          />
        )}
        {showNewLead && (
          <NewLeadModal
            onClose={() => setShowNewLead(false)}
            onCreated={fetchLeads}
          />
        )}
        {showProduct && (
          <ProductModal
            editProduct={editProduct}
            onClose={() => { setShowProduct(false); setEditProduct(null) }}
            onSaved={fetchLeads}
          />
        )}
        {showSkills && (
          <SkillsModal onClose={() => setShowSkills(false)} />
        )}
        {showProducts && (
          <ProductsManagerModal onClose={() => setShowProducts(false)} />
        )}
        {showCrmAccess && (
          <CrmAccessModal onClose={() => setShowCrmAccess(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
