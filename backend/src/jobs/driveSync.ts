import cron from 'node-cron'
import { prisma } from '../database/prisma'
import { googleDrive } from '../services/GoogleDriveService'
import { env } from '../config/env'

// ── Core sync logic (also exported for manual runs via admin route) ──
export async function syncDriveAccess() {
  console.log('🔄 [Drive Sync] Iniciando sincronização de acessos...')

  if (!googleDrive.isConfigured) {
    console.log('⚠️  [Drive Sync] Google Drive não configurado — pulando')
    return { added: 0, removed: 0, foldersChecked: 0 }
  }

  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.toLowerCase()

  // ── 1. Carregar todas as missões ativas com membros ───────
  const boards = await prisma.board.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      driveFolderId: true,
      owner: { select: { email: true } },
      members: { select: { user: { select: { email: true } } } },
    },
  })

  // Conjunto de todos os e-mails autorizados (donos + membros de qualquer missão ativa)
  const authorizedEmails = new Set<string>()
  for (const board of boards) {
    if (board.owner.email) authorizedEmails.add(board.owner.email.toLowerCase())
    for (const m of board.members) {
      if (m.user.email) authorizedEmails.add(m.user.email.toLowerCase())
    }
  }

  let totalAdded = 0
  let totalRemoved = 0
  let foldersChecked = 0

  // ── 2. Sincronizar Shared Drive ───────────────────────────
  if (env.GOOGLE_SHARED_DRIVE_ID) {
    const drivePerms = await googleDrive.listPermissions(env.GOOGLE_SHARED_DRIVE_ID)
    const driveMemberEmails = new Set(
      drivePerms
        .filter((p) => p.type === 'user' && p.emailAddress)
        .map((p) => p.emailAddress!.toLowerCase())
    )

    // Adicionar quem falta
    const toAdd = [...authorizedEmails].filter((e) => !driveMemberEmails.has(e))
    if (toAdd.length > 0) {
      console.log(`➕ [Drive Sync] Shared Drive — adicionando ${toAdd.length} usuário(s)`)
      await googleDrive.addMembersToSharedDrive(toAdd)
      totalAdded += toAdd.length
    }

    // Remover quem não deveria estar (ignora service account e owners do drive)
    const toRemove = [...driveMemberEmails].filter(
      (e) => !authorizedEmails.has(e) && e !== serviceAccountEmail
    )
    if (toRemove.length > 0) {
      console.log(`➖ [Drive Sync] Shared Drive — removendo ${toRemove.length} usuário(s)`)
      await googleDrive.removeMembersFromSharedDrive(toRemove)
      totalRemoved += toRemove.length
    }
  }

  // ── 3. Sincronizar pastas das missões ─────────────────────
  for (const board of boards) {
    if (!board.driveFolderId) continue

    const boardEmails = new Set<string>()
    if (board.owner.email) boardEmails.add(board.owner.email.toLowerCase())
    for (const m of board.members) {
      if (m.user.email) boardEmails.add(m.user.email.toLowerCase())
    }

    const { added, removed } = await syncFolderPermissions(board.driveFolderId, boardEmails, serviceAccountEmail)
    totalAdded += added
    totalRemoved += removed
    foldersChecked++
  }

  // ── 4. Sincronizar pastas das etapas ──────────────────────
  const columns = await prisma.column.findMany({
    where: {
      isArchived: false,
      driveFolderId: { not: null },
      board: { isArchived: false },
    },
    select: {
      driveFolderId: true,
      columnMembers: { select: { user: { select: { email: true } } } },
    },
  })

  for (const col of columns) {
    if (!col.driveFolderId) continue

    const colEmails = new Set(
      col.columnMembers
        .map((m) => m.user.email?.toLowerCase())
        .filter((e): e is string => !!e)
    )

    const { added, removed } = await syncFolderPermissions(col.driveFolderId, colEmails, serviceAccountEmail)
    totalAdded += added
    totalRemoved += removed
    foldersChecked++
  }

  const summary = { added: totalAdded, removed: totalRemoved, foldersChecked }
  console.log(`✅ [Drive Sync] Concluído — +${totalAdded} adicionado(s), -${totalRemoved} removido(s), ${foldersChecked} pasta(s) verificada(s)`)
  return summary
}

// ── Helper: adiciona/remove permissões de uma pasta específica ──
async function syncFolderPermissions(
  folderId: string,
  authorizedEmails: Set<string>,
  serviceAccountEmail: string | undefined,
): Promise<{ added: number; removed: number }> {
  const perms = await googleDrive.listPermissions(folderId)

  const currentEmails = new Set(
    perms
      .filter((p) => p.type === 'user' && p.emailAddress && p.role !== 'owner')
      .map((p) => p.emailAddress!.toLowerCase())
  )

  const toAdd = [...authorizedEmails].filter((e) => !currentEmails.has(e))
  const toRemove = [...currentEmails].filter(
    (e) => !authorizedEmails.has(e) && e !== serviceAccountEmail
  )

  if (toAdd.length > 0) await googleDrive.shareFolderWithMany(folderId, toAdd)
  if (toRemove.length > 0) await googleDrive.revokePermissionFromMany(folderId, toRemove)

  return { added: toAdd.length, removed: toRemove.length }
}

// ── Cron: todo dia às 12h (Brasília) ──────────────────────
export function startDriveSyncCron() {
  cron.schedule('0 12 * * *', async () => {
    console.log('⏰ [12h Brasília] Drive Sync — verificando acessos...')
    try {
      await syncDriveAccess()
    } catch (err) {
      console.error('❌ [Drive Sync] Erro na sincronização:', err)
    }
  }, { timezone: 'America/Sao_Paulo' })

  console.log('⏰ Cron Drive Sync agendado: 12h — Horário de Brasília')
}
