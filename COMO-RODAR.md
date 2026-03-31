# 🚀 Como Rodar o Orbitask Localmente

Guia rápido para abrir no VSCode e colocar para rodar em **menos de 10 minutos**.

---

## Pré-requisitos

Instale antes de começar:

| Ferramenta | Versão mínima | Download |
|------------|--------------|---------|
| Node.js    | 20.x         | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Qualquer | [docker.com](https://docker.com) |
| Git        | Qualquer     | [git-scm.com](https://git-scm.com) |

---

## Passo a Passo

### 1. Abrir no VSCode

```bash
# Clone ou extraia a pasta orbitask, depois:
code orbitask.code-workspace
```

> O VSCode vai sugerir instalar as extensões recomendadas. Aceite todas.

---

### 2. Subir o banco de dados e serviços

No terminal integrado do VSCode (`` Ctrl+` ``):

```bash
# Na raiz do projeto
docker compose up postgres redis minio -d
```

Aguarde os containers subirem (≈ 30 segundos na primeira vez).

Verifique se estão rodando:
```bash
docker compose ps
```

Você deve ver `postgres`, `redis` e `minio` com status **Up**.

---

### 3. Instalar dependências

```bash
npm run install:all
```

Isso instala tudo em `backend/` e `frontend/` de uma vez.

---

### 4. Configurar e popular o banco

```bash
npm run db:migrate    # cria as tabelas
npm run db:seed       # cria admin + dados de exemplo
```

---

### 5. Rodar o projeto

**Opção A — Um comando só (recomendado):**
```bash
npm run dev
```
Sobe o backend (`:3333`) e o frontend (`:3000`) juntos com logs coloridos.

**Opção B — Separado (para debugar):**
```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

**Opção C — Via VSCode (Debug):**
- Vá em `Run & Debug` (`` Ctrl+Shift+D ``)
- Selecione **🛸 Full Stack**
- Clique em ▶️

---

## Acessar o Sistema

| Serviço        | URL                          |
|----------------|------------------------------|
| **App**        | http://localhost:3000        |
| **API**        | http://localhost:3333        |
| **API Health** | http://localhost:3333/health |
| **MinIO**      | http://localhost:9001        |
| **Prisma Studio** | `npm run db:studio`       |

---

## Credenciais

| Usuário    | Email                    | Senha         |
|------------|--------------------------|---------------|
| 👑 Admin   | admin@orbitask.com       | Admin@123456  |
| 👨‍🚀 Membro 1 | cosmonaut@orbitask.com   | Member@123    |
| 👨‍🚀 Membro 2 | navigator@orbitask.com   | Member@123    |

---

## Comandos Úteis

```bash
# Ver todos os logs
docker compose logs -f

# Acessar Prisma Studio (visualizar banco)
npm run db:studio

# Resetar banco do zero
npm run db:reset

# Verificar saúde de todos os serviços
npm run health

# Parar tudo
docker compose down
```

---

## Estrutura de Pastas

```
orbitask/
├── 📄 orbitask.code-workspace  ← Abra ESTE arquivo no VSCode
├── 📄 docker-compose.yml       ← Todos os serviços (DB, Redis, etc.)
├── 📄 package.json             ← Scripts raiz (npm run dev, etc.)
│
├── ⚙️  backend/                 ← API Fastify + Prisma
│   ├── .env                    ← Variáveis de ambiente (já preenchido)
│   ├── prisma/schema.prisma    ← Schema do banco
│   └── src/
│       ├── routes/             ← Endpoints REST
│       ├── services/           ← Lógica de negócio
│       ├── jobs/               ← Filas BullMQ + cron
│       └── server.ts           ← Entry point
│
├── 🎨 frontend/                 ← Next.js 14 + Tailwind
│   ├── .env.local              ← Aponta para API local
│   └── src/
│       ├── app/                ← Páginas (login, board, admin)
│       ├── components/         ← Todos os componentes
│       ├── stores/             ← Estado global (Zustand)
│       └── hooks/              ← Custom hooks (WebSocket, etc.)
│
├── 🐳 nginx/nginx.conf          ← Proxy reverso (produção)
├── 📚 docs/whatsapp-setup.md   ← Guia WhatsApp
└── 🔧 scripts/                 ← backup.sh, health-check.sh
```

---

## WhatsApp (Opcional)

Para habilitar notificações WhatsApp em desenvolvimento:

1. Suba a Evolution API:
   ```bash
   docker compose up evolution -d
   ```

2. Siga o guia: [`docs/whatsapp-setup.md`](docs/whatsapp-setup.md)

Sem o WhatsApp configurado, o sistema funciona normalmente — apenas as notificações não são enviadas.

---

## Problemas Comuns

**Porta 5432 já em uso:**
```bash
# Pare o PostgreSQL local
sudo service postgresql stop
# Ou mude a porta no docker-compose.yml
```

**Erro de migração:**
```bash
# Recriar banco do zero
docker compose down -v
docker compose up postgres -d
npm run db:migrate
npm run db:seed
```

**Frontend não conecta na API:**
- Confirme que `frontend/.env.local` tem `NEXT_PUBLIC_API_URL=http://localhost:3333`
- Confirme que o backend está rodando na porta 3333

**`npm run install:all` falha:**
```bash
# Instale manualmente
cd backend  && npm install
cd ../frontend && npm install
```

