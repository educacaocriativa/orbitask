'use client'
import { useEffect } from 'react'

/**
 * Fecha o modal com Esc.
 *
 * Nenhum modal do app fecha ao clicar fora: o clique acidental — ou o mouse
 * escapando do painel — apagava o que a pessoa tinha digitado, e no caso do
 * arraste de card chegava a desfazer a movimentação. Esc é a saída deliberada:
 * não acontece por acidente.
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
