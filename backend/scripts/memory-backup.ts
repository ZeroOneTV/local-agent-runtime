#!/usr/bin/env ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryBackupService } from '../src/memory-stratification/memory-portability.service';

async function main() {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const projectId = projectIdx >= 0 ? args[projectIdx + 1] : process.env.DEFAULT_PROJECT_ID;

  if (!projectId) {
    console.error('Uso: npm run memory:backup -- --project <id>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const backup = app.get(MemoryBackupService);
  const result = await backup.createBackup(projectId);
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
