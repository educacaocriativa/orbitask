# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl openssl-dev

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npx tsc --skipLibCheck --outDir dist || true

# ── Stage 2: Production ──────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl redis

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 orbitask

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads /var/lib/redis /var/log/redis \
  && chown -R orbitask:nodejs /app /var/lib/redis /var/log/redis

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER orbitask

EXPOSE 3333

ENTRYPOINT ["/entrypoint.sh"]
