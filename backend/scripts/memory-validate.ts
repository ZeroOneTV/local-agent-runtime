#!/usr/bin/env ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryPortabilityService } from '../src/memory-stratification/memory-portability.service';

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Uso: npm run memory:validate -- ./memory-export.zip');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const portability = app.get(MemoryPortabilityService);
  const result = await portability.validateImport(zipPath);
  console.log(JSON.stringify(result, null, 2));
  await app.close();
  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
