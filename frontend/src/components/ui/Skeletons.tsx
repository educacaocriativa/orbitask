'use client'
import { cn } from '@/lib/utils'

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-lg animate-pulse bg-white/5', className)}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-xl p-3 border border-white/6 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <Shimmer className="h-4 flex-1" />
        <Shimmer className="h-5 w-5 rounded-lg shrink-0" />
      </div>
      <div className="flex gap-1">
        <Shimmer className="h-3.5 w-12 rounded-md" />
        <Shimmer className="h-3.5 w-16 rounded-md" />
      </div>
      <Shimmer className="h-3 w-3/4" />
      <div className="flex items-center justify-between pt-1 border-t border-white/4">
        <Shimmer className="h-4 w-24 rounded-md" />
        <Shimmer className="h-4 w-5 rounded-md" />
      </div>
    </div>
  )
}

export function ColumnSkeleton() {
  return (
    <div className="shrink-0 flex flex-col" style={{ width: 'var(--col-width)' }}>
      {/* Header */}
      <div className="glass rounded-t-2xl px-4 py-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <Shimmer className="h-4 w-28" />
          <Shimmer className="h-5 w-8 rounded-md" />
        </div>
        <div className="flex items-center gap-1.5">
          <Shimmer className="h-5 w-5 rounded-md" />
          <Shimmer className="h-3.5 w-20" />
        </div>
      </div>

      {/* Cards */}
      <div className="glass rounded-b-2xl p-2 space-y-2.5">
        {[...Array(3)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Add button */}
      <Shimmer className="mt-2 h-9 rounded-xl" />
    </div>
  )
}

export function BoardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-44 rounded-2xl glass border border-white/6 animate-pulse" />
      ))}
    </div>
  )
}

export function AdminTableSkeleton() {
  return (
    <div className="glass rounded-2xl border border-white/6 overflow-hidden">
      <div className="p-4 border-b border-white/6">
        <Shimmer className="h-4 w-32" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/4 last:border-0">
          <Shimmer className="h-8 w-8 rounded-xl shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Shimmer className="h-3.5 w-36" />
            <Shimmer className="h-3 w-52" />
          </div>
          <Shimmer className="h-5 w-16 rounded-lg" />
          <Shimmer className="h-5 w-24 rounded-md" />
          <Shimmer className="h-6 w-14 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

