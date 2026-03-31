'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

interface Board { id: string; title: string }
interface Card  { id: string; title: string }
interface User  { id: string; name: string; email: string }

interface Props {
  onClose: () => void
  onCreated: () => void
}

type TargetType = 'ALL' | 'BOARD' | 'CARD' | 'USER'

export function AnnouncementCreateModal({ onClose, onCreated }: Props) {
  const [title, setTitle]           = useState('')
  const [content, setContent]       = useState('')
  const [targetType, setTargetType] = useState<TargetType>('ALL')
  const [targetId, setTargetId]     = useState('')
  const [sending, setSending]       = useState(false)

  const [boards, setBoards]           = useState<Board[]>([])
  const [cards, setCards]             = useState<Card[]>([])
  const [users, setUsers]             = useState<User[]>([])
  const [selectedBoard, setSelectedBoard] = useState('')
  const [loadingOptions, setLoadingOptions] = useState(false)

  // Carrega opções ao trocar targetType
  useEffect(() => {
    setTargetId('')
    setSelectedBoard('')
    setCards([])

    if (targetType === 'BOARD') {
      setLoadingOptions(true)
      api.get('/announcements/admin/boards')
        .then(({ data }) => setBoards(data.boards ?? []))
        .catch(() => toast.error('Erro ao carregar missões'))
        .finally(() => setLoadingOptions(false))
    }
    if (targetType === 'USER') {
      setLoadingOptions(true)
      api.get('/users')
        .then(({ data }) => setUsers(data.users ?? []))
        .catch(() => toast.error('Erro ao carregar usuários'))
        .finally(() => setLoadingOptions(false))
    }
    if (targetType === 'CARD') {
      setLoadingOptions(true)
      api.get('/announcements/admin/boards')
        .then(({ data }) => setBoards(data.boards ?? []))
        .catch(() => toast.error('Erro ao carregar missões'))
        .finally(() => setLoadingOptions(false))
    }
  }, [targetType])

  // Ao selecionar board para CARD, carrega os cards desse board
  useEffect(() => {
    if (targetType !== 'CARD' || !selectedBoard) return
    setTargetId('')
    setLoadingOptions(true)
    api.get(`/announcements/admin/cards?boardId=${selectedBoard}`)
      .then(({ data }) => setCards(data.cards ?? []))
      .catch(() => toast.error('Erro ao carregar cards'))
      .finally(() => setLoadingOptions(false))
  }, [selectedBoard, targetType])

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) {
      toast.error('Preencha título e mensagem.')
      return
    }
    if (targetType !== 'ALL' && !targetId) {
      toast.error('Selecione o destinatário.')
      return
    }
    setSending(true)
    try {
      await api.post('/announcements', {
        title: title.trim(),
        content: content.trim(),
        targetType,
        targetId: targetType === 'ALL' ? undefined : targetId,
      })
      toast.success('Comunicado enviado!')
      onCreated()
      onClose()
    } catch {
      toast.error('Erro ao enviar comunicado.')
    } finally {
      setSending(false)
    }
  }

  const targetLabels: Record<TargetType, string> = {
    ALL: 'Todos',
    BOARD: 'Missão',
    CARD: 'Card',
    USER: 'Usuário',
  }

  const targetIcons: Record<TargetType, string> = {
    ALL: '🌐',
    BOARD: '🛸',
    CARD: '🃏',
    USER: '👤',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative w-full max-w-md bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-violet-500/40 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-cyan-400 to-violet-500" />

        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">📢</span>
            <div>
              <h2 className="text-lg font-bold text-white">Novo Comunicado</h2>
              <p className="text-xs text-slate-400">Envie uma mensagem para os usuários</p>
            </div>
          </div>

          {/* Título */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Atualização importante do sistema"
              className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60"
            />
          </div>

          {/* Mensagem */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Mensagem</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite o comunicado..."
              rows={4}
              className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60 resize-none"
            />
          </div>

          {/* Tipo de destinatário */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">Destinatário</label>
            <div className="grid grid-cols-4 gap-2">
              {(['ALL', 'BOARD', 'CARD', 'USER'] as TargetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={`py-2 text-xs rounded-lg border transition-all flex flex-col items-center gap-1 ${
                    targetType === t
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'border-slate-600/50 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span>{targetIcons[t]}</span>
                  <span>{targetLabels[t]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seleção de destinatário específico */}
          {loadingOptions && (
            <p className="text-xs text-slate-500 text-center py-2">Carregando...</p>
          )}

          {!loadingOptions && targetType === 'BOARD' && (
            <div className="mb-4">
              <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Selecione a Missão</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60"
              >
                <option value="">-- Selecione uma missão --</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>
          )}

          {!loadingOptions && targetType === 'CARD' && (
            <div className="mb-4 space-y-2">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Selecione a Missão</label>
                <select
                  value={selectedBoard}
                  onChange={(e) => setSelectedBoard(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60"
                >
                  <option value="">-- Selecione uma missão --</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              </div>
              {selectedBoard && (
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Selecione o Card</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60"
                  >
                    <option value="">-- Selecione um card --</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {!loadingOptions && targetType === 'USER' && (
            <div className="mb-4">
              <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Selecione o Usuário</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60"
              >
                <option value="">-- Selecione um usuário --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-600/50 hover:border-slate-500 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={sending}
              className="flex-1 py-2 text-sm bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 text-white rounded-lg font-semibold transition-all"
            >
              {sending ? 'Enviando...' : 'Enviar 📢'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
