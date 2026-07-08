import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerAppModule } from './worker-app.module';
import { getAppRole } from './runtime/app-role.util';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  const role = getAppRole();
  logger.log(`Starting worker process (APP_ROLE=${role})`);

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();
  logger.log('Worker processors active — waiting for jobs');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
