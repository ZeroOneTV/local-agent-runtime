#!/usr/bin/env ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryPortabilityService } from '../src/memory-stratification/memory-portability.service';

async function main() {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const profileIdx = args.indexOf('--profile');
  const projectId = projectIdx >= 0 ? args[projectIdx + 1] : process.env.DEFAULT_PROJECT_ID;
  const profile = profileIdx >= 0 ? args[profileIdx + 1] : 'portable';

  if (!projectId) {
    console.error('Uso: npm run memory:export -- --project <id> [--profile portable|minimal|full]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const portability = app.get(MemoryPortabilityService);
  const result = await portability.export({
    projectId,
    profile: profile as 'minimal' | 'portable' | 'full' | 'archive',
  });
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
