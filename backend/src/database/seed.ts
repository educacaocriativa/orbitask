import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { env } from '../config/env'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // ── Admin User ─────────────────────────────────
  const adminPassword = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_ROUNDS)

  const admin = await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    update: {},
    create: {
      name: 'Mission Control',
      email: env.ADMIN_EMAIL,
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      phoneWhatsapp: '+5511999999999',
      isActive: true,
    },
  })
  console.log(`✅ Admin created: ${admin.email}`)

  // ── Sample Members ─────────────────────────────
  const members = await Promise.all([
    prisma.user.upsert({
      where: { email: 'cosmonaut@orbitask.com' },
      update: {},
      create: {
        name: 'Cosmonaut Alpha',
        email: 'cosmonaut@orbitask.com',
        passwordHash: await bcrypt.hash('Member@123', env.BCRYPT_ROUNDS),
        role: UserRole.MEMBER,
        phoneWhatsapp: '+5511988888888',
      },
    }),
    prisma.user.upsert({
      where: { email: 'navigator@orbitask.com' },
      update: {},
      create: {
        name: 'Navigator Beta',
        email: 'navigator@orbitask.com',
        passwordHash: await bcrypt.hash('Member@123', env.BCRYPT_ROUNDS),
        role: UserRole.MEMBER,
        phoneWhatsapp: '+5511977777777',
      },
    }),
  ])
  console.log(`✅ ${members.length} members created`)

  // ── Sample Board ───────────────────────────────
  const board = await prisma.board.upsert({
    where: { id: 'seed-board-001' },
    update: {},
    create: {
      id: 'seed-board-001',
      title: 'Mission: Alpha Launch',
      description: 'Main project board for the alpha launch',
      color: '#6366f1',
      ownerId: admin.id,
    },
  })
  console.log(`✅ Board created: ${board.title}`)

  // ── Sample Columns ─────────────────────────────
  const columnData = [
    { title: 'Launchpad', position: 0, ownerId: admin.id, color: '#6366f1' },
    { title: 'In Orbit', position: 1, ownerId: members[0].id, color: '#22d3ee' },
    { title: 'Deep Space', position: 2, ownerId: members[1].id, color: '#a78bfa' },
    { title: 'Mission Complete', position: 3, ownerId: admin.id, color: '#34d399' },
  ]

  const columns = await Promise.all(
    columnData.map((col, i) =>
      prisma.column.upsert({
        where: { id: `seed-col-00${i + 1}` },
        update: {},
        create: { id: `seed-col-00${i + 1}`, ...col, boardId: board.id },
      })
    )
  )
  console.log(`✅ ${columns.length} columns created`)

  // ── Sample Cards ───────────────────────────────
  await prisma.card.upsert({
    where: { id: 'seed-card-001' },
    update: {},
    create: {
      id: 'seed-card-001',
      title: 'Design the Space UI',
      description: 'Create glassmorphism components with cosmic theme',
      position: 0,
      priority: 'HIGH',
      tags: ['design', 'frontend'],
      currentColumnId: columns[0].id,
      boardId: board.id,
      creatorId: admin.id,
    },
  })

  console.log('✅ Sample card created')
  console.log('\n🚀 Seed completed successfully!')
  console.log(`\n📧 Admin credentials:`)
  console.log(`   Email: ${env.ADMIN_EMAIL}`)
  console.log(`   Password: ${env.ADMIN_PASSWORD}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

