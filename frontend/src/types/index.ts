// ─────────────────────────────────────────────────────
//  Orbitask — Shared Frontend Types
// ─────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type NotificationType =
  | 'CARD_MOVED'
  | 'MENTION'
  | 'DEADLINE_EXPIRED'
  | 'DEADLINE_WARNING'
  | 'CARD_ASSIGNED'

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'

export type FileType = 'PDF' | 'WORD' | 'IMAGE' | 'OTHER'

export interface ApiUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl?: string
  phoneWhatsapp?: string
  isActive?: boolean
  lastAccessAt?: string
  lastCommentAt?: string
  lastCommentText?: string
  createdAt?: string
}

export interface ApiBoard {
  id: string
  title: string
  description?: string
  color: string
  owner: Pick<ApiUser, 'id' | 'name' | 'avatarUrl'>
  createdAt: string
  _count?: { columns: number; cards: number }
}

export interface ApiColumn {
  id: string
  title: string
  position: number
  color: string
  boardId: string
  ownerId: string
  owner: Pick<ApiUser, 'id' | 'name' | 'avatarUrl'>
  cards: ApiCard[]
}

export interface ApiCard {
  id: string
  title: string
  description?: string
  priority: Priority
  tags: string[]
  position: number
  deadline?: string
  deadlineAt?: string
  isOverdue: boolean
  currentColumnId: string
  boardId: string
  creatorId: string
  creator: Pick<ApiUser, 'id' | 'name' | 'avatarUrl'>
  currentColumn?: Pick<ApiColumn, 'id' | 'title' | 'color'>
  board?: Pick<ApiBoard, 'id' | 'title'>
  sections?: ApiCardSection[]
  _count?: { sections: number }
}

export interface ApiCardSection {
  id: string
  cardId: string
  columnId: string
  ownerId: string
  content: Record<string, unknown> | null
  owner: Pick<ApiUser, 'id' | 'name' | 'avatarUrl'>
  column: Pick<ApiColumn, 'id' | 'title' | 'color'>
  files: ApiFile[]
  mentions?: ApiMention[]
  createdAt: string
  updatedAt: string
}

export interface ApiFile {
  id: string
  originalName: string
  storagePath: string
  mimeType: string
  fileType: FileType
  sizeBytes: number
  url?: string
  cardSectionId: string
  uploadedById: string
  createdAt: string
}

export interface ApiMention {
  id: string
  cardSectionId: string
  mentionedUserId: string
  mentionedUser: Pick<ApiUser, 'id' | 'name' | 'avatarUrl'>
  mentionedById: string
  whatsappSent: boolean
  createdAt: string
}

export interface ApiNotification {
  id: string
  type: NotificationType
  status: NotificationStatus
  payload: Record<string, unknown>
  recipientId: string
  cardId?: string
  card?: Pick<ApiCard, 'id' | 'title'>
  scheduledFor: string
  sentAt?: string
  retryCount: number
  createdAt: string
}

export interface ApiAccessLog {
  id: string
  action: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
  userId: string
  user: Pick<ApiUser, 'id' | 'name' | 'email'>
  createdAt: string
}

// API response wrappers
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface ApiError {
  error: string
  statusCode: number
  details?: unknown
}

