#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DEFAULT_PROJECT_ID="00000000-0000-4000-8000-000000000001"

echo "==> Seed do banco..."
docker compose exec -T backend npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_PROJECT_ID = '${DEFAULT_PROJECT_ID}';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'admin@local.ai' },
    update: {},
    create: { email: 'admin@local.ai', name: 'Admin' },
  });

  const project = await prisma.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    update: {},
    create: {
      id: DEFAULT_PROJECT_ID,
      name: 'Projeto Padrão',
      description: 'Projeto inicial do assistente local',
      ownerId: user.id,
      rootPath: '/storage/projects',
    },
  });

  await prisma.setting.upsert({
    where: { key: 'default_project_id' },
    update: { value: DEFAULT_PROJECT_ID },
    create: { key: 'default_project_id', value: DEFAULT_PROJECT_ID },
  });

  console.log('Seed OK:', { ownerId: user.id, projectId: project.id });
}

main().finally(() => prisma.\$disconnect());
"

echo "Seed concluído."
