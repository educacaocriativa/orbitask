import type { FastifyInstance } from 'fastify'
import { UserRole } from '@prisma/client'
import { AdminService } from '../services/AdminService'
import { requireAdmin } from '../middlewares/auth'
import { WhatsAppService } from '../services/WhatsAppService'
import { googleDrive } from '../services/GoogleDriveService'
import { prisma } from '../database/prisma'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

// ── CSV parser (no external dependency) ──────────────────
function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(',')
    const clean  = values.map((v) => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, clean[i] ?? '']))
  }).filter((row) => Object.values(row).some((v) => v))
}

export async function adminRoutes(app: FastifyInstance) {
  const adminService = new AdminService()
  const whatsapp = new WhatsAppService()

  const isAdmin = requireAdmin(['ADMIN'])

  // ── GET /admin/dashboard ────────────────────────────────
  app.get('/admin/dashboard', {
    preHandler: [isAdmin],
  }, async (_request, reply) => {
    const stats = await adminService.getDashboardStats()
    return reply.send(stats)
  })

  // ── GET /admin/users ─────────────────────────────────────
  app.get('/admin/users', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string }
    const result = await adminService.listUsers(
      Number(query.page ?? 1),
      Number(query.limit ?? 20)
    )
    return reply.send(result)
  })

  // ── POST /admin/users ────────────────────────────────────
  app.post('/admin/users', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const body = request.body as {
      name: string; email: string; password: string
      role: UserRole; phoneWhatsapp?: string
    }
    const user = await adminService.createUser(body)
    return reply.status(201).send({ user })
  })

  // ── PATCH /admin/users/:id/status ───────────────────────
  app.patch('/admin/users/:id/status', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { isActive } = request.body as { isActive: boolean }
    const user = await adminService.toggleUserStatus(id, isActive)
    return reply.send({ user })
  })

  // ── PATCH /admin/users/:id/role ──────────────────────────
  app.patch('/admin/users/:id/role', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { role } = request.body as { role: UserRole }
    const user = await adminService.updateUserRole(id, role)
    return reply.send({ user })
  })

  // ── PATCH /admin/users/:id/profile ──────────────────────
  app.patch('/admin/users/:id/profile', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; phoneWhatsapp?: string | null }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          phoneWhatsapp: body.phoneWhatsapp ?? null,
        },
        select: { id: true, name: true, email: true, role: true, isActive: true, phoneWhatsapp: true, avatarUrl: true },
      })
      return reply.send({ user })
    } catch (err: any) {
      console.error('❌ Error updating user profile:', err?.message, err?.code)
      throw new AppError(err?.message ?? 'Erro ao atualizar usuário', 500)
    }
  })

  // ── GET /admin/logs ──────────────────────────────────────
  app.get('/admin/logs', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const query = request.query as {
      userId?: string; action?: string
      from?: string; to?: string
      page?: string; limit?: string
    }

    const result = await adminService.getAccessLogs({
      userId: query.userId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: Number(query.page ?? 1),
      limit: Number(query.limit ?? 50),
    })

    return reply.send(result)
  })

  // ── GET /admin/users/:id/files ──────────────────────────
  app.get('/admin/users/:id/files', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const files = await adminService.getUserFiles(id)
    return reply.send({ files })
  })

  // ── GET /admin/whatsapp/status ───────────────────────────
  app.get('/admin/whatsapp/status', {
    preHandler: [isAdmin],
  }, async (_request, reply) => {
    const status = await whatsapp.checkConnection()
    return reply.send(status)
  })

  // ── POST /admin/import/users ─────────────────────────────
  // CSV columns: nome,email,senha,perfil,telefone
  app.post('/admin/import/users', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) throw new AppError('Nenhum arquivo enviado', 400)

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const csv = Buffer.concat(chunks).toString('utf-8')

    const rows = parseCSV(csv)
    if (rows.length === 0) throw new AppError('CSV vazio ou formato inválido', 400)

    const results: { row: number; email: string; status: string; error?: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const nome     = row['nome']     ?? row['name']     ?? ''
      const email    = row['email']    ?? ''
      const senha    = row['senha']    ?? row['password'] ?? ''
      const perfil   = row['perfil']   ?? row['role']     ?? 'MEMBER'
      const telefone = row['telefone'] ?? row['phone']    ?? ''

      if (!nome || !email || !senha) {
        results.push({ row: i + 2, email, status: 'erro', error: 'nome, email e senha são obrigatórios' })
        continue
      }

      const role = (['ADMIN', 'MEMBER', 'GUEST'].includes(perfil.toUpperCase())
        ? perfil.toUpperCase()
        : 'MEMBER') as UserRole

      try {
        await adminService.createUser({
          name: nome.trim(),
          email: email.trim().toLowerCase(),
          password: senha,
          role,
          phoneWhatsapp: telefone.trim() || undefined,
        })
        results.push({ row: i + 2, email, status: 'criado' })
      } catch (err: any) {
        const msg = err?.message?.includes('Unique') || err?.code === 'P2002'
          ? 'email já cadastrado'
          : (err?.message ?? 'erro desconhecido')
        results.push({ row: i + 2, email, status: 'erro', error: msg })
      }
    }

    const created = results.filter((r) => r.status === 'criado').length
    const errors  = results.filter((r) => r.status === 'erro').length
    return reply.send({ created, errors, results })
  })

  // ── POST /admin/import/missions ──────────────────────────
  // CSV hierarchical format:
  //   tipo=BOARD  → titulo,descricao,cor,membros(emails separados por ;)
  //   tipo=COLUMN → titulo,cor,responsaveis(emails separados por ;)
  //   tipo=CARD   → titulo,descricao,prioridade,prazo(YYYY-MM-DD),tags(;)
  app.post('/admin/import/missions', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) throw new AppError('Nenhum arquivo enviado', 400)

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const csv = Buffer.concat(chunks).toString('utf-8')

    const rows = parseCSV(csv)
    if (rows.length === 0) throw new AppError('CSV vazio ou formato inválido', 400)

    const results: { row: number; tipo: string; titulo: string; status: string; error?: string }[] = []

    let currentBoard: { id: string; title: string } | null = null
    let currentColumn: { id: string; title: string; ownerId: string } | null = null
    let cardPosition = 0
    let columnPosition = 0

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i]
      const tipo = (row['tipo'] ?? row['type'] ?? '').toUpperCase().trim()

      try {
        if (tipo === 'BOARD') {
          const memberEmails = (row['membros'] ?? row['members'] ?? '')
            .split(';').map((e: string) => e.trim()).filter(Boolean)

          const members = await prisma.user.findMany({
            where: { email: { in: memberEmails } },
            select: { id: true },
          })

          const board = await prisma.board.create({
            data: {
              title:       row['titulo'] ?? row['title'] ?? 'Missão importada',
              description: row['descricao'] ?? row['description'] ?? undefined,
              color:       row['cor'] ?? row['color'] ?? '#6366f1',
              ownerId:     request.user.id,
              members: { create: members.map((m) => ({ userId: m.id })) },
            },
          })
          currentBoard   = { id: board.id, title: board.title }
          currentColumn  = null
          columnPosition = 0
          cardPosition   = 0
          results.push({ row: i + 2, tipo: 'BOARD', titulo: board.title, status: 'criado' })

        } else if (tipo === 'COLUMN') {
          if (!currentBoard) throw new Error('COLUMN sem BOARD anterior')

          const ownerEmails = (row['responsaveis'] ?? row['owners'] ?? '')
            .split(';').map((e: string) => e.trim()).filter(Boolean)

          const owners = await prisma.user.findMany({
            where: { email: { in: ownerEmails } },
            select: { id: true },
          })
          const primaryOwnerId = owners[0]?.id ?? request.user.id

          const column = await prisma.column.create({
            data: {
              title:    row['titulo'] ?? row['title'] ?? 'Etapa',
              color:    row['cor']    ?? row['color'] ?? '#818cf8',
              ownerId:  primaryOwnerId,
              boardId:  currentBoard.id,
              position: columnPosition++,
              columnMembers: { create: owners.map((o) => ({ userId: o.id })) },
            },
          })
          currentColumn = { id: column.id, title: column.title, ownerId: primaryOwnerId }
          cardPosition  = 0
          results.push({ row: i + 2, tipo: 'COLUMN', titulo: column.title, status: 'criado' })

        } else if (tipo === 'CARD') {
          if (!currentBoard || !currentColumn) throw new Error('CARD sem BOARD/COLUMN anterior')

          const priority = (['LOW','MEDIUM','HIGH','CRITICAL'].includes(
            (row['prioridade'] ?? row['priority'] ?? '').toUpperCase())
            ? (row['prioridade'] ?? row['priority']).toUpperCase()
            : 'MEDIUM')

          const tags = (row['tags'] ?? '').split(';').map((t: string) => t.trim()).filter(Boolean)
          const deadlineRaw = row['prazo'] ?? row['deadline'] ?? ''
          const deadline = deadlineRaw ? new Date(deadlineRaw) : undefined

          const card = await prisma.card.create({
            data: {
              title:           row['titulo'] ?? row['title'] ?? 'Card importado',
              description:     row['descricao'] ?? row['description'] ?? undefined,
              priority,
              tags,
              deadline,
              deadlineAt:      deadline ? new Date() : undefined,
              position:        cardPosition++,
              currentColumnId: currentColumn.id,
              boardId:         currentBoard.id,
              creatorId:       request.user.id,
            },
          })

          // Auto-create section for the column owner
          await prisma.cardSection.create({
            data: {
              cardId:   card.id,
              columnId: currentColumn.id,
              ownerId:  currentColumn.ownerId,
              content:  undefined,
            },
          })

          results.push({ row: i + 2, tipo: 'CARD', titulo: card.title, status: 'criado' })

        } else {
          results.push({ row: i + 2, tipo: tipo || '?', titulo: '', status: 'ignorado', error: 'tipo desconhecido' })
        }
      } catch (err: any) {
        results.push({ row: i + 2, tipo, titulo: row['titulo'] ?? '', status: 'erro', error: err?.message ?? 'erro desconhecido' })
      }
    }

    const counts = results.reduce((acc, r) => {
      acc[r.tipo] = (acc[r.tipo] ?? 0) + (r.status === 'criado' ? 1 : 0)
      return acc
    }, {} as Record<string, number>)

    return reply.send({ summary: counts, errors: results.filter((r) => r.status === 'erro').length, results })
  })

  // ── GET /admin/import/template/users ────────────────────
  app.get('/admin/import/template/users', { preHandler: [isAdmin] }, async (_request, reply) => {
    const csv = 'nome,email,senha,perfil,telefone\nJoão Silva,joao@empresa.com,Senha@123,MEMBER,+5511999999999\nMaria Admin,maria@empresa.com,Senha@456,ADMIN,\n'
    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', 'attachment; filename="template_usuarios.csv"')
    return reply.send(csv)
  })

  // ── GET /admin/import/template/missions ──────────────────
  app.get('/admin/import/template/missions', { preHandler: [isAdmin] }, async (_request, reply) => {
    const csv = [
      'tipo,titulo,descricao,cor,membros,responsaveis,prioridade,prazo,tags',
      'BOARD,Projeto Apollo,Missão de exploração lunar,#6366f1,joao@empresa.com;maria@empresa.com,,,,',
      'COLUMN,Planejamento,,,, joao@empresa.com,,,',
      'CARD,Definir escopo,Documento de escopo inicial,,,,MEDIUM,2026-04-30,planejamento;escopo',
      'CARD,Reunião de kickoff,,,,,HIGH,2026-04-15,reunião',
      'COLUMN,Execução,,,,maria@empresa.com,,,',
      'CARD,Desenvolver módulo A,,,,,HIGH,2026-05-15,desenvolvimento',
    ].join('\n') + '\n'
    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', 'attachment; filename="template_missoes.csv"')
    return reply.send(csv)
  })

  // ── GET /admin/drive/health — Diagnose Drive connection ──
  app.get('/admin/drive/health', { preHandler: [requireAdmin()] }, async (request, reply) => {
    return reply.send({
      configured: googleDrive.isConfigured,
      sharedDriveId: env.GOOGLE_SHARED_DRIVE_ID ?? null,
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
      hasPrivateKey: !!(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
      privateKeyPreview: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ? env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.substring(0, 60) + '...'
        : null,
    })
  })

  // ── POST /admin/drive/test-folder — Create test folder ───
  app.post('/admin/drive/test-folder', { preHandler: [requireAdmin()] }, async (request, reply) => {
    if (!googleDrive.isConfigured) {
      return reply.status(400).send({ error: 'Drive not configured — check env vars' })
    }

    try {
      const folder = await googleDrive.createBoardFolder('_Orbitask_Test_' + Date.now())
      if (!folder) return reply.status(500).send({ error: 'createBoardFolder returned null' })
      return reply.send({ ok: true, folderId: folder.id, folderUrl: folder.url })
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message ?? String(err), details: err?.response?.data })
    }
  })
}

