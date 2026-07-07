import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsService } from './jobs.service';
import { JobRunnerService } from './job-runner.service';
import { JobEventService } from './job-event.service';
import { JobsQueryService } from './jobs-query.service';
import { JobsController } from './jobs.controller';
import { OrchestratorJobProcessor } from './orchestrator-job.processor';
import { RagModule } from '../rag/rag.module';
import { LlmModule } from '../llm/llm.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'orchestrator-jobs' }),
    RagModule,
    LlmModule,
    ToolsModule,
    forwardRef(() => OrchestratorModule),
  ],
  providers: [
    JobsService,
    JobsQueryService,
    JobRunnerService,
    JobEventService,
    OrchestratorJobProcessor,
  ],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
