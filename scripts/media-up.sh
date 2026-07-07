#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PROFILES="media"
if [[ "${WITH_OPENWEBUI:-}" == "1" ]]; then
  PROFILES="media,openwebui"
fi

echo "==> Subindo stack com media-worker (profiles: ${PROFILES})..."
docker compose --profile "${PROFILES}" up -d --build

echo "==> Aguardando Postgres..."
sleep 5

echo "==> Rodando migrations..."
docker compose exec -T backend npx prisma migrate deploy 2>/dev/null || \
  docker compose exec -T backend npx prisma db push

echo ""
echo "Stack pronta!"
echo "  Backend:      http://localhost:3001/health"
echo "  Media worker: http://localhost:${MEDIA_WORKER_PORT:-5000}/health"
if [[ "${WITH_OPENWEBUI:-}" == "1" ]]; then
  echo "  Open WebUI:   http://localhost:${OPENWEBUI_PORT:-3080}"
fi
echo ""
echo "Upload de imagem:"
echo "  curl -X POST http://localhost:3001/v1/files \\"
echo "    -H 'Authorization: Bearer \${OPENWEBUI_API_KEY:-local-dev-key}' \\"
echo "    -F 'file=@screenshot.png' -F 'model=local-assistant'"
