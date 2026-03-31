'use client'
import { useEffect } from 'react'
import { motion } from 'framer-motion'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('Orbitask error:', error) }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ background: '#03010a', margin: 0, fontFamily: 'sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💥</div>
            <h2 style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Falha Crítica do Sistema
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              Ocorreu um erro inesperado na nave.
              A equipe de controle foi notificada.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', color: 'white',
                }}
              >
                🔄 Reiniciar Sistemas
              </button>
              <button
                onClick={() => window.location.href = '/board'}
                style={{
                  padding: '10px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer', fontSize: 13, background: 'transparent', color: 'rgba(255,255,255,0.4)',
                }}
              >
                🏠 Início
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <pre style={{
                marginTop: 20, padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, color: 'rgba(239,68,68,0.8)', fontSize: 11, textAlign: 'left', overflowX: 'auto',
              }}>
                {error.message}
              </pre>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}

