'use client'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Navbar } from '@/components/ui/Navbar'
import { useAuthStore } from '@/stores/authStore'
import api from '@/lib/api'
import { cn, getInitials, formatRelativeDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ProfileData {
  id: string; name: string; email: string; role: string
  avatarUrl?: string; phoneWhatsapp?: string
  lastAccessAt?: string; createdAt: string
  _count: { createdCards: number; accessLogs: number }
}

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [profile, setProfile]   = useState<ProfileData | null>(null)
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/users/me')
      .then(({ data }) => {
        setProfile(data.user)
        setName(data.user.name)
        setPhone(data.user.phoneWhatsapp ?? '')
        setAvatarUrl(data.user.avatarUrl)
      })
      .catch(() => toast.error('Erro ao carregar perfil'))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const { data } = await api.patch('/users/me', {
        name: name.trim(),
        phoneWhatsapp: phone.trim() || null,
      })
      setProfile((p) => p ? { ...p, ...data.user } : p)
      setUser({ ...user!, name: data.user.name })
      toast.success('Perfil atualizado! 🚀')
      setEditing(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAvatarUrl(data.avatarUrl)
      toast.success('Avatar atualizado! 🛸')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  const ROLE_STYLES: Record<string, string> = {
    ADMIN:  'text-neon-amber bg-neon-amber/10 border-neon-amber/25',
    MEMBER: 'text-neon-cyan/80 bg-neon-cyan/8 border-neon-cyan/20',
    GUEST:  'text-white/40 bg-white/5 border-white/10',
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Header */}
          <div>
            <p className="text-xs font-display tracking-[0.3em] text-neon-violet/60 mb-1 uppercase">👨‍🚀 Cosmonauta</p>
            <h1 className="font-display text-2xl font-bold text-white">Meu Perfil</h1>
          </div>

          {/* Profile card */}
          <div className="glass rounded-2xl p-6 border border-white/6 shadow-glass">
            <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-neon-violet/40 to-transparent" style={{ position: 'relative' }} />

            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden ring-2 ring-neon-violet/30 cursor-pointer group"
                  style={{ background: 'linear-gradient(135deg, #7c3aed30, #06b6d430)' }}
                  onClick={() => fileRef.current?.click()}
                >
                  {avatarUrl && !avatarUrl.startsWith('avatars/') ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-display font-bold text-2xl text-white/70">
                      {getInitials(profile?.name ?? user?.name ?? 'U')}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                    <span className="text-xl">{uploading ? '⏳' : '📷'}</span>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-neon-emerald flex items-center justify-center text-[8px]">✓</div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-display text-white/35 uppercase tracking-widest mb-1">Nome</label>
                      <input value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm font-body bg-white/5 border border-white/10 text-white focus:outline-none focus:border-neon-violet/40 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-display text-white/35 uppercase tracking-widest mb-1">
                        WhatsApp <span className="text-white/20 normal-case font-body">(ex: +5511999999999)</span>
                      </label>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)}
                        placeholder="+5511999999999"
                        className="w-full px-3 py-2 rounded-xl text-sm font-body bg-white/5 border border-white/10 text-white focus:outline-none focus:border-neon-emerald/40 transition-all" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-body border border-white/10 text-white/40 hover:bg-white/5 transition-all">
                        Cancelar
                      </button>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 rounded-lg text-xs font-display tracking-wider text-white disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                        {saving ? '⚡ Salvando...' : '💾 Salvar'}
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-display text-lg font-semibold text-white">{profile?.name ?? user?.name}</h2>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-display tracking-wide', ROLE_STYLES[profile?.role ?? 'MEMBER'])}>
                        {profile?.role}
                      </span>
                    </div>
                    <p className="text-sm text-white/40 font-body">{profile?.email}</p>
                    <p className={cn('text-sm font-body mt-0.5', profile?.phoneWhatsapp ? 'text-neon-emerald/70' : 'text-white/20 italic')}>
                      {profile?.phoneWhatsapp ? `📱 ${profile.phoneWhatsapp}` : 'WhatsApp não cadastrado'}
                    </p>
                    <button onClick={() => setEditing(true)}
                      className="mt-2 text-xs text-neon-violet/60 hover:text-neon-violet font-body transition-colors">
                      ✏️ Editar perfil
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {profile && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Cards Criados', value: profile._count.createdCards, icon: '🃏' },
                { label: 'Ações Registradas', value: profile._count.accessLogs, icon: '📡' },
                { label: 'Membro desde', value: new Date(profile.createdAt).getFullYear(), icon: '🛸' },
              ].map((s) => (
                <div key={s.label} className="glass rounded-2xl p-4 border border-white/6 text-center">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="font-display text-xl font-bold text-white">{s.value}</div>
                  <div className="text-[11px] text-white/30 font-body mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Last access */}
          {profile?.lastAccessAt && (
            <div className="glass rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
              <span className="text-white/30 text-sm">🕐</span>
              <span className="text-xs text-white/35 font-body">
                Último acesso: <span className="text-white/55">{formatRelativeDate(profile.lastAccessAt)}</span>
              </span>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}

