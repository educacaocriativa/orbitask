'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface PickerUser { id: string; name: string; email: string; avatarUrl?: string }

interface Props {
  /** Quem já está marcado na etapa — some da lista para não marcar duas vezes. */
  excludeIds?: string[]
  onPick: (user: PickerUser) => Promise<void>
}

/**
 * Botão "+" que marca alguém na etapa.
 *
 * Antes a marcação só existia digitando "@" dentro do editor de texto. Tirado o
 * editor, este passa a ser o único caminho — por isso ele marca a pessoa direto,
 * sem exigir que se escreva nada.
 */
export function MentionPicker({ excludeIds = [], onPick }: Props) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [users, setUsers]   = useState<PickerUser[]>([])
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    api.get('/users', { params: { search: query || undefined } })
      .then(({ data }) => setUsers(data.users ?? []))
      .catch(() => toast.error('Erro ao carregar pessoas'))
  }, [open, query])

  // Fecha ao clicar fora, mas sem perder o que já foi digitado na busca.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const available = useMemo(() => {
    const taken = new Set(excludeIds)
    return users.filter((u) => !taken.has(u.id)).slice(0, 6)
  }, [users, excludeIds])

  async function pick(u: PickerUser) {
    setSaving(true)
    try {
      await onPick(u)
      setOpen(false)
      setQuery('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="text-xs text-neon-cyan/80 hover:text-neon-cyan font-body font-bold transition-colors disabled:opacity-40"
      >
        {saving ? '⚡ marcando...' : '+ Marcar pessoa'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-64 glass-strong rounded-xl border border-white/14 p-1.5 shadow-2xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pessoa..."
            className="w-full px-2.5 py-1.5 mb-1 rounded-lg text-xs font-body input-space"
          />
          {available.length === 0 ? (
            <p className="text-[11px] text-white/35 font-body px-2.5 py-2">Ninguém encontrado</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto scrollbar-space">
              {available.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => pick(u)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/6 transition-colors text-left"
                  >
                    <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                    <span className="min-w-0">
                      <span className="block text-xs font-body text-white/85 truncate">{u.name}</span>
                      <span className="block text-[10px] font-body text-white/35 truncate">{u.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
