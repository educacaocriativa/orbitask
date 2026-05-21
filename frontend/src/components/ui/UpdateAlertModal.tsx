'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Bump this key whenever a new update needs to be announced — users who already
// dismissed the previous one will see the new modal once.
const UPDATE_KEY = 'orbitask-update-alert:2026-05-21'

export function UpdateAlertModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const seen = window.localStorage.getItem(UPDATE_KEY)
      if (!seen) setOpen(true)
    } catch {
      // localStorage may be blocked — fall back to showing once per session
      setOpen(true)
    }
  }, [])

  function dismiss() {
    setOpen(false)
    try { window.localStorage.setItem(UPDATE_KEY, '1') } catch {}
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={dismiss}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="relative w-full max-w-lg glass rounded-2xl overflow-hidden shadow-glass"
          >
            {/* Top accent line */}
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

            {/* Header */}
            <div className="px-7 pt-8 pb-2 text-center">
              <motion.div
                animate={{ rotate: [0, -8, 8, -4, 4, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5 }}
                className="text-5xl mb-3"
              >
                📢
              </motion.div>
              <p className="text-[11px] font-display font-black tracking-[0.4em] text-amber-300/90 uppercase mb-1">
                ⚠ Atenção
              </p>
              <h2 className="font-display text-2xl font-black text-white tracking-wide">
                Nova atualização
              </h2>
            </div>

            {/* Body */}
            <div className="px-7 pb-2 pt-4 space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3.5">
                <p className="text-sm text-white/90 font-body leading-relaxed">
                  <strong className="text-amber-200">Dentro de cada card</strong>, as atualizações
                  mais recentes agora aparecem <strong className="text-amber-200">na parte de cima</strong>.
                </p>
                <p className="text-xs text-white/55 font-body leading-relaxed mt-2">
                  A etapa em que o card está atualmente fica destacada com um anel ciano e o badge
                  <span className="mx-1 text-[10px] px-1.5 py-0.5 rounded-md bg-neon-cyan/20 border border-neon-cyan/45 text-cyan-200 font-display font-black tracking-widest uppercase">● Atual</span>
                  para você identificar rapidinho onde está trabalhando.
                </p>
              </div>

              <ul className="text-xs text-white/70 font-body space-y-1.5 px-1">
                <li className="flex items-start gap-2">
                  <span className="text-amber-300">✨</span>
                  <span>Comentários agora mostram data e horário de cada interação.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300">🗓</span>
                  <span>Cards atrasados ganharam botão de <strong className="text-white/90">Reagendar prazo</strong> direto no card (admin).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-300">🚫</span>
                  <span>Ao criar uma nova etapa, agora é possível marcar para <strong className="text-white/90">não criar pasta no Drive</strong> (etapas internas).</span>
                </li>
              </ul>
            </div>

            {/* Action */}
            <div className="px-7 pt-5 pb-7">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={dismiss}
                className="w-full py-3 rounded-xl text-sm font-display font-black tracking-wider text-white uppercase transition-all"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)' }}
              >
                🚀 Entendi, vamos lá
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
