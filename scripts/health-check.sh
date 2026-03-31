#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  ORBITASK — Health Check Script
#  Verifies all services are running and responding.
#  Exit 0 = healthy, Exit 1 = degraded
# ─────────────────────────────────────────────────────────
set -uo pipefail

API_URL="${API_URL:-http://localhost:3333}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
TIMEOUT=5

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

pass()  { echo -e "  ${GREEN}✅  $1${NC}"; }
fail()  { echo -e "  ${RED}❌  $1${NC}"; FAILED=$((FAILED+1)); }
warn()  { echo -e "  ${YELLOW}⚠️   $1${NC}"; }
FAILED=0

echo ""
echo "  🛸 ORBITASK HEALTH CHECK — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  ─────────────────────────────────────────"

# ── Docker containers ───────────────────────────────────
echo ""
echo "  CONTAINERS"
for svc in orbitask_postgres orbitask_redis orbitask_minio orbitask_backend orbitask_frontend orbitask_evolution; do
  status=$(docker inspect --format '{{.State.Status}}' "$svc" 2>/dev/null || echo "not found")
  if [[ "$status" == "running" ]]; then
    pass "$svc → running"
  else
    fail "$svc → $status"
  fi
done

# ── API health endpoint ─────────────────────────────────
echo ""
echo "  API"
response=$(curl -sf --max-time $TIMEOUT "${API_URL}/health" 2>/dev/null || echo "")
if [[ -n "$response" ]]; then
  env_val=$(echo "$response" | grep -o '"environment":"[^"]*"' | cut -d'"' -f4 || echo "?")
  pass "API /health → ok (env: ${env_val})"
else
  fail "API /health → unreachable at ${API_URL}"
fi

# ── Frontend ────────────────────────────────────────────
echo ""
echo "  FRONTEND"
http_code=$(curl -so /dev/null -w "%{http_code}" --max-time $TIMEOUT "${FRONTEND_URL}" 2>/dev/null || echo "000")
if [[ "$http_code" == "200" ]]; then
  pass "Frontend → HTTP ${http_code}"
else
  fail "Frontend → HTTP ${http_code} (expected 200)"
fi

# ── PostgreSQL ──────────────────────────────────────────
echo ""
echo "  DATABASE"
pg_ok=$(docker exec orbitask_postgres pg_isready -U orbitask -d orbitask_db 2>/dev/null || echo "failed")
if [[ "$pg_ok" == *"accepting"* ]]; then
  # Count users as sanity check
  user_count=$(docker exec orbitask_postgres psql -U orbitask -d orbitask_db -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")
  pass "PostgreSQL → accepting connections (${user_count} users)"
else
  fail "PostgreSQL → not accepting connections"
fi

# ── Redis ───────────────────────────────────────────────
echo ""
echo "  CACHE & QUEUES"
redis_pong=$(docker exec orbitask_redis redis-cli ping 2>/dev/null || echo "")
if [[ "$redis_pong" == "PONG" ]]; then
  queue_len=$(docker exec orbitask_redis redis-cli LLEN "bull:notifications:wait" 2>/dev/null || echo "?")
  pass "Redis → PONG (queue pending: ${queue_len})"
else
  fail "Redis → no response"
fi

# ── MinIO ───────────────────────────────────────────────
echo ""
echo "  FILE STORAGE"
minio_ok=$(curl -sf --max-time $TIMEOUT "http://localhost:9000/minio/health/live" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$minio_ok" == "ok" ]]; then
  pass "MinIO → healthy"
else
  warn "MinIO → health check failed (may still be functional)"
fi

# ── WhatsApp (Evolution API) ─────────────────────────────
echo ""
echo "  MESSAGING"
evo_ok=$(curl -sf --max-time $TIMEOUT "http://localhost:8080/" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$evo_ok" == "ok" ]]; then
  pass "Evolution API → reachable"
else
  warn "Evolution API → unreachable (WhatsApp notifications disabled)"
fi

# ── Disk space ──────────────────────────────────────────
echo ""
echo "  RESOURCES"
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if   [[ $disk_usage -lt 70 ]]; then pass "Disk usage → ${disk_usage}% (healthy)"
elif [[ $disk_usage -lt 85 ]]; then warn "Disk usage → ${disk_usage}% (watch this)"
else fail "Disk usage → ${disk_usage}% (critical!)"
fi

mem_usage=$(free | awk 'NR==2 {printf "%.0f", $3/$2*100}')
if   [[ $mem_usage -lt 80 ]]; then pass "Memory usage → ${mem_usage}%"
elif [[ $mem_usage -lt 90 ]]; then warn "Memory usage → ${mem_usage}% (high)"
else fail "Memory usage → ${mem_usage}% (critical!)"
fi

# ── Summary ─────────────────────────────────────────────
echo ""
echo "  ─────────────────────────────────────────"
if [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GREEN}🚀 All systems operational${NC}"
  echo ""
  exit 0
else
  echo -e "  ${RED}💥 ${FAILED} check(s) failed${NC}"
  echo ""
  exit 1
fi

