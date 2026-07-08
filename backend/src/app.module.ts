import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { envConfig } from './config/env.config';
import { PrismaModule } from './database/prisma.module';
import { LlmModule } from './llm/llm.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ProjectsModule } from './projects/projects.module';
import { ToolsModule } from './tools/tools.module';
import { RagModule } from './rag/rag.module';
import { MemoryModule } from './memory/memory.module';
import { FilesModule } from './files/files.module';
import { QueueModule } from './queue/queue.module';
import { SecurityModule } from './security/security.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { OpenWebuiModule } from './openwebui/openwebui.module';
import { JobsModule } from './jobs/jobs.module';
import { MediaModule } from './media/media.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { MemoryStratificationModule } from './memory-stratification/memory-stratification.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ProcessorsModule } from './runtime/processors.module';
import { shouldRunAnyProcessor } from './runtime/app-role.util';

const processorImports = shouldRunAnyProcessor() ? [ProcessorsModule] : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    PrismaModule,
    LlmModule,
    ConversationsModule,
    ProjectsModule,
    ToolsModule,
    RagModule,
    MemoryModule,
    FilesModule,
    QueueModule,
    SecurityModule,
    OrchestratorModule,
    OpenWebuiModule,
    JobsModule,
    MediaModule,
    HealthModule,
    StorageModule,
    MemoryStratificationModule,
    RuntimeModule,
    ...processorImports,
  ],
})
export class AppModule {}
