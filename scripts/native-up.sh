#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Subindo my_llm (tudo menos o backend)..."
docker compose up -d --build \
  postgres redis open-webui media-worker worker-all

echo "==> Aguardando serviços..."
sleep 8

echo ""
echo "Stack pronta (projeto Docker: my_llm)"
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || docker ps --filter name=local-ai --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo ""
echo "  Open WebUI:   http://localhost:${OPENWEBUI_PORT:-3080}"
echo "  Media worker: http://localhost:${MEDIA_WORKER_PORT:-5000}/health"
echo "  Postgres:     localhost:5432"
echo "  Redis:        localhost:6379"
echo ""
echo "Backend (Windows/host — fora do Docker):"
echo "  cd backend && copy .env.example.windows-native .env"
echo "  npm run start:dev"
echo ""
echo "  APP_ROLE=api  → se worker-all roda no Docker (recomendado)"
echo "  APP_ROLE=all-in-one  → só se NÃO subir workers no Docker"
echo ""
echo "Open WebUI → ${OPENWEBUI_BACKEND_URL:-http://host.docker.internal:3001/v1}"
