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
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('User not found', 404)

    return prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, email: true, isActive: true },
    })
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
  async getAccessLogs(options: {
    userId?: string
    action?: string
    from?: Date
    to?: Date
    page?: number
    limit?: number
  }) {
    const { userId, action, from, to, page = 1, limit = 50 } = options
    const skip = (page - 1) * limit

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

    const [logs, total] = await prisma.$transaction([
      prisma.accessLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.accessLog.count({ where }),
    ])

    return { logs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }
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

