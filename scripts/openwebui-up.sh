#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Subindo stack com Open WebUI + workers..."
docker compose --profile openwebui --profile workers up -d --build

echo "==> Aguardando Postgres..."
sleep 5

echo "==> Rodando migrations..."
docker compose exec -T backend npx prisma migrate deploy 2>/dev/null || \
  docker compose exec -T backend npx prisma db push

echo ""
echo "Stack pronta!"
echo "  Open WebUI: http://localhost:${OPENWEBUI_PORT:-3080}"
echo "  Backend:    http://localhost:3001/health"
echo "  Aprovações: http://localhost:3001/approvals"
echo ""
echo "Configure no Open WebUI (Admin → Connections → OpenAI API):"
echo "  Base URL: http://backend:3001/v1  (dentro do Docker)"
echo "  Base URL: http://localhost:3001/v1 (fora do Docker)"
echo "  API Key:  ${OPENWEBUI_API_KEY:-local-dev-key}"
