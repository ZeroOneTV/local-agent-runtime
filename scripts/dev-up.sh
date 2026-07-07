#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Subindo stack local..."
docker compose up -d --build

echo "==> Aguardando Postgres..."
sleep 5

echo "==> Rodando migrations..."
docker compose exec -T backend npx prisma migrate deploy 2>/dev/null || \
  docker compose exec -T backend npx prisma db push

echo ""
echo "Stack pronta!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001/health"
echo "  Postgres: localhost:5432"
echo "  Redis:    localhost:6379"
