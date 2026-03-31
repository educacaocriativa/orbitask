'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useBoardStore } from '@/stores/boardStore'
import toast from 'react-hot-toast'

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333')
  .replace(/^http/, 'ws')

export function useBoardSocket(boardId: string | null) {
  const wsRef    = useRef<WebSocket | null>(null)
  const { token } = useAuthStore()
  const { fetchBoard } = useBoardStore()

  const connect = useCallback(() => {
    if (!boardId || !token) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}/ws/board/${boardId}?token=${token}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => console.log('🛸 WebSocket connected')

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        handleEvent(event)
      } catch { /* ignore */ }
    }

    ws.onclose = (e) => {
      if (e.code !== 1000) {
        // Reconnect after 3s on unexpected close
        setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => console.warn('⚠️ WebSocket error')
  }, [boardId, token])

  function handleEvent(event: { type: string; payload: Record<string, unknown>; actorName?: string }) {
    switch (event.type) {
      case 'CARD_MOVED':
        toast(`🚀 ${event.actorName ?? 'Alguém'} moveu um card`, { duration: 2500 })
        if (boardId) fetchBoard(boardId)
        break
      case 'CARD_CREATED':
        toast(`🃏 Novo card adicionado por ${event.actorName ?? 'alguém'}`, { duration: 2500 })
        if (boardId) fetchBoard(boardId)
        break
      case 'CARD_UPDATED':
        if (boardId) fetchBoard(boardId)
        break
      case 'CARD_ARCHIVED':
        if (boardId) fetchBoard(boardId)
        break
      case 'USER_JOINED':
        if (!event.payload?.self) {
          toast(`👨‍🚀 ${event.actorName} entrou no board`, { duration: 2000, icon: '🛸' })
        }
        break
      case 'USER_LEFT':
        toast(`${event.actorName} saiu`, { duration: 1500 })
        break
      case 'DEADLINE_ALERT':
        toast.error(`⚠️ Prazo expirado: ${event.payload?.cardTitle}`, { duration: 5000 })
        break
    }
  }

  // Broadcast an event from this client
  const broadcast = useCallback((type: string, payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close(1000, 'Leaving board')
    }
  }, [connect])

  return { broadcast }
}

