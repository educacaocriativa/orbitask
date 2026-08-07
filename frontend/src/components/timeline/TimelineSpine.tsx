'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/ui/Avatar'
import type { TimelineDay, TimelineDocument } from '@/types/timeline'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

interface Props {
  days: TimelineDay[]
  onAddDocument: (date: string) => void
  onOpenDocument: (document: TimelineDocument) => void
}

/**
 * Eixo vertical com os dias alternando à esquerda e à direita.
 *
 * O peso visual acompanha o conteúdo: dia com documento (ou ainda aberto) vira
 * cartão; dia passado e vazio vira só um traço apagado. Sem isso, 31 cartões
 * iguais empurrariam o mês inteiro para fora da tela e esconderiam justamente
 * o que interessa.
 */
export function TimelineSpine({ days, onAddDocument, onOpenDocument }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id)

  return (
    <div className="relative py-4">
      {/* Eixo central + seta */}
      <div
        aria-hidden
        className="absolute left-[26px] md:left-1/2 top-0 bottom-8 w-px md:-translate-x-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(34,211,238,0.45) 0%, rgba(124,58,237,0.35) 60%, rgba(124,58,237,0.05) 100%)' }}
      />
      <div
        aria-hidden
        className="absolute left-[26px] md:left-1/2 bottom-0 md:-translate-x-1/2 -translate-x-1/2 text-violet-400/40 text-sm leading-none"
      >
        ▼
      </div>

      <ol className="space-y-1.5">
        {days.map((day, index) => (
          <DayRow
            key={day.date}
            day={day}
            side={index % 2 === 0 ? 'left' : 'right'}
            onAddDocument={onAddDocument}
            onOpenDocument={onOpenDocument}
            currentUserId={currentUserId}
          />
        ))}
      </ol>
    </div>
  )
}

function DayRow({
  day, side, onAddDocument, onOpenDocument, currentUserId,
}: {
  day: TimelineDay
  side: 'left' | 'right'
  onAddDocument: (date: string) => void
  onOpenDocument: (document: TimelineDocument) => void
  currentUserId?: string
}) {
  const dayNumber = Number(day.date.slice(8, 10))
  const weekday   = WEEKDAYS[new Date(`${day.date}T12:00:00`).getDay()]
  const hasDocs   = day.documents.length > 0

  // Dia vazio que não é hoje vira um traço apagado — vale tanto para o passado
  // (nada aconteceu) quanto para o futuro (ainda não chegou). Sem isso, um mês
  // à frente viraria 30 cartões vazios idênticos.
  if (!day.isOpen && !hasDocs) {
    return (
      <li className="relative flex items-center min-h-[34px] pl-14 md:pl-0">
        <Marker dayNumber={dayNumber} variant="locked" />
        <div className={cn('md:w-1/2', side === 'left' ? 'md:pr-10 md:text-right' : 'md:ml-auto md:pl-10')}>
          <span className="text-[11px] font-body text-white/18 select-none">
            {weekday} · {day.isPast ? 'sem documento' : 'aguardando o dia'}
          </span>
        </div>
      </li>
    )
  }

  return (
    <li className="relative flex min-h-[54px] pl-14 md:pl-0 py-1">
      <Marker dayNumber={dayNumber} variant={day.isToday ? 'today' : hasDocs ? 'filled' : 'open'} />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          'md:w-1/2 w-full',
          side === 'left' ? 'md:pr-10' : 'md:ml-auto md:pl-10',
        )}
      >
        <div className={cn(
          'glass rounded-2xl border p-3.5 transition-colors',
          day.isToday ? 'border-cyan-400/40 bg-cyan-500/6' : 'border-white/12',
        )}>
          {/* Cabeçalho do dia */}
          <div className={cn('flex items-center gap-2 mb-2', side === 'left' && 'md:flex-row-reverse')}>
            <span className={cn(
              'font-display text-sm font-black tracking-wide',
              day.isToday ? 'text-cyan-300' : 'text-white/85',
            )}>
              {String(dayNumber).padStart(2, '0')} <span className="text-white/35 font-body font-normal text-xs">{weekday}</span>
            </span>
            {day.isToday && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-cyan-400/35 text-cyan-300 font-body font-bold">
                hoje
              </span>
            )}
            <span className={cn('text-[11px] font-body text-white/40', side === 'left' ? 'md:mr-auto' : 'ml-auto')}>
              {day.documents.length > 0
                ? `${day.documents.length} ${day.documents.length === 1 ? 'documento' : 'documentos'}`
                : 'nenhum documento'}
            </span>
          </div>

          {/* Lista de documentos */}
          {hasDocs && (
            <ul className="space-y-1.5 mb-2">
              {day.documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    onClick={() => onOpenDocument(doc)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-xl',
                      'border border-white/8 bg-white/3 hover:bg-white/7 hover:border-white/16',
                      'transition-all text-left group',
                      side === 'left' && 'md:flex-row-reverse md:text-right',
                    )}
                  >
                    <span className="text-sm shrink-0">📄</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-body font-semibold text-white/85 truncate group-hover:text-white">
                        {doc.name}
                      </span>
                      <span className={cn('flex items-center gap-1.5 mt-0.5 flex-wrap', side === 'left' && 'md:flex-row-reverse')}>
                        {doc.files.length > 0 && (
                          <span className="text-[10px] font-body text-white/40">
                            📎 {doc.files.length}
                          </span>
                        )}
                        {doc.mentions.length > 0 && (
                          <span className="flex -space-x-1.5">
                            {doc.mentions.slice(0, 3).map((m) => (
                              <Avatar key={m.id} name={m.mentionedUser.name} src={m.mentionedUser.avatarUrl} size="xs" />
                            ))}
                          </span>
                        )}
                        {/* Só quem assina conta aqui — citado não deve nada. */}
                        {(() => {
                          const approvers = doc.mentions.filter((m) => m.isApprover)
                          if (approvers.length === 0) return null
                          return approvers.some((m) => m.mentionedUser.id === currentUserId && m.approval === 'PENDING') ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-amber-500/40 bg-amber-500/12 text-amber-300 font-body font-bold">
                              aguarda você
                            </span>
                          ) : (
                            <span className="text-[10px] font-body text-white/35">
                              {approvers.filter((m) => m.approval !== 'PENDING').length}/{approvers.length} decidiram
                            </span>
                          )
                        })()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Ação */}
          {day.isOpen ? (
            <button
              onClick={() => onAddDocument(day.date)}
              className={cn(
                'w-full text-xs px-3 py-1.5 rounded-lg font-body font-bold',
                'border border-violet-500/25 text-violet-300/90',
                'hover:border-violet-500/50 hover:bg-violet-500/10 transition-all',
              )}
            >
              + Adicionar documento
            </button>
          ) : (
            <p className="text-[11px] font-body text-white/30 text-center py-1">
              {day.isPast ? 'Dia encerrado — só consulta' : 'Ainda não chegou — só no dia'}
            </p>
          )}
        </div>
      </motion.div>
    </li>
  )
}

function Marker({ dayNumber, variant }: { dayNumber: number; variant: 'today' | 'filled' | 'open' | 'locked' }) {
  const styles = {
    today:  'bg-cyan-400 border-cyan-300 text-[#07031a] shadow-[0_0_12px_rgba(34,211,238,0.5)]',
    filled: 'bg-violet-500/85 border-violet-300/60 text-white',
    open:   'bg-[#0d0724] border-white/25 text-white/60',
    locked: 'bg-transparent border-white/10 text-white/20',
  }[variant]

  return (
    <span
      aria-hidden
      className={cn(
        'absolute left-[26px] md:left-1/2 top-3 md:-translate-x-1/2 -translate-x-1/2',
        'w-7 h-7 rounded-full border flex items-center justify-center',
        'text-[10px] font-display font-black tabular-nums z-10',
        styles,
      )}
    >
      {String(dayNumber).padStart(2, '0')}
    </span>
  )
}
