import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../utils/AppError'
import { prisma } from '../database/prisma'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      name: string
      email: string
      role: string
    }
    user: {
      id: string
      name: string
      email: string
      role: string
    }
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify()

    // Attach full user info
    const payload = request.user
    request.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    }
  } catch {
    throw new AppError('Unauthorized: invalid or expired token', 401)
  }
}

export function requireAdmin(roles: string[] = ['ADMIN']) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply)

    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden: insufficient permissions', 403)
    }
  }
}

// Log every authenticated request
export async function logRequest(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user?.id
  if (!userId) return

  const action = `${request.method}:${request.routeOptions?.url ?? request.url}`

  // Fire-and-forget (don't await)
  prisma.accessLog
    .create({
      data: {
        userId,
        action,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: { statusCode: reply.statusCode },
      },
    })
    .catch(() => {})
}

