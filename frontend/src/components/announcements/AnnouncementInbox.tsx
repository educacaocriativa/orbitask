'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

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
  isRead: boolean
  createdAt: string
  createdBy: { id: string; name: string; avatarUrl?: string }
  replies: Reply[]
}

interface Props {
  onClose: () => void
}

export function AnnouncementInbox({ onClose }: Props) {
  const { user } = useAuthStore()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selected, setSelected] = useState<Announcement | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/announcements/me')
      .then(({ data }) => setAnnouncements(data.announcements))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  async function handleOpen(a: Announcement) {
    setSelected(a)
    setReplyText('')
    if (!a.isRead) {
      await api.post(`/announcements/${a.id}/read`).catch(() => null)
      setAnnouncements((prev) => prev.map((x) => x.id === a.id ? { ...x, isRead: true } : x))
    }
  }

  async function handleReply() {
    if (!selected || !replyText.trim()) return
    setSending(true)
    try {
      const { data } = await api.post(`/announcements/${selected.id}/replies`, {
        content: replyText.trim(),
      })
      const updated = { ...selected, replies: [...selected.replies, data.reply] }
      setSelected(updated)
      setAnnouncements((prev) => prev.map((a) => a.id === selected.id ? updated : a))
      setReplyText('')
    } catch {
      // silently ignore
    } finally {
      setSending(false)
    }
  }

  const unreadCount = announcements.filter((a) => !a.isRead).length

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
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full max-w-2xl h-[600px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-violet-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-cyan-400 to-violet-500 flex-shrink-0" />

        <div className="flex flex-1 overflow-hidden">
          {/* Lista de comunicados */}
          <div className="w-72 border-r border-slate-700/50 flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">📢 Comunicados</h2>
                {unreadCount > 0 && (
                  <p className="text-xs text-violet-400">{unreadCount} não lido(s)</p>
                )}
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-slate-500 text-sm">Carregando...</div>
              ) : announcements.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">Nenhum comunicado</div>
              ) : (
                announcements.map((a) => {
                  const lastReply = a.replies[a.replies.length - 1]
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleOpen(a)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors ${
                        selected?.id === a.id ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!a.isRead && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          {/* Sender name — quem iniciou a conversa */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-5 h-5 rounded-full bg-violet-500/30 border border-violet-500/40 flex items-center justify-center text-[10px] font-bold text-violet-300 flex-shrink-0">
                              {a.createdBy.name[0].toUpperCase()}
                            </div>
                            <span className="text-[11px] font-semibold text-violet-300 truncate">
                              {a.createdBy.name}
                            </span>
                          </div>

                          {/* Title */}
                          <p className={`text-sm truncate ${!a.isRead ? 'text-white font-semibold' : 'text-slate-300'}`}>
                            {a.title}
                          </p>

                          {/* Last reply preview */}
                          {lastReply ? (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              <span className="text-slate-400 font-medium">{lastReply.author.name.split(' ')[0]}:</span>{' '}
                              {lastReply.content}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          )}

                          {/* Reply count */}
                          {a.replies.length > 0 && (
                            <p className="text-[10px] text-violet-400/70 mt-0.5">
                              💬 {a.replies.length} resposta{a.replies.length > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Detalhe do comunicado */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Selecione um comunicado
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-slate-700/50 flex-shrink-0">
                  <h3 className="text-base font-bold text-white mb-2">{selected.title}</h3>

                  {/* Participants */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sender */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25">
                      <div className="w-4 h-4 rounded-full bg-violet-500/40 flex items-center justify-center text-[9px] font-bold text-violet-200">
                        {selected.createdBy.name[0].toUpperCase()}
                      </div>
                      <span className="text-[11px] font-semibold text-violet-300">
                        {selected.createdBy.name}
                      </span>
                      <span className="text-[9px] text-violet-400/60 uppercase tracking-wider">criador</span>
                    </div>

                    {/* Unique reply authors (excluding sender) */}
                    {[...new Map(
                      selected.replies
                        .filter((r) => r.author.id !== selected.createdBy.id)
                        .map((r) => [r.author.id, r.author])
                    ).values()].map((author) => (
                      <div key={author.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-700/40 border border-slate-600/30">
                        <div className="w-4 h-4 rounded-full bg-slate-500/50 flex items-center justify-center text-[9px] font-bold text-slate-200">
                          {author.name[0].toUpperCase()}
                        </div>
                        <span className="text-[11px] font-medium text-slate-300">{author.name.split(' ')[0]}</span>
                      </div>
                    ))}

                    <span className="text-[10px] text-slate-600 ml-auto">
                      {new Date(selected.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Mensagem principal */}
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {selected.content}
                    </p>
                  </div>

                  {/* Respostas */}
                  {selected.replies.map((r) => (
                    <div
                      key={r.id}
                      className={`flex gap-2 ${r.author.id === user?.id ? 'flex-row-reverse' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {r.author.name[0].toUpperCase()}
                      </div>
                      <div
                        className={`px-3 py-2 rounded-xl text-xs max-w-[75%] ${
                          r.author.role === 'ADMIN'
                            ? 'bg-violet-500/20 border border-violet-500/30 text-violet-200'
                            : 'bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        <p className="font-semibold mb-0.5 text-[10px] opacity-70">{r.author.name}</p>
                        <p>{r.content}</p>
                        <p className="text-[10px] opacity-50 mt-1">
                          {new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input de resposta */}
                <div className="p-3 border-t border-slate-700/50 flex gap-2 flex-shrink-0">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                    placeholder="Responder..."
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
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
