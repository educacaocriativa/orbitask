'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

interface Reply {
  id: string
  content: string
  createdAt: string
  author: { id: string; name: string; avatarUrl?: string; role: string }
}

interface Announcement {
  id: string
  title: string
  content: string
  targetType: string
  isRead: boolean
  createdAt: string
  createdBy: { id: string; name: string; avatarUrl?: string }
  replies: Reply[]
}

interface Props {
  announcements: Announcement[]
  onClose: () => void
}

export function AnnouncementModal({ announcements, onClose }: Props) {
  const { user } = useAuthStore()
  const [index, setIndex] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [localAnnouncements, setLocalAnnouncements] = useState(announcements)

  const current = localAnnouncements[index]

  async function markRead(id: string) {
    await api.post(`/announcements/${id}/read`).catch(() => null)
    setLocalAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    )
  }

  async function handleReply() {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const { data } = await api.post(`/announcements/${current.id}/replies`, {
        content: replyText.trim(),
      })
      setLocalAnnouncements((prev) =>
        prev.map((a) =>
          a.id === current.id
            ? { ...a, replies: [...a.replies, data.reply] }
            : a
        )
      )
      setReplyText('')
      toast.success('Resposta enviada!')
    } catch {
      toast.error('Erro ao enviar resposta.')
    } finally {
      setSending(false)
    }
  }

  async function handleNext() {
    await markRead(current.id)
    if (index < localAnnouncements.length - 1) {
      setIndex(index + 1)
      setReplyText('')
    } else {
      onClose()
    }
  }

  async function handleClose() {
    await markRead(current.id)
    onClose()
  }

  if (!current) return null

  const isLast = index === localAnnouncements.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        key={current.id}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-full max-w-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-violet-500/50 rounded-2xl shadow-2xl shadow-violet-500/20 overflow-hidden"
      >
        {/* Glow top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-cyan-400 to-violet-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-xl">
                📢
              </div>
              <div>
                <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest">
                  Comunicado oficial
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  por {current.createdBy.name} · {new Date(current.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            {localAnnouncements.length > 1 && (
              <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                {index + 1} / {localAnnouncements.length}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>

          {/* Content */}
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-5">
            {current.content}
          </p>

          {/* Replies */}
          {current.replies.length > 0 && (
            <div className="mb-4 space-y-2 max-h-40 overflow-y-auto pr-1">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Respostas</p>
              {current.replies.map((r) => (
                <div
                  key={r.id}
                  className={`flex gap-2 ${r.author.id === user?.id ? 'flex-row-reverse' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {r.author.name[0].toUpperCase()}
                  </div>
                  <div
                    className={`px-3 py-2 rounded-xl text-xs max-w-[80%] ${
                      r.author.role === 'ADMIN'
                        ? 'bg-violet-500/20 border border-violet-500/30 text-violet-200'
                        : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    <p className="font-semibold mb-0.5 text-[10px] opacity-70">{r.author.name}</p>
                    <p>{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          <div className="flex gap-2 mb-5">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder="Responder ao comunicado..."
              className="flex-1 bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60"
            />
            <button
              onClick={handleReply}
              disabled={sending || !replyText.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
            >
              {sending ? '...' : '↑'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-600/50 hover:border-slate-500 rounded-lg transition-colors"
            >
              Fechar
            </button>
            {!isLast && (
              <button
                onClick={handleNext}
                className="flex-1 py-2 text-sm bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white rounded-lg font-semibold transition-all"
              >
                Próximo →
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
