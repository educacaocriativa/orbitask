export interface TimelinePerson {
  id: string
  name: string
  email?: string
  avatarUrl?: string
}

export interface TimelineFile {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  driveFileUrl: string | null
  createdAt: string
  uploadedBy: TimelinePerson
}

export interface TimelineMention {
  id: string
  reply: string | null
  repliedAt: string | null
  createdAt: string
  mentionedUser: TimelinePerson
  mentionedBy: TimelinePerson
  repliedBy: TimelinePerson | null
}

export interface TimelineDocument {
  id: string
  name: string
  description: string | null
  date: string
  driveFolderUrl: string | null
  createdAt: string
  createdBy: TimelinePerson
  files: TimelineFile[]
  mentions: TimelineMention[]
}

export interface TimelineDay {
  /** AAAA-MM-DD */
  date: string
  /** Aceita documento novo. Ver a regra em TimelineService.isDateOpen. */
  isOpen: boolean
  isToday: boolean
  isPast: boolean
  documents: TimelineDocument[]
}

export interface TimelineMonthData {
  year: number
  month: number
  label: string
  days: TimelineDay[]
}

export interface TimelineAccessUser extends TimelinePerson {
  role: string
  timelineAccess: boolean
}
