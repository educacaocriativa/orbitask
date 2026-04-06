import { useBoardStore } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * Returns true if the current user is a COORDINATOR of the currently loaded board.
 * Admins are always treated as having full permissions and do NOT need this hook.
 */
export function useIsCoordinator(): boolean {
  const board       = useBoardStore((s) => s.board)
  const currentUser = useAuthStore((s) => s.user)

  if (!board || !currentUser) return false
  return board.members.some(
    (m) => m.userId === currentUser.id && m.role === 'COORDINATOR'
  )
}
