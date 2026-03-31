'use client'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import toast from 'react-hot-toast'

type ImportType = 'users' | 'missions'

interface ResultRow {
  row: number
  tipo?: string
  email?: string
  titulo?: string
  status: string
  error?: string
}

interface ImportCSVModalProps {
  open: boolean
  type: ImportType
  onClose: () => void
  onSuccess?: () => void
}

export function ImportCSVModal({ open, type, onClose, onSuccess }: ImportCSVModalProps) {
  const [file, setFile]           = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults]     = useState<ResultRow[] | null>(null)
  const [summary, setSummary]     = useState<Record<string, number> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isUsers    = type === 'users'
  const title      = isUsers ? 'Importar Usuários' : 'Importar Missão'
  const endpoint   = isUsers ? '/admin/import/users' : '/admin/import/missions'
  const templateUrl = isUsers ? '/admin/import/template/users' : '/admin/import/template/missions'

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) setFile(f)
    else toast.error('Apenas arquivos .csv são aceitos')
  }

  async function downloadTemplate() {
    try {
      const { data } = await api.get(templateUrl, { responseType: 'blob' })
      const url  = URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.href  = url
      link.download = isUsers ? 'template_usuarios.csv' : 'template_missoes.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar template')
    }
  }

  async function handleImport() {
    if (!file) return
    setIsLoading(true)
    setResults(null)
    setSummary(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(endpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResults(data.results)
      if (isUsers) {
        setSummary({ Usuários: data.created })
        toast.success(`${data.created} usuário(s) criado(s)${data.errors > 0 ? `, ${data.errors} erro(s)` : ''}`)
      } else {
        setSummary(data.summary)
        const total = Object.values(data.summary as Record<string, number>).reduce((a, b) => a + b, 0)
        toast.success(`${total} item(ns) criado(s)${data.errors > 0 ? `, ${data.errors} erro(s)` : ''}`)
      }
      if (data.errors === 0) onSuccess?.()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro na importação')
    } finally {
      setIsLoading(false)
    }
  }

  function reset() {
    setFile(null)
    setResults(null)
    setSummary(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="relative w-full max-w-lg glass rounded-2xl overflow-hidden shadow-glass flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-neon-violet/50 to-transparent" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{isUsers ? '👥' : '🚀'}</span>
            <h2 className="font-display text-base font-bold text-white tracking-wide">{title}</h2>
          </div>
          <button onClick={onClose} className="text-white/35 hover:text-white/80 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Template download */}
          <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">📋</span>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-body text-white/65 leading-relaxed">
                Baixe o template CSV, preencha com seus dados e importe aqui.
              </p>
              {!isUsers && (
                <div className="text-[11px] text-white/40 font-body space-y-0.5">
                  <p>• Linha <code className="bg-white/8 px-1 rounded">BOARD</code> → cria a missão</p>
                  <p>• Linha <code className="bg-white/8 px-1 rounded">COLUMN</code> → cria etapa dentro do último BOARD</p>
                  <p>• Linha <code className="bg-white/8 px-1 rounded">CARD</code> → cria card dentro da última COLUMN</p>
                </div>
              )}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-neon-cyan/80 hover:text-neon-cyan font-body font-bold transition-colors"
              >
                ⬇ Baixar template CSV
              </button>
            </div>
          </div>

          {/* Drop zone */}
          {!results && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
                isDragging
                  ? 'border-neon-violet/60 bg-neon-violet/8'
                  : file
                  ? 'border-neon-cyan/40 bg-neon-cyan/5'
                  : 'border-white/12 hover:border-white/24 hover:bg-white/3',
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
              />
              {file ? (
                <>
                  <span className="text-3xl">📄</span>
                  <p className="text-sm font-body font-semibold text-white/90">{file.name}</p>
                  <p className="text-xs text-white/40 font-body">{(file.size / 1024).toFixed(1)} KB</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset() }}
                    className="text-xs text-white/35 hover:text-red-400 transition-colors font-body"
                  >
                    ✕ Remover
                  </button>
                </>
              ) : (
                <>
                  <span className="text-3xl text-white/20">📂</span>
                  <p className="text-sm font-body text-white/50 text-center">
                    Arraste o CSV aqui<br />
                    <span className="text-xs text-white/30">ou clique para selecionar</span>
                  </p>
                </>
              )}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              {/* Summary */}
              {summary && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(summary).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-cyan/10 border border-neon-cyan/25">
                      <span className="text-xs font-body font-bold text-neon-cyan">{v}</span>
                      <span className="text-xs text-white/55 font-body">{k}</span>
                    </div>
                  ))}
                  {results.filter((r) => r.status === 'erro').length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25">
                      <span className="text-xs font-body font-bold text-red-400">
                        {results.filter((r) => r.status === 'erro').length} erros
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Row results */}
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                  {results.map((r, i) => (
                    <div key={i} className={cn(
                      'flex items-center gap-3 px-3 py-2 text-xs font-body',
                      r.status === 'erro' ? 'bg-red-500/8' : r.status === 'criado' ? 'bg-neon-cyan/4' : 'opacity-40',
                    )}>
                      <span className="text-white/30 font-mono w-8 shrink-0">L{r.row}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0',
                        r.status === 'erro' ? 'bg-red-500/20 text-red-400' : 'bg-neon-cyan/15 text-neon-cyan',
                      )}>
                        {r.tipo ?? (isUsers ? 'USER' : '?')}
                      </span>
                      <span className="flex-1 text-white/70 truncate">{r.titulo ?? r.email ?? ''}</span>
                      {r.error ? (
                        <span className="text-red-400 text-[10px] shrink-0 max-w-[140px] text-right">{r.error}</span>
                      ) : (
                        <span className="text-neon-cyan/60 text-[10px] shrink-0">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={reset}
                className="text-xs text-white/40 hover:text-white/70 font-body transition-colors"
              >
                ← Importar outro arquivo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!results && (
          <div className="px-6 pb-5 pt-3 border-t border-white/6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-body text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-all"
            >
              Cancelar
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleImport}
              disabled={!file || isLoading}
              className={cn(
                'px-5 py-2 rounded-lg text-xs font-display tracking-wider font-bold transition-all',
                file && !isLoading
                  ? 'bg-neon-violet/40 border border-neon-violet/50 text-white hover:bg-neon-violet/55'
                  : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed',
              )}
            >
              {isLoading ? '⏳ Importando...' : '🚀 Importar'}
            </motion.button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
