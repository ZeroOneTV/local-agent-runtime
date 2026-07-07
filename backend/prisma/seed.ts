import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DEFAULT_LOCAL_USER_ID,
  DEFAULT_PROJECT_ID,
} from '../src/common/constants';

const prisma = new PrismaClient();

async function copyRagDocs() {
  const src = '/workspace/docs';
  const dest = '/storage/projects/default/docs';
  const files = ['architecture.md', 'tools.md', 'decisions.md'];

  await fs.mkdir(dest, { recursive: true });

  for (const file of files) {
    try {
      await fs.copyFile(path.join(src, file), path.join(dest, file));
    } catch {
      // ignorar se /workspace não estiver montado (seed local)
    }
  }
}

async function main() {
  await copyRagDocs();
  await prisma.user.upsert({
    where: { id: DEFAULT_LOCAL_USER_ID },
    update: { name: 'Local User', email: 'local@assistant.dev' },
    create: {
      id: DEFAULT_LOCAL_USER_ID,
      name: 'Local User',
      email: 'local@assistant.dev',
    },
  });

  const project = await prisma.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    update: {
      name: 'Projeto Padrão',
      rootPath: '/storage/projects/default',
      executionMode: 'developer',
      ownerId: DEFAULT_LOCAL_USER_ID,
    },
    create: {
      id: DEFAULT_PROJECT_ID,
      name: 'Projeto Padrão',
      description: 'Projeto local padrão do assistente',
      rootPath: '/storage/projects/default',
      executionMode: 'developer',
      ownerId: DEFAULT_LOCAL_USER_ID,
    },
  });

  console.log('Seed OK:', { user: DEFAULT_LOCAL_USER_ID, project: project.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
