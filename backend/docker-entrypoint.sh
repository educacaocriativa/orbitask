#!/bin/sh

echo "=== Orbitask startup ==="

# Inicia Redis em background
redis-server --port 6379 --dir /var/lib/redis --loglevel warning &
REDIS_PID=$!

# Aguarda Redis responder (máx 20s)
i=0
while [ $i -lt 20 ]; do
  if redis-cli -p 6379 ping 2>/dev/null | grep -q PONG; then
    echo "Redis OK"
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ $i -eq 20 ]; then
  echo "AVISO: Redis nao respondeu em 20s, continuando mesmo assim..."
fi

# Inicia a aplicação
exec node dist/server.js
