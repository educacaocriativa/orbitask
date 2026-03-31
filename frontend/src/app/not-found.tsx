'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-md"
      >
        {/* Floating astronaut */}
        <motion.div
          animate={{ y: [0, -16, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-8xl mb-6 inline-block"
        >
          👨‍🚀
        </motion.div>

        <h1 className="font-display text-6xl font-black text-white/10 mb-2">404</h1>
        <h2 className="font-display text-xl font-semibold text-white/70 mb-3 tracking-wide">
          Setor Não Encontrado
        </h2>
        <p className="text-sm text-white/30 font-body mb-8 leading-relaxed">
          Este setor do universo não existe ou foi reclassificado.
          Verifique as coordenadas e tente novamente.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link href="/board">
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-2.5 rounded-xl text-sm font-display tracking-wider text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}
            >
              🚀 Voltar ao Centro
            </motion.div>
          </Link>
          <button onClick={() => window.history.back()}
            className="px-5 py-2.5 rounded-xl text-sm font-body border border-white/10 text-white/40 hover:bg-white/5 transition-all">
            ← Voltar
          </button>
        </div>

        {/* Stars decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white"
              style={{
                left: `${15 + i * 14}%`,
                top:  `${20 + (i % 3) * 20}%`,
                opacity: 0.3,
              }}
              animate={{ opacity: [0.1, 0.6, 0.1], scale: [1, 1.5, 1] }}
              transition={{ duration: 2 + i * 0.5, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

