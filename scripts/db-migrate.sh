#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Rodando migrations..."
docker compose exec -T backend npx prisma migrate deploy 2>/dev/null || \
  docker compose exec -T backend npx prisma db push

echo "Migrations concluídas."
