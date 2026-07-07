#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Parando stack local..."
docker compose down

echo "Stack parada."
