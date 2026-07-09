#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Subindo stack my_llm (media + open-webui + workers)..."
docker compose up -d --build postgres redis open-webui media-worker worker-all

echo "==> Aguardando Postgres..."
sleep 5

echo ""
echo "Stack pronta (projeto: my_llm)"
echo "  Open WebUI:   http://localhost:${OPENWEBUI_PORT:-3080}"
echo "  Backend:      http://localhost:3001/health (host ou --profile docker-backend)"
echo "  Media worker: http://localhost:${MEDIA_WORKER_PORT:-5000}/health"
echo ""
echo "Upload de imagem:"
echo "  curl -X POST http://localhost:3001/v1/files \\"
echo "    -H 'Authorization: Bearer \${OPENWEBUI_API_KEY:-local-dev-key}' \\"
echo "    -F 'file=@screenshot.png' -F 'model=local-assistant'"
