import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { envConfig } from './config/env.config';
import { PrismaModule } from './database/prisma.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ProcessorsModule } from './runtime/processors.module';
import { QueueModule } from './queue/queue.module';
import { JobsModule } from './jobs/jobs.module';
import { RagModule } from './rag/rag.module';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';
import { MediaModule } from './media/media.module';
import { MemoryStratificationModule } from './memory-stratification/memory-stratification.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [envConfig] }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    PrismaModule,
    RuntimeModule,
    RagModule,
    LlmModule,
    ToolsModule,
    OrchestratorModule,
    QueueModule,
    JobsModule,
    MediaModule,
    MemoryStratificationModule,
    ProcessorsModule,
  ],
})
export class WorkerAppModule {}
