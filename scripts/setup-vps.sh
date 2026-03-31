#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  ORBITASK — VPS Setup & Deploy Script
#  Run on a fresh Ubuntu 22.04 / Debian 12 server
#  Usage: curl -fsSL https://your-repo/scripts/deploy.sh | bash
# ─────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ORBITASK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

INSTALL_DIR="/opt/orbitask"
DOMAIN="${DOMAIN:-your-domain.com}"

# ── 1. System dependencies ────────────────────────────────
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  apt-transport-https ca-certificates gnupg lsb-release

# ── 2. Docker ─────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  log "Docker installed ✅"
else
  log "Docker already installed ✅"
fi

# ── 3. Project directory ──────────────────────────────────
log "Setting up project directory..."
mkdir -p "$INSTALL_DIR"/{nginx/ssl,scripts,backups}
chown -R "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR" 2>/dev/null || true

# ── 4. Firewall ───────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "UFW configured ✅"

# ── 5. SSL certificate ────────────────────────────────────
if [[ "$DOMAIN" != "your-domain.com" ]]; then
  log "Obtaining SSL certificate for $DOMAIN..."
  certbot certonly --standalone \
    --agree-tos --no-eff-email \
    -m "admin@$DOMAIN" \
    -d "$DOMAIN" \
    --pre-hook "systemctl stop nginx || true" \
    --post-hook "systemctl start nginx || true"

  cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$INSTALL_DIR/nginx/ssl/"
  cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem"   "$INSTALL_DIR/nginx/ssl/"

  # Auto-renew cron
  echo "0 3 * * * root certbot renew --quiet --deploy-hook \
    'cp /etc/letsencrypt/live/$DOMAIN/*.pem /opt/orbitask/nginx/ssl/ && \
     docker compose -f /opt/orbitask/docker-compose.yml restart nginx'" \
    > /etc/cron.d/certbot-renew
  log "SSL configured ✅"
else
  warn "No domain set — skipping SSL. Set DOMAIN=yourdomain.com and re-run."
fi

# ── 6. Environment file ───────────────────────────────────
if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
  warn "No .env found. Creating from template..."
  cat > "$INSTALL_DIR/backend/.env" << EOF
NODE_ENV=production
PORT=3333
APP_URL=https://$DOMAIN
FRONTEND_URL=https://$DOMAIN

JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

DATABASE_URL=postgresql://orbitask:$(openssl rand -hex 16)@postgres:5432/orbitask_db
REDIS_HOST=redis
REDIS_PORT=6379

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=orbitask_$(openssl rand -hex 8)
MINIO_SECRET_KEY=$(openssl rand -hex 24)
MINIO_BUCKET=orbitask-files
MINIO_USE_SSL=false

EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=changeme
EVOLUTION_INSTANCE=orbitask

ADMIN_EMAIL=admin@$DOMAIN
ADMIN_PASSWORD=$(openssl rand -base64 12)

RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
EOF
  log "⚠️  .env created with random secrets. Edit $INSTALL_DIR/backend/.env before starting!"
fi

# ── 7. Systemd service (auto-restart) ────────────────────
cat > /etc/systemd/system/orbitask.service << EOF
[Unit]
Description=Orbitask Project Management
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable orbitask
log "Systemd service registered ✅"

# ── 8. Final summary ──────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo -e "  ${GREEN}🚀 ORBITASK VPS SETUP COMPLETE${NC}"
echo "════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Edit $INSTALL_DIR/backend/.env"
echo "  2. Copy your docker-compose.yml to $INSTALL_DIR/"
echo "  3. Run: cd $INSTALL_DIR && docker compose up -d"
echo "  4. Run: docker compose exec backend npm run db:migrate"
echo "  5. Run: docker compose exec backend npm run db:seed"
echo ""
echo "  Access: https://$DOMAIN"
echo "  API:    https://$DOMAIN/api/health"
echo ""

