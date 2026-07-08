import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { getAppRole } from './runtime/app-role.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log(`APP_ROLE=${getAppRole()}`);

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3080',
      process.env.OPENWEBUI_URL || 'http://localhost:3080',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.BACKEND_PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);
}

bootstrap();
