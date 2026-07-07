import { Module, forwardRef } from '@nestjs/common';
import { CognitiveOrchestratorService } from './cognitive-orchestrator.service';
import { IntentAnalyzerService } from './intent-analyzer.service';
import { PlannerService } from './planner.service';
import { ExecutionLoopService } from './execution-loop.service';
import { ReflectionService } from './reflection.service';
import { MemoryDecisionService } from './memory-decision.service';
import { EventService } from './event.service';
import { OrchestratorConfigService } from './orchestrator.config';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import {
  OrchestratorController,
  WebhookController,
} from './orchestrator.controller';
import { ContextModule } from '../context/context.module';
import { LlmModule } from '../llm/llm.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ToolsModule } from '../tools/tools.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [ContextModule, LlmModule, forwardRef(() => ConversationsModule), ToolsModule, forwardRef(() => JobsModule)],
  controllers: [OrchestratorController, WebhookController],
  providers: [
    OrchestratorConfigService,
    WebhookDispatcherService,
    CognitiveOrchestratorService,
    IntentAnalyzerService,
    PlannerService,
    ExecutionLoopService,
    ReflectionService,
    MemoryDecisionService,
    EventService,
  ],
  exports: [CognitiveOrchestratorService, EventService],
})
export class OrchestratorModule {}
