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

export type TimelineApproval = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface TimelineMention {
  id: string
  /** Decisão de quem foi marcado. É registro visual: não bloqueia nada. */
  approval: TimelineApproval
  decidedAt: string | null
  /** Comentário da decisão. Obrigatório ao reprovar. */
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
  /** null enquanto o documento não foi realocado para um projeto. */
  boardId: string | null
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

/** Projeto na tela de seleção da Timeline. */
export interface TimelineBoard {
  id: string
  title: string
  description: string | null
  color: string
  /** Criado pela Timeline: não aparece em missões ativas. */
  timelineOnly: boolean
  driveFolderUrl: string | null
  documentCount: number
  memberCount: number
  lastDocumentDate: string | null
}

export interface TimelineBoardsResponse {
  boards: TimelineBoard[]
  /** Documentos anteriores à separação por projeto. Só ADMIN enxerga. */
  orphanCount: number
}

/** Pessoa na tela de gerenciar acesso de um projeto. */
export interface TimelineBoardPerson extends TimelinePerson {
  role: string
  /** Já participa da timeline deste projeto. */
  isMember: boolean
  /** Já é membro do projeto no Kanban — aparece primeiro na lista. */
  inProject: boolean
}
