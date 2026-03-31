# 🚀 Orbitask — Space Project Management

> Kanban board with WhatsApp automation, dynamic sections, and Deep Space UI.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, Framer Motion, dnd-kit, TipTap |
| Backend | Node.js, Fastify, Prisma ORM, Zod |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| File Storage | MinIO (S3-compatible) |
| WhatsApp | Evolution API (self-hosted) |
| Deploy | Docker Compose + Nginx |

---

## Quick Start (Local Dev)

### 1. Clone and configure
```bash
git clone <repo-url> orbitask
cd orbitask

cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### 2. Start infrastructure services
```bash
docker compose up postgres redis minio evolution -d
```

### 3. Setup backend
```bash
cd backend
npm install
npm run db:migrate        # run all migrations
npm run db:seed           # create admin + sample data
npm run dev               # start API on :3333
```

### 4. Setup frontend
```bash
cd ../frontend
npm install
npm run dev               # start Next.js on :3000
```

### Default credentials
- **Admin:** `admin@orbitask.com` / `Admin@123456`
- **Member 1:** `cosmonaut@orbitask.com` / `Member@123`
- **Member 2:** `navigator@orbitask.com` / `Member@123`

---

## Production Deploy (VPS)

### Prerequisites
- Docker + Docker Compose installed on VPS
- Domain pointed to VPS IP
- SSL certificates (Let's Encrypt recommended)

### Steps
```bash
# 1. Copy project to VPS
scp -r orbitask/ user@your-vps:/opt/orbitask

# 2. Generate SSL with Certbot
certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# 3. Edit nginx/nginx.conf with your domain

# 4. Launch all services
docker compose up -d --build

# 5. Watch logs
docker compose logs -f backend
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login → returns JWT |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Get current user profile |
| PATCH | `/auth/password` | Change password |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/dashboard` | Stats + recent logins |
| GET | `/admin/users` | List users with last activity |
| POST | `/admin/users` | Create user |
| PATCH | `/admin/users/:id/status` | Activate/deactivate user |
| PATCH | `/admin/users/:id/role` | Change user role |
| GET | `/admin/logs` | Access logs with filters |
| GET | `/admin/whatsapp/status` | WhatsApp connection status |

### Boards & Columns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards` | List boards |
| POST | `/boards` | Create board |
| GET | `/boards/:id` | Get board with all columns/cards |
| POST | `/boards/:boardId/columns` | Create column (requires ownerId) |
| PATCH | `/columns/:id` | Update column |
| PATCH | `/boards/:boardId/columns/reorder` | Reorder columns |

### Cards
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/boards/:boardId/cards` | Create card |
| GET | `/cards/:id` | Get card with all sections |
| PATCH | `/cards/:id` | Update card |
| POST | `/cards/:id/move` | Move card (requires deadline) |
| DELETE | `/cards/:id` | Archive card |
| PATCH | `/cards/reorder` | Reorder within column |

### Sections
| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/sections/:id` | Save TipTap JSON content + process @mentions |
| POST | `/sections/:id/files` | Upload PDF/Word/Image |
| DELETE | `/sections/:sectionId/files/:fileId` | Delete file |

---

## Business Rules

### Column Ownership
Every column **must** have an `ownerId`. This is enforced at DB and API level.

### Card Movement Lock
`POST /cards/:id/move` **requires** a `deadline` field. Without it, the request returns `400`. This prevents cards from advancing without a committed deadline.

### Section Auto-Creation
When a card is moved to a new column, the system automatically creates a `CardSection` linked to that column's owner. The owner's name appears as the section header in the UI.

### WhatsApp Triggers
| Event | Recipients | Timing |
|-------|-----------|--------|
| Card moved to column | Column owner | Immediate |
| @Mention in section | Mentioned user | Immediate |
| Deadline expired | Column owner + Card creator | Immediate + every 2h |
| Deadline warning | Column owner | Configurable (24h before) |

### Repeated Overdue Alerts
A cron job runs **every 2 hours** and sends WhatsApp alerts for all overdue cards. The alert message includes an "ALERTA REPETIDO" tag on subsequent sends.

---

## Project Structure

```
orbitask/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        ← Full DB schema
│   ├── src/
│   │   ├── config/env.ts        ← Validated env vars
│   │   ├── database/
│   │   │   ├── prisma.ts        ← Prisma singleton
│   │   │   ├── redis.ts         ← Redis + BullMQ clients
│   │   │   └── seed.ts          ← Dev seed data
│   │   ├── middlewares/
│   │   │   └── auth.ts          ← JWT + role guards
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── admin.routes.ts
│   │   │   ├── board.routes.ts
│   │   │   ├── card.routes.ts
│   │   │   └── section.routes.ts
│   │   ├── services/
│   │   │   ├── AuthService.ts
│   │   │   ├── AdminService.ts
│   │   │   └── WhatsAppService.ts
│   │   ├── jobs/
│   │   │   └── notificationQueue.ts  ← BullMQ + cron
│   │   ├── utils/AppError.ts
│   │   └── server.ts            ← App entry point
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/                    ← Phase 2 (Next.js)
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

---

## WhatsApp Setup (Evolution API)

1. Access Evolution API console: `http://your-vps:8080`
2. Create instance named `orbitask`
3. Scan QR code with WhatsApp
4. Update `EVOLUTION_API_KEY` in `.env`
5. Test connection: `GET /admin/whatsapp/status`

---

## Next Phases

- **Phase 2** — Kanban Board frontend (Next.js + dnd-kit)
- **Phase 3** — Rich text editor sections (TipTap + @mentions UI)
- **Phase 4** — File upload UI + MinIO presigned URLs
- **Phase 5** — Deep Space UI (Glassmorphism + Framer Motion)
- **Phase 6** — Mobile PWA + push notifications

