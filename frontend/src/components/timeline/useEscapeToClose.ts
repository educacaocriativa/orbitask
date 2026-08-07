'use client'
import { useEffect } from 'react'

/**
 * Fecha o modal com Esc.
 *
 * Os modais da Timeline não fecham ao clicar fora: o mouse escapando do painel
 * apagava um documento inteiro em digitação. Esc é a saída deliberada — não
 * acontece por acidente.
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
