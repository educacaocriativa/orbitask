import bcrypt from 'bcryptjs'
import { UserRole } from '@prisma/client'
import { prisma } from '../database/prisma'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'

export class AdminService {
  // ── List all users with last activity ──────────────────
  async listUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { lastAccessAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          avatarUrl: true,
          phoneWhatsapp: true,
          lastAccessAt: true,
          lastCommentAt: true,
          lastCommentText: true,
          createdAt: true,
          _count: {
            select: {
              createdCards: true,
              accessLogs: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ])

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // ── Create user (admin only) ────────────────────────────
  async createUser(data: {
    name: string
    email: string
    password: string
    role: UserRole
    phoneWhatsapp?: string
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })
    if (existing) throw new AppError('E-mail already registered', 409)

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS)

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        phoneWhatsapp: data.phoneWhatsapp,
      },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, phoneWhatsapp: true, createdAt: true,
      },
    })
  }

  // ── Toggle user active status ───────────────────────────
  /**
   * Ativa ou desativa um usuário.
   *
   * Desativar TAMBÉM desfaz os vínculos de trabalho — participação em missões,
   * em etapas e nas timelines. Sem isso a pessoa continuava aparecendo como
   * membro e recebendo demanda depois de sair da empresa, porque essas listas
   * partem do vínculo e não do `isActive`.
   *
   * O histórico é preservado: quem criou card, enviou arquivo ou passou por
   * cada etapa continua registrado. Some de onde geraria trabalho novo, não de
   * onde conta o que já aconteceu.
   */
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('User not found', 404)

    if (isActive) {
      // Reativar não recria vínculo: quem readmite escolhe de novo onde a
      // pessoa entra, em vez de ela reaparecer em lugares esquecidos.
      return prisma.user.update({
        where: { id: userId },
        data: { isActive },
        select: { id: true, name: true, email: true, isActive: true },
      })
    }

    // Etapa sem dono trava o quadro: ninguém consegue mover card nela. Recusa
    // e diz quais são, para o admin passar a responsabilidade antes.
    const ownedColumns = await prisma.column.findMany({
      where:  { ownerId: userId, isArchived: false, board: { isArchived: false } },
      select: { title: true, board: { select: { title: true } } },
      orderBy: { title: 'asc' },
    })

    if (ownedColumns.length > 0) {
      const lista = ownedColumns
        .map((c) => `"${c.title}" (${c.board.title})`)
        .join(', ')
      throw new AppError(
        `${user.name} é responsável por ${ownedColumns.length} etapa(s): ${lista}. ` +
        'Passe a responsabilidade para outra pessoa antes de desativar — ' +
        'etapa sem dono não deixa ninguém mover card.',
        400,
      )
    }

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isActive },
        select: { id: true, name: true, email: true, isActive: true },
      }),
      prisma.boardMember.deleteMany({ where: { userId } }),
      prisma.columnMember.deleteMany({ where: { userId } }),
      prisma.timelineMember.deleteMany({ where: { userId } }),
    ])

    return updated
  }

  // ── Update user role ────────────────────────────────────
  async updateUserRole(userId: string, role: UserRole) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('User not found', 404)

    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    })
  }

  // ── Get access logs (dashboard) ─────────────────────────
  // When userId is set, returns the FULL history for that user (no take cap).
  async getAccessLogs(options: {
    userId?: string
    action?: string
    from?: Date
    to?: Date
    page?: number
    limit?: number
  }) {
    const { userId, action, from, to, page = 1, limit = 50 } = options

    const where = {
      ...(userId && { userId }),
      ...(action && { action }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    }

    // Full history when filtering by user; paginated otherwise.
    const skip   = userId ? undefined : (page - 1) * limit
    const take   = userId ? undefined : limit

    const [logs, total] = await prisma.$transaction([
      prisma.accessLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.accessLog.count({ where }),
    ])

    const effectiveLimit = take ?? total
    return {
      logs,
      pagination: {
        total,
        page: userId ? 1 : page,
        limit: effectiveLimit,
        totalPages: userId ? 1 : Math.ceil(total / limit),
      },
    }
  }

  // ── Get files uploaded by a user ───────────────────────
  async getUserFiles(userId: string) {
    return prisma.file.findMany({
      where: { uploadedById: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        fileType: true,
        sizeBytes: true,
        createdAt: true,
        cardSection: {
          select: {
            card: { select: { id: true, title: true } },
            column: { select: { title: true, board: { select: { id: true, title: true } } } },
          },
        },
      },
    })
  }

  // ── Dashboard summary ───────────────────────────────────
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalBoards,
      totalCards,
      recentLogins,
      overdueCards,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.board.count({ where: { isArchived: false } }),
      prisma.card.count({ where: { isArchived: false } }),
      prisma.accessLog.findMany({
        where: {
          action: 'LOGIN',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      prisma.card.count({
        where: {
          isOverdue: true,
          isArchived: false,
        },
      }),
    ])

    return {
      counts: { totalUsers, activeUsers, totalBoards, totalCards, overdueCards },
      recentLogins,
    }
  }
}

