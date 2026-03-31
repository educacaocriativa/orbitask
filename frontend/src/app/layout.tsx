import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Orbitask — Mission Control',
  description: 'Space-themed project management with WhatsApp automation',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-space-void text-white antialiased">
        {/* Cosmic background layers */}
        <div className="starfield" aria-hidden="true" />
        <div className="nebula-bg" aria-hidden="true" />

        {/* Main content above background */}
        <div className="relative z-10">
          {children}
        </div>

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(13,10,46,0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(124,58,237,0.3)',
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'Syne, sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: 'transparent' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: 'transparent' },
            },
          }}
        />
      </body>
    </html>
  )
}

