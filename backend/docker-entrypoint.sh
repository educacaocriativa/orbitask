#!/bin/sh

echo "=== Orbitask startup ==="

# Inicia Redis em background
redis-server --port 6379 --dir /var/lib/redis --loglevel warning &
REDIS_PID=$!

# Aguarda Redis responder (máx 20s)
i=0
while [ $i -lt 20 ]; do
  if redis-cli -p 6379 ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis OK"
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ $i -eq 20 ]; then
  echo "⚠️  Redis não respondeu em 20s, continuando..."
fi

# Sincroniza schema com o banco de dados (com retry)
echo "🔄 Sincronizando schema com o banco..."
MAX_RETRIES=5
RETRY=0
DB_SYNCED=0

while [ $RETRY -lt $MAX_RETRIES ]; do
  if node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1; then
    echo "✅ Schema sincronizado com sucesso"
    DB_SYNCED=1
    break
  fi
  RETRY=$((RETRY + 1))
  echo "⚠️  Tentativa $RETRY/$MAX_RETRIES falhou. Aguardando 5s..."
  sleep 5
done

if [ $DB_SYNCED -eq 0 ]; then
  echo "❌ ATENÇÃO: prisma db push falhou após $MAX_RETRIES tentativas."
  echo "   Verifique DATABASE_URL e conectividade com o banco."
  echo "   A aplicação iniciará mas o banco pode estar desatualizado."
fi

# Inicia a aplicação
exec node dist/server.js
