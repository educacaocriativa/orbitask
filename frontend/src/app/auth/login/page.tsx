'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await login(email, password)
      toast.success('Bem-vindo à missão! 🚀')
      router.push('/board')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Credenciais inválidas')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">

      {/* Orbiting decoration */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[600px] h-[600px] opacity-20">
          <div className="absolute inset-0 rounded-full border border-neon-violet/30" />
          <div className="absolute inset-[60px] rounded-full border border-neon-cyan/20" />
          <motion.div
            className="absolute top-1/2 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-neon-violet"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '1.5px 151px' }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full bg-neon-cyan"
            animate={{ rotate: -360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '1px 91px' }}
          />
        </div>
      </div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass rounded-3xl p-8 shadow-glass">
          {/* Logo */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}
              animate={{ boxShadow: ['0 0 20px rgba(124,58,237,0.4)', '0 0 40px rgba(124,58,237,0.7)', '0 0 20px rgba(124,58,237,0.4)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-2xl">🚀</span>
            </motion.div>
            <h1 className="font-display text-2xl font-bold tracking-wider text-white text-glow-violet">
              ORBITASK
            </h1>
            <p className="text-sm text-white/40 mt-1 font-body">Mission Control — Acesso Restrito</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 uppercase tracking-widest font-display">
                Identificação
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@missao.com"
                required
                className={cn(
                  'w-full px-4 py-3 rounded-xl text-sm font-body',
                  'bg-white/5 border border-white/10 text-white placeholder-white/25',
                  'focus:outline-none focus:border-neon-violet/60 focus:bg-white/8',
                  'transition-all duration-200',
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 uppercase tracking-widest font-display">
                Código de Acesso
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={cn(
                    'w-full px-4 py-3 pr-12 rounded-xl text-sm font-body',
                    'bg-white/5 border border-white/10 text-white placeholder-white/25',
                    'focus:outline-none focus:border-neon-violet/60 focus:bg-white/8',
                    'transition-all duration-200',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors text-lg"
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'w-full py-3.5 rounded-xl font-display font-semibold text-sm tracking-widest',
                'text-white uppercase transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{
                background: isLoading
                  ? 'rgba(124,58,237,0.4)'
                  : 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
                boxShadow: '0 0 24px rgba(124,58,237,0.4)',
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block"
                  >
                    ⚙️
                  </motion.span>
                  Autenticando...
                </span>
              ) : (
                '⚡ Iniciar Missão'
              )}
            </motion.button>
          </form>

          <p className="text-center text-xs text-white/20 mt-6 font-body">
            Acesso restrito a membros autorizados
          </p>
        </div>

        {/* Decorative corner glows */}
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-neon-violet/50 to-transparent" />
        <div className="absolute -bottom-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
      </motion.div>
    </div>
  )
}

