import type { FastifyInstance } from 'fastify'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { AdminService } from '../services/AdminService'
import { requireAdmin } from '../middlewares/auth'
import { WhatsAppService } from '../services/WhatsAppService'
import { googleDrive } from '../services/GoogleDriveService'
import { syncDriveAccess } from '../jobs/driveSync'
import { prisma } from '../database/prisma'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

// ── CSV parser (no external dependency) ──────────────────
function detectCSVDelimiter(header: string): ',' | ';' {
  const commaCount = (header.match(/,/g) ?? []).length
  const semicolonCount = (header.match(/;/g) ?? []).length
  return semicolonCount > commaCount ? ';' : ','
}

function parseCSVLine(line: string, delimiter: ',' | ';'): string[] {
  const values: string[] = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      value += '"'
      i++
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      values.push(value.trim())
      value = ''
      continue
    }

    value += char
  }

  values.push(value.trim())
  return values
}

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const delimiter = detectCSVDelimiter(lines[0])
  const headers = parseCSVLine(lines[0], delimiter).map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const clean = parseCSVLine(line, delimiter)
    return Object.fromEntries(headers.map((h, i) => [h, clean[i] ?? '']))
  }).filter((row) => Object.values(row).some((v) => v))
}

function getCSVValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return ''
}

function splitCSVList(raw: string): string[] {
  return raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
}

function getMissingEmails(expected: string[], found: string[]): string[] {
  const foundSet = new Set(found.map((email) => email.toLowerCase()))
  return expected.filter((email) => !foundSet.has(email.toLowerCase()))
}

function normalizePriority(raw: string | undefined): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const value = (raw ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (['LOW', 'BAIXA'].includes(value)) return 'LOW'
  if (['HIGH', 'ALTA'].includes(value)) return 'HIGH'
  if (['CRITICAL', 'CRITICA', 'CRITICO'].includes(value)) return 'CRITICAL'
  return 'MEDIUM'
}

function normalizeImportType(raw: string | undefined): 'BOARD' | 'COLUMN' | 'CARD' | '' {
  const value = (raw ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (['BOARD', 'PROJETO', 'MISSAO', 'MISSAO/PROJETO'].includes(value)) return 'BOARD'
  if (['COLUMN', 'COLUNA', 'ETAPA'].includes(value)) return 'COLUMN'
  if (['CARD', 'TAREFA', 'ATIVIDADE'].includes(value)) return 'CARD'
  return ''
}

function parseDeadline(raw: string | undefined): Date | undefined {
  const value = (raw ?? '').trim()
  if (!value) return undefined

  const brDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*(?:as|às)?\s*(\d{1,2}):(\d{2}))?/i)
  if (brDate) {
    const [, day, month, year, hour = '0', minute = '0'] = brDate
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
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

    // Quando promovido a ADMIN, garante acesso Organizer no Drive (em background)
    if (role === 'ADMIN' && googleDrive.isConfigured) {
      setImmediate(async () => {
        try {
          await googleDrive.ensureOrganizersOnSharedDrive([user.email])
          console.log(`[Admin] Drive Organizer garantido para ${user.email}`)
        } catch (err: any) {
          console.warn(`[Admin] Erro ao promover Drive para ${user.email}:`, err?.message)
        }
      })
    }

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

  // ── POST /admin/drive/sync — disparo manual do sync Drive ─
  app.post('/admin/drive/sync', {
    preHandler: [isAdmin],
  }, async (_request, reply) => {
    if (!googleDrive.isConfigured) throw new AppError('Google Drive não configurado', 503)
    const result = await syncDriveAccess()
    return reply.send(result)
  })

  // ── PATCH /admin/users/:id/crm-access ───────────────────
  app.patch('/admin/users/:id/crm-access', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { crmAccess } = request.body as { crmAccess: boolean }
    const user = await prisma.user.update({
      where: { id },
      data: { crmAccess } as any,
      select: { id: true, name: true, email: true, role: true, crmAccess: true } as any,
    })
    return reply.send({ user })
  })

  // ── PATCH /admin/users/:id/password ─────────────────────
  app.patch('/admin/users/:id/password', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { password } = request.body as { password: string }

    if (!password || password.length < 8) {
      throw new AppError('A senha deve ter pelo menos 8 caracteres', 400)
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS)
    await prisma.user.update({ where: { id }, data: { passwordHash } })

    return reply.send({ message: 'Senha redefinida com sucesso' })
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

  // ── GET /admin/users/:id/activity ───────────────────────
  // Retorna todos os logs do usuário para geração de relatório TXT
  app.get('/admin/users/:id/activity', {
    preHandler: [isAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    })
    if (!user) throw new AppError('Usuário não encontrado', 404)

    const logs = await prisma.accessLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
    })

    return reply.send({ user, logs })
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
  //   tipo=PROJETO/BOARD → nome,descricao,cor,tripulacao,coordenadores
  //   tipo=ETAPA/COLUMN  → nome,cor,responsaveis
  //   tipo=CARD          → nome,descricao,prioridade,prazo,tags
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

    let currentBoard: { id: string; title: string; driveFolderId: string | null } | null = null
    let currentColumn: { id: string; title: string; ownerId: string; ownerName: string; driveFolderId: string | null } | null = null
    let cardPosition = 0
    let columnPosition = 0

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i]
      const tipo = normalizeImportType(row['tipo'] ?? row['type'])

      try {
        if (tipo === 'BOARD') {
          const memberEmails = splitCSVList(getCSVValue(row, 'tripulacao', 'membros', 'members'))
          const coordinatorEmails = splitCSVList(getCSVValue(row, 'coordenadores', 'coordinators', 'coordinator'))
          const boardEmails = [...new Set([...memberEmails, ...coordinatorEmails])]

          const members = await prisma.user.findMany({
            where: { email: { in: boardEmails } },
            select: { id: true, email: true },
          })
          const missingMembers = getMissingEmails(boardEmails, members.map((m) => m.email))
          if (missingMembers.length > 0) {
            throw new Error(`usuário(s) não encontrado(s): ${missingMembers.join(', ')}`)
          }
          const coordinatorSet = new Set(coordinatorEmails.map((email) => email.toLowerCase()))

          const board = await prisma.board.create({
            data: {
              title:       getCSVValue(row, 'nome', 'titulo', 'title') || 'Missão importada',
              description: getCSVValue(row, 'descricao', 'description') || undefined,
              color:       getCSVValue(row, 'cor', 'color') || '#6366f1',
              ownerId:     request.user.id,
              members: {
                create: members.map((m) => ({
                  userId: m.id,
                  role: coordinatorSet.has(m.email.toLowerCase()) ? 'COORDINATOR' : 'MEMBER',
                })),
              },
            },
          })

          let boardDriveFolderId: string | null = null
          try {
            const folder = await googleDrive.createBoardFolder(board.title)
            if (folder) {
              boardDriveFolderId = folder.id
              await prisma.board.update({
                where: { id: board.id },
                data: { driveFolderId: folder.id, driveFolderUrl: folder.url },
              })
              const emails = members.map((m) => m.email).filter(Boolean)
              setImmediate(() => googleDrive.addMembersToSharedDrive(emails))
            }
          } catch (err) {
            console.error('Drive board folder import error:', err)
          }

          currentBoard   = { id: board.id, title: board.title, driveFolderId: boardDriveFolderId }
          currentColumn  = null
          columnPosition = 0
          cardPosition   = 0
          results.push({ row: i + 2, tipo: 'PROJETO', titulo: board.title, status: 'criado' })

        } else if (tipo === 'COLUMN') {
          if (!currentBoard) throw new Error('ETAPA sem PROJETO anterior')

          const ownerEmails = splitCSVList(getCSVValue(row, 'responsaveis', 'owners'))

          const owners = await prisma.user.findMany({
            where: { email: { in: ownerEmails } },
            select: { id: true, email: true, name: true },
          })
          const missingOwners = getMissingEmails(ownerEmails, owners.map((o) => o.email))
          if (missingOwners.length > 0) {
            throw new Error(`responsável(is) não encontrado(s): ${missingOwners.join(', ')}`)
          }
          const fallbackOwner = owners.length === 0
            ? await prisma.user.findUnique({ where: { id: request.user.id }, select: { id: true, email: true, name: true } })
            : null
          const columnOwners = owners.length > 0 ? owners : (fallbackOwner ? [fallbackOwner] : [])
          const primaryOwner = columnOwners[0]
          if (!primaryOwner) throw new Error('responsável da etapa não encontrado')
          const allOwnerIds = [...new Set(columnOwners.map((o) => o.id))]

          const column = await prisma.column.create({
            data: {
              title:    getCSVValue(row, 'nome', 'titulo', 'title') || 'Etapa',
              color:    getCSVValue(row, 'cor', 'color') || '#818cf8',
              ownerId:  primaryOwner.id,
              boardId:  currentBoard.id,
              position: columnPosition++,
              columnMembers: { create: allOwnerIds.map((userId) => ({ userId })) },
            },
          })

          let columnDriveFolderId: string | null = null
          if (currentBoard.driveFolderId) {
            try {
              const folder = await googleDrive.createColumnFolder(column.title, currentBoard.driveFolderId)
              if (folder) {
                columnDriveFolderId = folder.id
                await prisma.column.update({
                  where: { id: column.id },
                  data: { driveFolderId: folder.id, driveFolderUrl: folder.url },
                })
              }
            } catch (err) {
              console.error('Drive column folder import error:', err)
            }
          }

          setImmediate(async () => {
            const emails = columnOwners.map((o) => o.email).filter(Boolean)
            if (emails.length > 0) {
              await googleDrive.addMembersToSharedDrive(emails)
              if (columnDriveFolderId) await googleDrive.shareFolderWithMany(columnDriveFolderId, emails)
            }
          })

          currentColumn = { id: column.id, title: column.title, ownerId: primaryOwner.id, ownerName: primaryOwner.name, driveFolderId: columnDriveFolderId }
          cardPosition  = 0
          results.push({ row: i + 2, tipo: 'ETAPA', titulo: column.title, status: 'criado' })

        } else if (tipo === 'CARD') {
          if (!currentBoard || !currentColumn) throw new Error('CARD sem PROJETO/ETAPA anterior')

          const priority = normalizePriority(row['prioridade'] ?? row['priority'])

          const tags = splitCSVList(row['tags'] ?? '')
          const deadline = parseDeadline(row['prazo'] ?? row['deadline'])

          const card = await prisma.card.create({
            data: {
              title:           getCSVValue(row, 'nome', 'titulo', 'title') || 'Card importado',
              description:     getCSVValue(row, 'descricao', 'description') || undefined,
              priority,
              tags,
              deadline,
              deadlineAt:      deadline ? new Date() : undefined,
              position:        cardPosition++,
              currentColumnId: currentColumn.id,
              columnEnteredAt:  new Date(),
              boardId:         currentBoard.id,
              creatorId:       request.user.id,
            },
          })

          let sectionDriveFolderId: string | null = null
          let sectionDriveFolderUrl: string | null = null
          let resourcesFolderId: string | null = null
          let resourcesFolderUrl: string | null = null

          if (currentColumn.driveFolderId) {
            try {
              const folder = await googleDrive.createCardFolder(card.title, currentColumn.ownerName, currentColumn.driveFolderId)
              if (folder) {
                sectionDriveFolderId = folder.id
                sectionDriveFolderUrl = folder.url

                const recursos = await googleDrive.createResourcesFolder(folder.id)
                if (recursos) {
                  resourcesFolderId = recursos.id
                  resourcesFolderUrl = recursos.url
                }

                await prisma.card.update({
                  where: { id: card.id },
                  data: {
                    driveFolderId: folder.id,
                    driveFolderUrl: folder.url,
                    resourcesFolderId,
                    resourcesFolderUrl,
                  },
                })
              }
            } catch (err) {
              console.error('Drive card folder import error:', err)
            }
          }

          // Auto-create section for the column owner
          await prisma.cardSection.create({
            data: {
              cardId:         card.id,
              columnId:       currentColumn.id,
              ownerId:        currentColumn.ownerId,
              content:        undefined,
              driveFolderId:  sectionDriveFolderId,
              driveFolderUrl: sectionDriveFolderUrl,
            },
          })

          results.push({ row: i + 2, tipo: 'CARD', titulo: card.title, status: 'criado' })

        } else {
          results.push({ row: i + 2, tipo: row['tipo'] || '?', titulo: '', status: 'ignorado', error: 'tipo desconhecido' })
        }
      } catch (err: any) {
        results.push({ row: i + 2, tipo: row['tipo'] || tipo, titulo: getCSVValue(row, 'nome', 'titulo'), status: 'erro', error: err?.message ?? 'erro desconhecido' })
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
    reply.header('Cache-Control', 'no-store')
    reply.header('Content-Disposition', 'attachment; filename="template_usuarios.csv"')
    return reply.send(csv)
  })

  // ── GET /admin/import/template/missions ──────────────────
  app.get('/admin/import/template/missions', { preHandler: [isAdmin] }, async (_request, reply) => {
    const csv = [
      'tipo;nome;descricao;cor;tripulacao;coordenadores;responsaveis;prioridade;prazo;tags',
      'PROJETO;Ensino Médio Cristão;Organização do 1º bimestre;#7c3aed;"admin@orbitask.com;mariano.index@gmail.com";admin@orbitask.com;;;;',
      'ETAPA;1ª Série - Arte;Linguagens e suas tecnologias;#7c3aed;;;admin@orbitask.com;;;',
      'CARD;1ª Série - Arte - Cap1;;;;;;Média;03/06/2026 às 12:00;arte',
      'CARD;1ª Série - Arte - Cap2;;;;;;Média;03/06/2026 às 12:01;arte',
      'ETAPA;1ª Série - Biologia;Ciências da Natureza;#10b981;;;mariano.index@gmail.com;;;',
      'CARD;1ª Série - Bio - Cap1;;;;;;Alta;05/06/2026 às 12:00;biologia',
    ].join('\n') + '\n'
    reply.header('Content-Type', 'text/csv')
    reply.header('Cache-Control', 'no-store')
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

