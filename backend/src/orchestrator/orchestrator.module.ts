import { Module, forwardRef } from '@nestjs/common';
import { CognitiveOrchestratorService } from './cognitive-orchestrator.service';
import { IntentAnalyzerService } from './intent-analyzer.service';
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
import { MemoryStratificationModule } from '../memory-stratification/memory-stratification.module';
import { AgenticToolsModule } from '../agentic-tools/agentic-tools.module';
import { LocalFilesystemModule } from '../local-filesystem/local-filesystem.module';

@Module({
  imports: [
    ContextModule,
    LlmModule,
    forwardRef(() => ConversationsModule),
    ToolsModule,
    forwardRef(() => JobsModule),
    MemoryStratificationModule,
    AgenticToolsModule,
    LocalFilesystemModule,
  ],
  controllers: [OrchestratorController, WebhookController],
  providers: [
    OrchestratorConfigService,
    WebhookDispatcherService,
    CognitiveOrchestratorService,
    IntentAnalyzerService,
    MemoryDecisionService,
    EventService,
  ],
  exports: [CognitiveOrchestratorService, EventService],
})
export class OrchestratorModule {}
