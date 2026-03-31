import type { FastifyInstance } from 'fastify'
import { AuthService } from '../services/AuthService'
import { authenticate } from '../middlewares/auth'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app)

  // ── POST /auth/register ─────────────────────────────────
  app.post('/auth/register', async (request, reply) => {
    const body = request.body as {
      name: string; email: string; password: string; phoneWhatsapp?: string
    }

    const user = await authService.register(body)

    return reply.status(201).send({
      message: 'User registered successfully',
      user,
    })
  })

  // ── POST /auth/login ────────────────────────────────────
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }

    const result = await authService.login({
      email,
      password,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    return reply.send({
      message: 'Login successful',
      ...result,
    })
  })

  // ── POST /auth/logout ────────────────────────────────────
  app.post('/auth/logout', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    await authService.logout(request.user.id, request.ip)
    return reply.send({ message: 'Logged out successfully' })
  })

  // ── GET /auth/me ────────────────────────────────────────
  app.get('/auth/me', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const user = await authService.getProfile(request.user.id)
    return reply.send({ user })
  })

  // ── PATCH /auth/password ─────────────────────────────────
  app.patch('/auth/password', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body as {
      currentPassword: string; newPassword: string
    }

    await authService.changePassword(request.user.id, currentPassword, newPassword)

    return reply.send({ message: 'Password changed successfully' })
  })
}

