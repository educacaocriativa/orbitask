'use client'
import { cn, getInitials } from '@/lib/utils'

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: string
}

const SIZES = {
  xs: 'w-5 h-5 text-[9px] rounded-md',
  sm: 'w-7 h-7 text-[10px] rounded-lg',
  md: 'w-9 h-9 text-xs rounded-xl',
  lg: 'w-12 h-12 text-sm rounded-xl',
  xl: 'w-16 h-16 text-base rounded-2xl',
}

export function Avatar({ name, src, size = 'md', className, color }: AvatarProps) {
  const initials = getInitials(name)

  return (
    <div
      className={cn(
        SIZES[size],
        'flex items-center justify-center font-display font-bold text-white',
        'overflow-hidden shrink-0 select-none',
        className,
      )}
      style={{
        background: color
          ? `${color}30`
          : 'linear-gradient(135deg, rgba(124,58,237,0.35), rgba(6,182,212,0.35))',
        border: color ? `1px solid ${color}40` : '1px solid rgba(255,255,255,0.08)',
      }}
      title={name}
    >
      {src && !src.startsWith('avatars/') ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fall back to initials on broken image
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}

