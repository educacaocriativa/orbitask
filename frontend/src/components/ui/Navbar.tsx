'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useBoardStore } from '@/stores/boardStore'
import { GlobalSearch } from './GlobalSearch'
import { NotificationCenter } from './NotificationCenter'
import { Avatar } from './Avatar'
import { AnnouncementCreateModal } from '@/components/announcements/AnnouncementCreateModal'
import { AnnouncementInbox } from '@/components/announcements/AnnouncementInbox'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export function Navbar() {
  const { user, logout }  = useAuthStore()
  const { board }         = useBoardStore()
  const [menuOpen, setMenuOpen]           = useState(false)
  const [showCreate, setShowCreate]       = useState(false)
  const [showInbox, setShowInbox]         = useState(false)
  const [unreadCount, setUnreadCount]     = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Polling de comunicados não lidos a cada 60s
  useEffect(() => {
    function fetchUnread() {
      api.get('/announcements/me')
        .then(({ data }) => {
          const count = data.announcements.filter((a: { isRead: boolean }) => !a.isRead).length
          setUnreadCount(count)
        })
        .catch(() => null)
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    try { await logout() } catch { toast.error('Erro ao sair') }
  }

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 h-14 flex items-center px-4 gap-3"
        style={{
          background:     'rgba(7,3,26,0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom:   '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* ── Logo ───────────────────────────────────── */}
        <Link href="/board" className="flex items-center gap-2.5 shrink-0 group">
          <motion.div
            whileHover={{ scale: 1.08 }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}
          >
            🚀
          </motion.div>
          <span className="font-display font-bold text-sm tracking-widest text-white/90 hidden sm:block group-hover:text-white transition-colors">
            ORBITASK
          </span>
        </Link>

        {/* ── Breadcrumb ─────────────────────────────── */}
        {board && (
          <>
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <span className="text-white/20 text-xs hidden sm:block">/</span>
            <span className="text-sm font-body text-white/50 truncate max-w-[160px] hidden sm:block">
              {board.title}
            </span>
          </>
        )}

        {/* ── Search ─────────────────────────────────── */}
        <div className="ml-3 hidden sm:block">
          <GlobalSearch />
        </div>

        {/* ── Right cluster ──────────────────────────── */}
        <div className="ml-auto flex items-center gap-2">

          {/* WhatsApp indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/3 border border-white/6">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-emerald animate-pulse-slow" />
            <span className="text-[11px] text-white/30 font-body">WA</span>
          </div>

          {/* Notifications */}
          <NotificationCenter />

          {/* Botão de comunicados */}
          <button
            onClick={() => setShowInbox(true)}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 transition-colors"
            title="Comunicados"
          >
            <span className="text-base">📢</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Botão novo comunicado (admin) */}
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setShowCreate(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-display tracking-wider text-violet-400/80 border border-violet-500/20 hover:border-violet-500/45 hover:bg-violet-500/5 transition-all duration-200"
              title="Novo comunicado"
            >
              + Comunicado
            </button>
          )}

          {/* CRM badge — admin ou usuário com acesso */}
          {(user?.role === 'ADMIN' || user?.crmAccess) && (
            <Link
              href="/admin/crm"
              className={cn(
                'hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg',
                'font-display tracking-wider text-emerald-400/80',
                'border border-emerald-500/20 hover:border-emerald-500/45',
                'hover:bg-emerald-500/5 transition-all duration-200',
              )}
            >
              🎯 CRM
            </Link>
          )}

          {/* Admin badge */}
          {user?.role === 'ADMIN' && (
            <Link
              href="/admin"
              className={cn(
                'hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg',
                'font-display tracking-wider text-neon-amber/80',
                'border border-neon-amber/20 hover:border-neon-amber/45',
                'hover:bg-neon-amber/5 transition-all duration-200',
              )}
            >
              ⚙ ADMIN
            </Link>
          )}

          {/* Avatar dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 group"
              aria-label="Menu do usuário"
            >
              <Avatar
                name={user?.name ?? 'U'}
                src={user?.avatarUrl}
                size="sm"
                className="ring-1 ring-white/10 group-hover:ring-neon-violet/50 transition-all"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-body text-white/70 leading-none">{user?.name?.split(' ')[0]}</div>
                <div className="text-[10px] text-white/30 mt-0.5 font-body">{user?.role}</div>
              </div>
              <motion.span
                animate={{ rotate: menuOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-white/25 text-xs hidden md:block"
              >
                ▾
              </motion.span>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.93, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-52 glass rounded-xl p-1.5 shadow-glass"
                  style={{ zIndex: 100 }}
                >
                  {/* User header */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 mb-1">
                    <Avatar name={user?.name ?? 'U'} src={user?.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-body text-white/80 truncate">{user?.name}</div>
                      <div className="text-[10px] font-body text-white/30 truncate">{user?.email}</div>
                    </div>
                  </div>

                  <MenuItem href="/board"   icon="🛸" label="Missões"      onClick={() => setMenuOpen(false)} />
                  <MenuItem href="/profile" icon="👨‍🚀" label="Meu Perfil"  onClick={() => setMenuOpen(false)} />
                  {user?.role === 'ADMIN' && (
                    <MenuItem href="/admin" icon="⚙️" label="Painel Admin" onClick={() => setMenuOpen(false)} />
                  )}

                  {/* Comunicados no menu */}
                  <button
                    onClick={() => { setShowInbox(true); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <span className="text-base">📢</span>
                    <span>Comunicados</span>
                    {unreadCount > 0 && (
                      <span className="ml-auto w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  <div className="border-t border-white/5 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-neon-pink/60 hover:text-neon-pink hover:bg-neon-pink/5 transition-all"
                    >
                      <span>🚪</span>
                      <span>Encerrar Missão</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {/* Modais de comunicados */}
      <AnimatePresence>
        {showCreate && (
          <AnnouncementCreateModal
            onClose={() => setShowCreate(false)}
            onCreated={() => setUnreadCount(0)}
          />
        )}
        {showInbox && (
          <AnnouncementInbox onClose={() => { setShowInbox(false); setUnreadCount(0) }} />
        )}
      </AnimatePresence>
    </>
  )
}

function MenuItem({ href, icon, label, onClick }: {
  href: string; icon: string; label: string; onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-white/60 hover:text-white hover:bg-white/5 transition-all"
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </Link>
  )
}
