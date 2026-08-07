'use client'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { TimelinePerson } from '@/types/timeline'

interface Props {
  label: string
  hint: string
  placeholder: string
  /** Pessoas disponíveis para escolher. */
  people: TimelinePerson[]
  selected: TimelinePerson[]
  onChange: (people: TimelinePerson[]) => void
  /** Já escolhidas no OUTRO campo — some da lista para não haver conflito. */
  excludeIds?: string[]
  /** violeta = aprovação (assina); ciano = citação (só avisa). */
  tone?: 'violet' | 'cyan'
}

const TONE = {
  violet: { chip: 'border-violet-500/30 bg-violet-500/10 text-violet-200', x: 'text-violet-300/60 hover:text-violet-200' },
  cyan:   { chip: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',       x: 'text-cyan-300/60 hover:text-cyan-200'     },
}

/** Campo de escolher pessoas. Usado para citar e para pedir aprovação. */
export function PersonPicker({
  label, hint, placeholder, people, selected, onChange, excludeIds = [], tone = 'violet',
}: Props) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const styles = TONE[tone]

  const available = useMemo(() => {
    const taken = new Set([...selected.map((p) => p.id), ...excludeIds])
    const q = query.trim().toLowerCase()
    return people
      .filter((p) => !taken.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
      .slice(0, 6)
  }, [people, selected, excludeIds, query])

  return (
    <div className="relative">
      <span className="text-[11px] font-display font-black tracking-widest text-white/40 uppercase">
        {label}
      </span>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selected.map((p) => (
            <span key={p.id} className={cn('flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border', styles.chip)}>
              <Avatar name={p.name} src={p.avatarUrl} size="xs" />
              <span className="text-xs font-body">{p.name}</span>
              <button type="button"
                onClick={() => onChange(selected.filter((x) => x.id !== p.id))}
                className={cn('text-xs leading-none', styles.x)}
                aria-label={`Remover ${p.name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        // Atraso para o clique na lista acontecer antes de ela fechar.
        onBlur={() => setTimeout(() => setOpen(false), 140)}
        placeholder={placeholder}
        className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm font-body input-space"
      />

      {open && available.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-20 glass-strong rounded-xl border border-white/14 p-1 max-h-52 overflow-y-auto scrollbar-space">
          {available.map((p) => (
            <li key={p.id}>
              <button type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange([...selected, p]); setQuery('') }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/6 transition-colors text-left">
                <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                <span className="min-w-0">
                  <span className="block text-sm font-body text-white/85 truncate">{p.name}</span>
                  <span className="block text-[10px] font-body text-white/35 truncate">{p.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] font-body text-white/30 mt-1">{hint}</p>
    </div>
  )
}
