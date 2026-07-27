'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

// ── Tipos ────────────────────────────────────────────────

type ActivityType =
  | 'CARD_MOVED' | 'CARD_CREATED' | 'CARD_ARCHIVED' | 'CARD_RESTORED'
  | 'FILE_UPLOADED' | 'FILE_DELETED' | 'FOLDER_CREATED'

interface ActivityEvent {
  id: string
  type: ActivityType
  actorId: string | null
  actorName: string
  actorEmail: string
  cardTitle: string | null
  columnTitle: string | null
  toColumnTitle: string | null
  folderName: string | null
  folderUrl: string | null
  detail: Record<string, any> | null
  isBackfilled: boolean
  occurredAt: string
}

interface ReportResponse {
  board: { id: string; title: string }
  period: { from: string; to: string }
  events: ActivityEvent[]
  total: number
  page: number
  limit: number
  summary: {
    totalEvents: number
    totalActors: number
    totalCards: number
    byType: Array<{ type: ActivityType; label: string; count: number }>
    byActor: Array<{ actorId: string | null; actorName: string; actorEmail: string; total: number }>
    byFolder: Array<{ folderName: string; folderUrl: string | null; count: number }>
  }
  filters: {
    actors: Array<{ id: string | null; name: string; email: string }>
    columns: Array<{ id: string | null; title: string }>
    types: ActivityType[]
  }
  backfillBoundary: string | null
}

interface BoardOption { id: string; title: string; isArchived: boolean }

// ── Vocabulário visual — o mesmo dos Logs, para não ensinar duas linguagens ──

const TYPE_BADGE: Record<ActivityType, { label: string; color: string }> = {
  CARD_MOVED:     { label: '🚀 Missão movida',      color: 'text-amber-300  bg-amber-500/10  border-amber-500/25'  },
  CARD_CREATED:   { label: '✨ Missão criada',       color: 'text-violet-300 bg-violet-500/10 border-violet-500/25' },
  CARD_ARCHIVED:  { label: '📦 Missão arquivada',    color: 'text-orange-300 bg-orange-500/10 border-orange-500/25' },
  CARD_RESTORED:  { label: '♻️ Missão restaurada',   color: 'text-cyan-300   bg-cyan-500/10   border-cyan-500/25'   },
  FILE_UPLOADED:  { label: '📎 Arquivo enviado',     color: 'text-teal-300   bg-teal-500/10   border-teal-500/25'   },
  FILE_DELETED:   { label: '🗑️ Arquivo excluído',    color: 'text-red-300    bg-red-500/12    border-red-500/30'    },
  FOLDER_CREATED: { label: '📁 Pasta criada',        color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' },
}

const PAGE_SIZE = 100

// ── Datas ────────────────────────────────────────────────

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function presetRange(preset: 'last7' | 'thisMonth' | 'lastMonth'): { from: string; to: string } {
  const now = new Date()
  if (preset === 'last7') {
    const start = new Date(now); start.setDate(start.getDate() - 6)
    return { from: toInputDate(start), to: toInputDate(now) }
  }
  if (preset === 'thisMonth') {
    return { from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toInputDate(now) }
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last  = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toInputDate(first), to: toInputDate(last) }
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function describeEvent(e: ActivityEvent): string {
  const detail = e.detail ?? {}
  if (e.type === 'FILE_UPLOADED' || e.type === 'FILE_DELETED') {
    const size = typeof detail.fileSizeBytes === 'number' ? ` · ${formatBytes(detail.fileSizeBytes)}` : ''
    return `${detail.fileName ?? '(arquivo)'}${size}`
  }
  if (e.type === 'FOLDER_CREATED') return detail.folderKind === 'projeto' ? 'Pasta do projeto' : 'Pasta da etapa'
  return ''
}

// ── Componente ───────────────────────────────────────────

export function ActivityReport() {
  const [boards, setBoards]   = useState<BoardOption[]>([])
  const [boardId, setBoardId] = useState('')

  const initial = presetRange('thisMonth')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo]     = useState(initial.to)

  const [typeFilter, setTypeFilter]     = useState('')
  const [actorFilter, setActorFilter]   = useState('')
  const [columnFilter, setColumnFilter] = useState('')
  const [page, setPage] = useState(1)

  const [report, setReport]         = useState<ReportResponse | null>(null)
  const [loading, setLoading]       = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    api.get('/admin/reports/boards')
      .then(({ data }) => setBoards(data.boards))
      .catch(() => toast.error('Não foi possível carregar os projetos'))
  }, [])

  const params = useMemo(() => ({
    boardId,
    from,
    to,
    ...(typeFilter   ? { type: typeFilter }       : {}),
    ...(actorFilter  ? { actorId: actorFilter }   : {}),
    ...(columnFilter ? { columnId: columnFilter } : {}),
  }), [boardId, from, to, typeFilter, actorFilter, columnFilter])

  const load = useCallback(async (targetPage: number) => {
    if (!boardId) { toast.error('Selecione um projeto'); return }
    setLoading(true)
    try {
      const { data } = await api.get<ReportResponse>('/admin/reports/activity', {
        params: { ...params, page: targetPage, limit: PAGE_SIZE },
      })
      setReport(data)
      setPage(targetPage)
      setHasSearched(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível gerar o relatório')
    } finally {
      setLoading(false)
    }
  }, [boardId, params])

  // Mudar filtro volta para a primeira página — manter a página 7 de um
  // resultado que agora tem 2 páginas mostraria uma tabela vazia sem explicação.
  useEffect(() => {
    if (hasSearched) load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, actorFilter, columnFilter])

  async function downloadExcel() {
    if (!boardId) return
    setExporting(true)
    try {
      const res = await api.get('/admin/reports/activity/export', { params, responseType: 'blob' })
      const disposition = res.headers['content-disposition'] as string | undefined
      const filename = disposition?.match(/filename="(.+?)"/)?.[1] ?? 'atividade.xlsx'

      const url = URL.createObjectURL(res.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Planilha baixada')
    } catch {
      toast.error('Não foi possível gerar a planilha')
    } finally {
      setExporting(false)
    }
  }

  function applyPreset(preset: 'last7' | 'thisMonth' | 'lastMonth') {
    const range = presetRange(preset)
    setFrom(range.from)
    setTo(range.to)
  }

  const totalPages = report ? Math.max(1, Math.ceil(report.total / report.limit)) : 1
  const periodStartsBeforeBackfill =
    report?.backfillBoundary != null && new Date(from) < new Date(report.backfillBoundary)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      {/* Seleção */}
      <div className="glass rounded-2xl border border-white/14 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 min-w-[240px] flex-1">
            <span className="text-[11px] font-display font-black tracking-widest text-white/35 uppercase">Projeto</span>
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space">
              <option value="">Selecione um projeto</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.isArchived ? '📦 ' : '🛰 '}{b.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-display font-black tracking-widest text-white/35 uppercase">De</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-display font-black tracking-widest text-white/35 uppercase">Até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space" />
          </label>

          <motion.button onClick={() => load(1)} disabled={loading || !boardId}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="px-4 py-2 rounded-xl border border-neon-violet/55 bg-neon-violet/25 text-white text-sm font-display font-black tracking-wide hover:bg-neon-violet/35 disabled:opacity-40 transition-all">
            {loading ? '⏳ Gerando...' : '📊 Gerar relatório'}
          </motion.button>

          <motion.button onClick={downloadExcel} disabled={exporting || !report || report.total === 0}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/12 text-emerald-300 text-sm font-display font-black tracking-wide hover:bg-emerald-500/20 disabled:opacity-40 transition-all">
            {exporting ? '⏳ Montando...' : '⬇ Baixar Excel'}
          </motion.button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-body font-semibold text-white/35">Atalhos:</span>
          {([
            ['last7',     'Últimos 7 dias'],
            ['thisMonth', 'Este mês'],
            ['lastMonth', 'Mês passado'],
          ] as const).map(([preset, label]) => (
            <button key={preset} onClick={() => applyPreset(preset)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-white/15 text-white/65 hover:text-white hover:bg-white/5 font-body font-bold transition-all">
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasSearched && (
        <div className="glass rounded-2xl border border-white/14 p-10 text-center">
          <div className="text-4xl mb-3">🛰</div>
          <p className="text-sm font-body text-white/60">
            Escolha um projeto e um período para ver tudo que a equipe fez — movimentações, arquivos e pastas, com quem fez cada coisa.
          </p>
        </div>
      )}

      {report && hasSearched && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Eventos',  value: report.summary.totalEvents, icon: '⚡' },
              { label: 'Pessoas',  value: report.summary.totalActors, icon: '👨‍🚀' },
              { label: 'Missões',  value: report.summary.totalCards,  icon: '🎯' },
              { label: 'Pastas',   value: report.summary.byFolder.length, icon: '📁' },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl border border-white/14 p-4">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="font-display text-2xl font-black text-white">{s.value.toLocaleString('pt-BR')}</div>
                <div className="text-[11px] font-display font-black tracking-widest text-white/35 uppercase">{s.label}</div>
              </div>
            ))}
          </div>

          {periodStartsBeforeBackfill && (
            <div className="glass rounded-2xl border border-amber-500/30 bg-amber-500/6 p-4 flex gap-3">
              <span className="text-lg leading-none">↺</span>
              <p className="text-xs font-body text-amber-200/90 leading-relaxed">
                Parte deste período foi reconstruída do histórico antigo e pode estar incompleta — as linhas marcadas
                com <strong>↺</strong> vêm daí. Exclusão de arquivo e criação de pasta só passaram a ser registradas
                a partir da instalação do relatório.
              </p>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space">
              <option value="">Todos os tipos</option>
              {report.filters.types.map((t) => (
                <option key={t} value={t}>{TYPE_BADGE[t].label}</option>
              ))}
            </select>

            <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space">
              <option value="">Todas as pessoas</option>
              {report.filters.actors.filter((a) => a.id).map((a) => (
                <option key={a.id} value={a.id!}>{a.name}</option>
              ))}
            </select>

            <select value={columnFilter} onChange={(e) => setColumnFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-body input-space">
              <option value="">Todas as etapas</option>
              {report.filters.columns.filter((c) => c.id).map((c) => (
                <option key={c.id} value={c.id!}>{c.title}</option>
              ))}
            </select>

            {(typeFilter || actorFilter || columnFilter) && (
              <button onClick={() => { setTypeFilter(''); setActorFilter(''); setColumnFilter('') }}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white/90 hover:bg-white/5 font-body font-bold transition-all">
                ✕ limpar filtros
              </button>
            )}

            <span className="text-xs text-white/65 font-body font-semibold ml-auto">
              {report.total.toLocaleString('pt-BR')} evento(s) · página {page} de {totalPages}
            </span>
          </div>

          {/* Timeline */}
          <div className="glass rounded-2xl border border-white/14 overflow-hidden">
            <div className="overflow-x-auto scrollbar-space">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/12">
                    {['Quando', 'Pessoa', 'O que fez', 'Missão', 'Etapa', 'Detalhe', 'Pasta'].map((h) => (
                      <th key={h} className="px-4 py-3.5 text-left text-[11px] font-display font-black tracking-widest text-white/35 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {report.events.map((e) => {
                    const { date, time } = formatDateTime(e.occurredAt)
                    const badge = TYPE_BADGE[e.type]
                    return (
                      <tr key={e.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-body font-semibold text-white/90">{date}</div>
                          <div className="text-[10px] text-white/45 font-mono">{time}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={e.actorName} size="xs" />
                            <div className="min-w-0">
                              <div className="text-sm font-body font-semibold text-white/90 truncate flex items-center gap-1.5">
                                {e.actorName}
                                {e.isBackfilled && (
                                  <span title="Reconstruído do histórico antigo — pode estar incompleto"
                                    className="text-[10px] text-amber-300/80 cursor-help">↺</span>
                                )}
                              </div>
                              <div className="text-[10px] text-white/45 font-body truncate">{e.actorEmail || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs px-2.5 py-1 rounded-lg border font-body font-bold whitespace-nowrap', badge.color)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-body text-white/80 truncate max-w-[220px] block" title={e.cardTitle ?? ''}>
                            {e.cardTitle ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {e.type === 'CARD_MOVED' ? (
                            <span className="text-xs font-body text-white/70">
                              {e.columnTitle ?? '—'} <span className="text-white/35">→</span>{' '}
                              <span className="text-white/90 font-semibold">{e.toColumnTitle ?? '—'}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-body text-white/70">{e.columnTitle ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-body text-white/60 truncate max-w-[220px] block" title={describeEvent(e)}>
                            {describeEvent(e) || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {e.folderUrl ? (
                            <a href={e.folderUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-body text-cyan-300 hover:text-cyan-200 underline underline-offset-2 truncate max-w-[200px] block"
                              title={e.folderName ?? ''}>
                              {e.folderName ?? 'abrir no Drive'}
                            </a>
                          ) : (
                            <span className="text-xs font-body text-white/35 truncate max-w-[200px] block">{e.folderName ?? '—'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {report.events.length === 0 && (
                <div className="px-4 py-14 text-center">
                  <div className="text-3xl mb-2">🌑</div>
                  <p className="text-sm font-body text-white/55">Nenhum evento neste período com esses filtros.</p>
                </div>
              )}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-xs font-body font-bold disabled:opacity-30 transition-all">
                ← anterior
              </button>
              <span className="text-xs font-body text-white/55">{page} / {totalPages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-xs font-body font-bold disabled:opacity-30 transition-all">
                próxima →
              </button>
            </div>
          )}

          {/* Quem fez o quê — responde a pergunta sem precisar abrir o Excel */}
          {report.summary.byActor.length > 0 && (
            <div className="glass rounded-2xl border border-white/14 p-5">
              <h3 className="font-display text-sm font-black tracking-wide text-white/90 mb-4">Por pessoa</h3>
              <div className="space-y-2">
                {report.summary.byActor.map((a) => (
                  <div key={a.actorId ?? a.actorName} className="flex items-center gap-3">
                    <Avatar name={a.actorName} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-body font-semibold text-white/90 truncate">{a.actorName}</div>
                      <div className="text-[10px] text-white/45 font-body truncate">{a.actorEmail || '—'}</div>
                    </div>
                    <div className="w-40 h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div className="h-full bg-neon-violet/70"
                        style={{ width: `${Math.round((a.total / (report.summary.byActor[0]?.total || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-body font-bold text-white/70 w-12 text-right">{a.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
