#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Subindo stack my_llm (Open WebUI + infra)..."
docker compose up -d postgres redis open-webui media-worker worker-all

echo "==> Aguardando Postgres..."
sleep 5

echo ""
echo "Stack pronta (projeto: my_llm)"
echo "  Open WebUI: http://localhost:${OPENWEBUI_PORT:-3080}"
echo "  Backend:    http://localhost:3001/health"
echo ""
echo "Backend no Docker (opcional): docker compose --profile docker-backend up -d backend"
echo "Backend nativo no Windows: npm run start:dev em backend/"
echo ""
echo "Open WebUI aponta para: ${OPENWEBUI_BACKEND_URL:-http://host.docker.internal:3001/v1}"
echo "API Key: ${OPENWEBUI_API_KEY:-local-dev-key}"
