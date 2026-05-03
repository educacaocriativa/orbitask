import bcrypt from 'bcryptjs'
import { prisma } from '../database/prisma'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import type { FastifyInstance } from 'fastify'

interface RegisterDTO {
  name: string
  email: string
  password: string
  phoneWhatsapp?: string
}

interface LoginDTO {
  email: string
  password: string
  ipAddress?: string
  userAgent?: string
}

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  async register(data: RegisterDTO) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (existingUser) {
      throw new AppError('E-mail already registered', 409)
    }

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS)

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        passwordHash,
        phoneWhatsapp: data.phoneWhatsapp,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        phoneWhatsapp: true,
        createdAt: true,
      },
    })

    return user
  }

  async login(data: LoginDTO) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (!user) {
      throw new AppError('Invalid credentials', 401)
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated. Contact the administrator.', 403)
    }

    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash)

    if (!passwordMatch) {
      throw new AppError('Invalid credentials', 401)
    }

    // Generate JWT
    const token = this.app.jwt.sign(
      {
        sub:       user.id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        crmAccess: (user as any).crmAccess ?? false,
      },
      { expiresIn: env.JWT_EXPIRES_IN }
    )

    // Update last access + log
    await prisma.user.update({
      where: { id: user.id },
      data: { lastAccessAt: new Date() },
    })

    await prisma.accessLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: { success: true },
      },
    })

    return {
      token,
      user: {
        id:            user.id,
        name:          user.name,
        email:         user.email,
        role:          user.role,
        avatarUrl:     user.avatarUrl,
        phoneWhatsapp: user.phoneWhatsapp,
        crmAccess:     (user as any).crmAccess ?? false,
      },
    }
  }

  async logout(userId: string, ipAddress?: string) {
    await prisma.accessLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        ipAddress,
        metadata: {},
      },
    })
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        phoneWhatsapp: true,
        lastAccessAt: true,
        createdAt: true,
        crmAccess: true,
      } as any,
    })

    if (!user) throw new AppError('User not found', 404)

    return user
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('User not found', 404)

    const match = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!match) throw new AppError('Current password is incorrect', 400)

    const newHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })
  }
}

