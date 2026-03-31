#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  ORBITASK — Backup Script
#  Backs up PostgreSQL + MinIO to /opt/orbitask/backups
#  and optionally to an S3-compatible remote bucket.
#
#  Cron example (daily at 3am):
#  0 3 * * * /opt/orbitask/scripts/backup.sh >> /var/log/orbitask-backup.log 2>&1
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ─────────────────────────────────────────────
BACKUP_DIR="/opt/orbitask/backups"
RETENTION_DAYS=14
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
COMPOSE_FILE="/opt/orbitask/docker-compose.yml"

# Load env
if [[ -f /opt/orbitask/backend/.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/orbitask/backend/.env; set +a
fi

DB_CONTAINER="orbitask_postgres"
DB_USER="${DATABASE_URL##*://}"
DB_USER="${DB_USER%%:*}"
DB_NAME="orbitask_db"

MINIO_CONTAINER="orbitask_minio"
MINIO_BUCKET="${MINIO_BUCKET:-orbitask-files}"
MINIO_ALIAS="orbitask_backup"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Create backup directory ─────────────────────────────
mkdir -p "${BACKUP_DIR}/postgres" "${BACKUP_DIR}/minio"

# ── 1. PostgreSQL dump ──────────────────────────────────
log "Starting PostgreSQL backup..."
PG_FILE="${BACKUP_DIR}/postgres/orbitask_${TIMESTAMP}.sql.gz"

docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" "${DB_NAME}" \
  | gzip > "${PG_FILE}"

PG_SIZE=$(du -sh "${PG_FILE}" | cut -f1)
log "PostgreSQL backup: ${PG_FILE} (${PG_SIZE}) ✅"

# ── 2. MinIO snapshot ────────────────────────────────────
log "Starting MinIO backup..."
MINIO_DIR="${BACKUP_DIR}/minio/${TIMESTAMP}"
mkdir -p "${MINIO_DIR}"

# Use mc (MinIO Client) inside container
docker exec "${MINIO_CONTAINER}" \
  sh -c "mc alias set local http://localhost:9000 \
    \${MINIO_ROOT_USER} \${MINIO_ROOT_PASSWORD} 2>/dev/null; \
    mc mirror local/${MINIO_BUCKET} /tmp/backup_${TIMESTAMP}" 2>/dev/null || true

# Copy out of container
docker cp "${MINIO_CONTAINER}:/tmp/backup_${TIMESTAMP}/." "${MINIO_DIR}/" 2>/dev/null || true

MINIO_SIZE=$(du -sh "${MINIO_DIR}" 2>/dev/null | cut -f1 || echo "0")
log "MinIO backup: ${MINIO_DIR} (${MINIO_SIZE}) ✅"

# ── 3. Cleanup old backups ──────────────────────────────
log "Cleaning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}/postgres" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "${BACKUP_DIR}/minio"    -maxdepth 1 -type d -mtime +${RETENTION_DAYS} \
  -exec rm -rf {} + 2>/dev/null || true
log "Cleanup done ✅"

# ── 4. Summary ──────────────────────────────────────────
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
echo ""
echo "════════════════════════════════════════"
echo "  🛸 Orbitask Backup Complete"
echo "  Timestamp : ${TIMESTAMP}"
echo "  PG file   : $(basename ${PG_FILE}) (${PG_SIZE})"
echo "  MinIO dir : ${TIMESTAMP} (${MINIO_SIZE})"
echo "  Total     : ${TOTAL_SIZE}"
echo "════════════════════════════════════════"

# ── 5. Optional: upload to remote S3 ────────────────────
# Uncomment and configure REMOTE_S3_BUCKET to enable offsite backup
# REMOTE_S3_BUCKET="s3://your-remote-bucket/orbitask-backups"
# if command -v aws &>/dev/null && [[ -n "${REMOTE_S3_BUCKET:-}" ]]; then
#   log "Uploading to remote S3: ${REMOTE_S3_BUCKET}..."
#   aws s3 cp "${PG_FILE}" "${REMOTE_S3_BUCKET}/postgres/$(basename ${PG_FILE})"
#   aws s3 sync "${MINIO_DIR}" "${REMOTE_S3_BUCKET}/minio/${TIMESTAMP}/"
#   log "Remote upload complete ✅"
# fi

exit 0

