'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'
import { setAuthCookie, removeAuthCookie } from '@/lib/cookies'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER' | 'GUEST'
  avatarUrl?: string
  phoneWhatsapp?: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: AuthUser) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const { data } = await api.post('/auth/login', { email, password })
          // Store token in localStorage (api.ts reads it) AND cookie (middleware reads it)
          localStorage.setItem('orbitask:token', data.token)
          setAuthCookie(data.token)
          set({ user: data.user, token: data.token, isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout')
        } finally {
          localStorage.removeItem('orbitask:token')
          localStorage.removeItem('orbitask:auth')
          removeAuthCookie()
          set({ user: null, token: null })
          window.location.href = '/auth/login'
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'orbitask:auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)

