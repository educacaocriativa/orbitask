/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        body: ['Syne', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        space: {
          void:    '#03010a',
          deep:    '#07031a',
          navy:    '#0d0a2e',
          nebula:  '#120f3d',
          mist:    '#1a1650',
        },
        neon: {
          violet:  '#7c3aed',
          purple:  '#a855f7',
          cyan:    '#06b6d4',
          teal:    '#14b8a6',
          pink:    '#ec4899',
          amber:   '#f59e0b',
          emerald: '#10b981',
          red:     '#ef4444',
        },
        glass: {
          white:   'rgba(255,255,255,0.04)',
          hover:   'rgba(255,255,255,0.07)',
          border:  'rgba(255,255,255,0.08)',
          strong:  'rgba(255,255,255,0.12)',
        },
      },
      backgroundImage: {
        'space-gradient': 'radial-gradient(ellipse 80% 60% at 50% -10%, #1a0a4a 0%, #03010a 70%)',
        'nebula-left':    'radial-gradient(ellipse 40% 60% at -10% 50%, rgba(124,58,237,0.15) 0%, transparent 70%)',
        'nebula-right':   'radial-gradient(ellipse 40% 60% at 110% 50%, rgba(6,182,212,0.10) 0%, transparent 70%)',
        'card-glow':      'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.05) 100%)',
        'col-header':     'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
      },
      boxShadow: {
        'neon-violet':  '0 0 20px rgba(124,58,237,0.35), 0 0 60px rgba(124,58,237,0.10)',
        'neon-cyan':    '0 0 20px rgba(6,182,212,0.35),  0 0 60px rgba(6,182,212,0.10)',
        'neon-pink':    '0 0 20px rgba(236,72,153,0.35), 0 0 60px rgba(236,72,153,0.10)',
        'glass':        '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        'card':         '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card-hover':   '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.3)',
      },
      backdropBlur: {
        xs: '4px',
        glass: '16px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'pulse-slow':   'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
        'float':        'float 6s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'orbit':        'orbit 20s linear infinite',
        'twinkle':      'twinkle 3s ease-in-out infinite',
        'glow-pulse':   'glow-pulse 2s ease-in-out infinite',
        'slide-up':     'slide-up 0.4s cubic-bezier(0.16,1,0.3,1)',
        'slide-right':  'slide-right 0.4s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':      'fade-in 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        orbit: {
          from: { transform: 'rotate(0deg) translateX(120px) rotate(0deg)' },
          to:   { transform: 'rotate(360deg) translateX(120px) rotate(-360deg)' },
        },
        twinkle: {
          '0%,100%': { opacity: '0.2', transform: 'scale(1)' },
          '50%':     { opacity: '1',   transform: 'scale(1.4)' },
        },
        'glow-pulse': {
          '0%,100%': { boxShadow: '0 0 20px rgba(124,58,237,0.3)' },
          '50%':     { boxShadow: '0 0 40px rgba(124,58,237,0.6), 0 0 80px rgba(124,58,237,0.2)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-right': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

