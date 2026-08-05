'use client'
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Navbar } from '@/components/ui/Navbar'
import { useAuthStore } from '@/stores/authStore'
import { TimelineSpine } from '@/components/timeline/TimelineSpine'
import { NewDocumentModal } from '@/components/timeline/NewDocumentModal'
import { DocumentDetailModal } from '@/components/timeline/DocumentDetailModal'
import { TimelineAccessModal } from '@/components/timeline/TimelineAccessModal'
import type { TimelineDocument, TimelineMonthData, TimelinePerson } from '@/types/timeline'

export default function TimelinePage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [data, setData]       = useState<TimelineMonthData | null>(null)
  const [people, setPeople]   = useState<TimelinePerson[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied]   = useState(false)

  const [addingOnDate, setAddingOnDate] = useState<string | null>(null)
  const [openDocument, setOpenDocument] = useState<TimelineDocument | null>(null)
  const [showAccess, setShowAccess]     = useState(false)

  const loadMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const { data } = await api.get<TimelineMonthData>('/timeline', { params: { year: y, month: m } })
      setData(data)
      setDenied(false)
    } catch (err: any) {
      if (err?.response?.status === 403) setDenied(true)
      else toast.error('Não foi possível carregar a linha do tempo')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPeople = useCallback(async () => {
    try {
      const { data } = await api.get('/timeline/people')
      setPeople(data.people)
    } catch { /* a marcação fica indisponível, o resto da tela segue */ }
  }, [])

  useEffect(() => { loadMonth(year, month) }, [year, month, loadMonth])
  useEffect(() => { loadPeople() }, [loadPeople])

  function shiftMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }

  function goToToday() {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  /** Recoloca o documento alterado no dia certo, sem recarregar o mês inteiro. */
  function applyDocument(document: TimelineDocument) {
    setData((prev) => {
      if (!prev) return prev
      const key = document.date.slice(0, 10)
      return {
        ...prev,
        days: prev.days.map((day) => {
          if (day.date !== key) return day
          const exists = day.documents.some((d) => d.id === document.id)
          return {
            ...day,
            isOpen: true, // o dia passou a ter documento, então continua aberto
            documents: exists
              ? day.documents.map((d) => (d.id === document.id ? document : d))
              : [...day.documents, document],
          }
        }),
      }
    })
    setOpenDocument((current) => (current?.id === document.id ? document : current))
  }

  function removeDocument(documentId: string) {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) => {
          const documents = day.documents.filter((d) => d.id !== documentId)
          if (documents.length === day.documents.length) return day
          // Se o dia ficou vazio e já passou, ele volta a ser travado.
          return { ...day, documents, isOpen: documents.length > 0 || !day.isPast }
        }),
      }
    })
  }

  if (denied) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-3xl mx-auto px-5 py-24 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="font-display text-xl font-black text-white tracking-wide mb-2">
            Você ainda não tem acesso à Timeline
          </h1>
          <p className="text-sm font-body text-white/55">
            Peça a um administrador para adicionar você.
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 py-8">

        {/* Cabeçalho */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <p className="text-xs font-display font-black tracking-[0.3em] text-cyan-400/80 mb-1.5 uppercase">
            🗓 Linha do tempo
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-black text-white tracking-wide capitalize">
              {data?.label ?? '—'}
            </h1>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setShowAccess(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neon-amber/30 bg-neon-amber/8 text-amber-300 text-xs font-body font-bold hover:bg-neon-amber/16 transition-all"
                >
                  👥 Gerenciar pessoas
                </button>
              )}

              <div className="flex items-center gap-1 p-1 rounded-xl glass-strong border border-white/14">
                <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior"
                  className="px-2.5 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/6 transition-all text-sm">
                  ←
                </button>
                <button onClick={goToToday} disabled={isCurrentMonth}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-body font-bold text-white/60 hover:text-white hover:bg-white/6 disabled:opacity-30 transition-all">
                  hoje
                </button>
                <button onClick={() => shiftMonth(1)} aria-label="Próximo mês"
                  className="px-2.5 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/6 transition-all text-sm">
                  →
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-24">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-4xl">🛸</motion.div>
          </div>
        ) : data ? (
          <TimelineSpine
            days={data.days}
            onAddDocument={setAddingOnDate}
            onOpenDocument={setOpenDocument}
          />
        ) : null}
      </main>

      <NewDocumentModal
        date={addingOnDate}
        people={people}
        onClose={() => setAddingOnDate(null)}
        onCreated={applyDocument}
      />

      {openDocument && (
        <DocumentDetailModal
          document={openDocument}
          onClose={() => setOpenDocument(null)}
          onChanged={applyDocument}
          onDeleted={removeDocument}
        />
      )}

      <TimelineAccessModal
        open={showAccess}
        onClose={() => setShowAccess(false)}
        onChanged={loadPeople}
      />
    </div>
  )
}
