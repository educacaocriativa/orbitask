import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeDate(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function formatDeadline(date: string | Date): string {
  const d = new Date(date)
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function isOverdue(date: string | Date): boolean {
  return isPast(new Date(date))
}

export function getPriorityLabel(p: string): string {
  return { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítico' }[p] ?? p
}

export function getPriorityIcon(p: string): string {
  return { LOW: '🌿', MEDIUM: '⚡', HIGH: '🔥', CRITICAL: '☢️' }[p] ?? '⚡'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

