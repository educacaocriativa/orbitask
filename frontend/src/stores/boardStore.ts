'use client'
import { create } from 'zustand'
import api from '@/lib/api'

export interface User {
  id: string; name: string; avatarUrl?: string
}

export interface CardFile {
  id: string; originalName: string; mimeType: string
  sizeBytes: number; url?: string; fileType: string
}

export interface CardSection {
  id: string; columnId: string; ownerId: string
  owner: User; column: { id: string; title: string; color: string }
  content: Record<string, unknown> | null
  files: CardFile[]
}

export interface Card {
  id: string; title: string; description?: string
  priority: string; tags: string[]; position: number
  deadline?: string; isOverdue: boolean
  currentColumnId: string
  lastMovedByUserId?: string | null
  columnEnteredAt?: string | null
  creator: User
  _count?: { sections: number }
  pendingMentionCount?: number
  // Archive fields
  isArchived?: boolean
  archivedAt?: string
  archivedFromColumnId?: string | null
  archivedFromColumn?: { id: string; title: string; color: string } | null
}

export interface Column {
  id: string; title: string; position: number; color: string
  owner: User; ownerId: string
  columnMembers: { user: User }[]
  cards: Card[]
}

export interface BoardMember {
  id: string; userId: string
  role: 'COORDINATOR' | 'MEMBER'
  user: User & { email?: string }
}

export interface Board {
  id: string; title: string; description?: string; color: string
  owner: User; columns: Column[]; members: BoardMember[]
}

interface BoardState {
  board: Board | null
  isLoading: boolean
  activeCard: Card | null
  openCardId: string | null

  fetchBoard: (id: string) => Promise<void>
  moveCard: (cardId: string, targetColumnId: string, position: number, deadline: string) => Promise<void>
  reorderCard: (columnId: string, cardIds: string[]) => Promise<void>
  addCard: (boardId: string, data: Partial<Card> & { columnId: string }) => Promise<void>
  updateCard: (cardId: string, data: Partial<Card>) => Promise<void>
  archiveCard: (cardId: string) => Promise<void>
  restoreCard: (cardId: string) => Promise<void>
  fetchArchivedCards: (boardId: string) => Promise<Card[]>
  fetchOverdueCards: (boardId: string) => Promise<Card[]>
  setActiveCard: (card: Card | null) => void
  setOpenCard: (id: string | null) => void

  // Optimistic updates
  optimisticMove: (cardId: string, fromColumnId: string, toColumnId: string, position: number, movedByUserId: string) => void
}

export const useBoardStore = create<BoardState>()((set, get) => ({
  board: null,
  isLoading: false,
  activeCard: null,
  openCardId: null,

  fetchBoard: async (id) => {
    set({ isLoading: true })
    try {
      const { data } = await api.get(`/boards/${id}`)
      // Normalize: compute pendingMentionCount per card and drop raw sections
      const board = data.board
      board.columns = board.columns.map((col: any) => ({
        ...col,
        cards: col.cards.map((card: any) => {
          const count = (card.sections ?? []).reduce(
            (acc: number, s: any) => acc + (s.mentions?.length ?? 0), 0
          )
          const { sections: _s, ...rest } = card
          return { ...rest, pendingMentionCount: count }
        }),
      }))
      set({ board, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  optimisticMove: (cardId, fromColumnId, toColumnId, position, movedByUserId) => {
    set((state) => {
      if (!state.board) return state
      const cols = state.board.columns.map((col) => {
        if (col.id === fromColumnId) {
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
        }
        if (col.id === toColumnId) {
          const movingCard = state.board!.columns
            .find((c) => c.id === fromColumnId)?.cards
            .find((c) => c.id === cardId)
          if (!movingCard) return col
          const cards = [...col.cards]
          cards.splice(position, 0, { ...movingCard, currentColumnId: toColumnId, lastMovedByUserId: movedByUserId })
          return { ...col, cards }
        }
        return col
      })
      return { board: { ...state.board, columns: cols } }
    })
  },

  moveCard: async (cardId, targetColumnId, position, deadline) => {
    const { data } = await api.post(`/cards/${cardId}/move`, {
      targetColumnId, targetPosition: position, deadline,
    })
    // Re-fetch to sync with server
    const { board } = get()
    if (board) get().fetchBoard(board.id)
    return data
  },

  reorderCard: async (columnId, cardIds) => {
    await api.patch('/cards/reorder', { columnId, cardIds })
  },

  addCard: async (boardId, cardData) => {
    const { data } = await api.post(`/boards/${boardId}/cards`, cardData)
    set((state) => {
      if (!state.board) return state
      const cols = state.board.columns.map((col) => {
        if (col.id === cardData.columnId) {
          return { ...col, cards: [...col.cards, data.card] }
        }
        return col
      })
      return { board: { ...state.board, columns: cols } }
    })
  },

  updateCard: async (cardId, cardData) => {
    const { data } = await api.patch(`/cards/${cardId}`, cardData)
    set((state) => {
      if (!state.board) return state
      const cols = state.board.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...data.card } : c)),
      }))
      return { board: { ...state.board, columns: cols } }
    })
  },

  archiveCard: async (cardId) => {
    await api.delete(`/cards/${cardId}`)
    set((state) => {
      if (!state.board) return state
      const cols = state.board.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      }))
      return { board: { ...state.board, columns: cols } }
    })
  },

  restoreCard: async (cardId) => {
    await api.post(`/cards/${cardId}/restore`)
    const { board } = get()
    if (board) get().fetchBoard(board.id)
  },

  fetchArchivedCards: async (boardId) => {
    const { data } = await api.get(`/boards/${boardId}/archived-cards`)
    return data.cards as Card[]
  },

  fetchOverdueCards: async (boardId) => {
    const { data } = await api.get(`/boards/${boardId}/overdue-cards`)
    return data.cards as Card[]
  },

  setActiveCard: (card) => set({ activeCard: card }),
  setOpenCard: (id) => set({ openCardId: id }),
}))

