import { prisma } from '../database/prisma'
import { googleDrive } from '../services/GoogleDriveService'

// O Drive ordena pastas alfabeticamente — o prefixo numérico faz a árvore
// de pastas espelhar a ordem das etapas no quadro.
export function columnFolderName(oneBasedPosition: number, title: string): string {
  return `${String(oneBasedPosition).padStart(2, '0')} - ${title}`
}

// Renomeia as pastas de todas as etapas ativas do board para refletir a
// ordem atual das colunas. Chamar sempre que a ordem mudar (reordenar,
// criar, renomear, arquivar, restaurar ou excluir etapa).
export async function syncColumnFolderNames(boardId: string): Promise<void> {
  if (!googleDrive.isConfigured) return

  const columns = await prisma.column.findMany({
    where: { boardId, isArchived: false },
    orderBy: { position: 'asc' },
    select: { driveFolderId: true, title: true },
  })

  await Promise.allSettled(
    columns.map((col, i) =>
      col.driveFolderId
        ? googleDrive.renameFolder(col.driveFolderId, columnFolderName(i + 1, col.title))
        : Promise.resolve(),
    ),
  )
}
