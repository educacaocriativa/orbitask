'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'
import { cn, formatRelativeDate } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  status: string
  scheduledFor: string
  sentAt?: string
  payload: Record<string, unknown>
  card?: { id: string; title: string }
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  CARD_MOVED:        { icon: '🚀', label: 'Card movido',       color: '#7c3aed' },
  MENTION:           { icon: '📎', label: 'Menção',            color: '#06b6d4' },
  DEADLINE_EXPIRED:  { icon: '⚠️', label: 'Prazo expirado',    color: '#ef4444' },
  DEADLINE_WARNING:  { icon: '⏱',  label: 'Prazo se aproxima', color: '#f59e0b' },
  CARD_ASSIGNED:     { icon: '🃏', label: 'Card atribuído',    color: '#10b981' },
}

export function NotificationCenter() {
  const [open, setOpen]                 = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread]             = useState(0)
  const [loading, setLoading]           = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    fetchNotifications()
    // Poll every 30s for new notifications
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications?limit=20')
      setNotifications(data.notifications ?? [])
      setUnread(data.unread ?? 0)
    } catch { /* ignore — endpoint may not exist yet */ }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all')
      setUnread(0)
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open && unread > 0) markAllRead() }}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-xl transition-all',
          'border border-white/8 hover:border-white/20',
          open ? 'bg-white/8' : 'bg-white/3 hover:bg-white/6',
        )}
        aria-label="Notificações"
      >
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-pink flex items-center justify-center text-[9px] font-mono text-white font-bold"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 glass rounded-2xl overflow-hidden shadow-glass z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-semibold tracking-wider text-white/80">
                  TRANSMISSÕES
                </span>
                {unread > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-neon-pink/20 border border-neon-pink/30 text-neon-pink font-mono">
                    {unread} nova{unread > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-white/30 hover:text-white/60 font-body transition-colors"
                >
                  Marcar lidas
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[420px] overflow-y-auto scrollbar-space">
              {notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-4xl mb-3 opacity-30">🛸</div>
                  <p className="text-xs text-white/20 font-body">Nenhuma transmissão recebida</p>
                </div>
              )}

              {notifications.map((notif, i) => {
                const meta = TYPE_META[notif.type] ?? { icon: '📡', label: notif.type, color: '#888' }
                const isNew = notif.status === 'SENT' && !notif.sentAt

                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 border-b border-white/4 last:border-0',
                      'hover:bg-white/3 transition-colors cursor-default',
                      isNew && 'bg-white/2',
                    )}
                  >
                    {/* Icon */}
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5"
                      style={{ background: meta.color + '18', border: `1px solid ${meta.color}30` }}
                    >
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-display tracking-wide text-white/70"
                          style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        {isNew && (
                          <div className="w-1.5 h-1.5 rounded-full bg-neon-pink" />
                        )}
                      </div>
                      {notif.card && (
                        <p className="text-xs font-body text-white/55 truncate">{notif.card.title}</p>
                      )}
                      <p className="text-[10px] text-white/25 font-body mt-0.5">
                        {formatRelativeDate(notif.scheduledFor)}
                      </p>
                    </div>

                    {/* Status */}
                    <div className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded-md border font-mono shrink-0',
                      notif.status === 'SENT'    ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8' :
                      notif.status === 'FAILED'  ? 'text-red-400 border-red-500/20 bg-red-500/8' :
                      'text-white/25 border-white/8',
                    )}>
                      {notif.status === 'SENT' ? '✓' : notif.status === 'FAILED' ? '✗' : '…'}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

