import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'

// ── Connection registry ───────────────────────────────────
// Map: boardId → Set of active WebSocket connections
const boardRooms = new Map<string, Set<WebSocket>>()
// Map: ws → { userId, boardId }
const connMeta   = new Map<WebSocket, { userId: string; boardId: string }>()

export type WsEventType =
  | 'CARD_MOVED'
  | 'CARD_CREATED'
  | 'CARD_UPDATED'
  | 'CARD_ARCHIVED'
  | 'COLUMN_UPDATED'
  | 'SECTION_UPDATED'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'DEADLINE_ALERT'

export interface WsEvent {
  type: WsEventType
  boardId: string
  payload: Record<string, unknown>
  actorId?: string
  actorName?: string
  timestamp: string
}

// ── Broadcast to all sockets in a board room ─────────────
export function broadcastToBoard(boardId: string, event: WsEvent, excludeWs?: WebSocket) {
  const room = boardRooms.get(boardId)
  if (!room) return

  const message = JSON.stringify(event)
  for (const ws of room) {
    if (ws !== excludeWs && ws.readyState === 1 /* OPEN */) {
      ws.send(message)
    }
  }
}

// ── Register WebSocket routes ─────────────────────────────
export async function websocketRoutes(app: FastifyInstance) {
  // @fastify/websocket registers ws at the route level
  app.get('/ws/board/:boardId', { websocket: true }, (socket, request) => {
    const { boardId } = request.params as { boardId: string }

    // Authenticate via query param token (WS can't send headers easily)
    const token = (request.query as Record<string, string>).token
    let userId = 'anonymous'
    let userName = 'Unknown'

    try {
      const decoded = app.jwt.verify<{ sub: string; name: string }>(token)
      userId   = decoded.sub
      userName = decoded.name
    } catch {
      socket.close(1008, 'Unauthorized')
      return
    }

    // Join room
    if (!boardRooms.has(boardId)) boardRooms.set(boardId, new Set())
    boardRooms.get(boardId)!.add(socket)
    connMeta.set(socket, { userId, boardId })

    // Notify others that someone joined
    broadcastToBoard(boardId, {
      type: 'USER_JOINED',
      boardId,
      payload: { userId, userName },
      actorId: userId,
      actorName: userName,
      timestamp: new Date().toISOString(),
    }, socket)

    // Handle incoming messages (client → server)
    socket.on('message', (raw: Buffer) => {
      try {
        const event = JSON.parse(raw.toString()) as WsEvent
        // Echo validated events to room (server as message relay)
        broadcastToBoard(boardId, {
          ...event,
          boardId,
          actorId: userId,
          actorName: userName,
          timestamp: new Date().toISOString(),
        }, socket)
      } catch {
        // Ignore malformed messages
      }
    })

    // Cleanup on disconnect
    socket.on('close', () => {
      boardRooms.get(boardId)?.delete(socket)
      connMeta.delete(socket)

      if (boardRooms.get(boardId)?.size === 0) {
        boardRooms.delete(boardId)
      }

      broadcastToBoard(boardId, {
        type: 'USER_LEFT',
        boardId,
        payload: { userId, userName },
        actorId: userId,
        actorName: userName,
        timestamp: new Date().toISOString(),
      })
    })

    // Send initial ack
    socket.send(JSON.stringify({
      type: 'USER_JOINED',
      boardId,
      payload: { self: true, userId, userName },
      timestamp: new Date().toISOString(),
    }))
  })
}

// ── Helper: get active users in a board ──────────────────
export function getActiveUsers(boardId: string): string[] {
  const room = boardRooms.get(boardId)
  if (!room) return []
  return [...room]
    .map((ws) => connMeta.get(ws)?.userId)
    .filter(Boolean) as string[]
}

