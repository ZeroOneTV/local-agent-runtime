#!/usr/bin/env ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryPortabilityService } from '../src/memory-stratification/memory-portability.service';

async function main() {
  const args = process.argv.slice(2);
  const zipPath = args.find((a) => !a.startsWith('--'));
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'new_project';

  if (!zipPath) {
    console.error('Uso: npm run memory:import -- ./memory-export.zip [--mode new_project|merge|replace]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const portability = app.get(MemoryPortabilityService);
  const result = await portability.import({
    filePath: zipPath,
    mode: mode as 'new_project' | 'merge' | 'replace',
  });
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
