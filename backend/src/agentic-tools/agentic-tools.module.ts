import { Module } from '@nestjs/common';
import { AgenticToolPolicyService } from './agentic-tool-policy.service';
import { ToolAutoExecutionService } from './tool-auto-execution.service';
import { ToolApprovalService } from './tool-approval.service';
import { ToolGrantService } from './tool-grant.service';
import { ApprovalMessageRendererService } from './approval-message-renderer.service';
import { ToolResultSummarizerService } from './tool-result-summarizer.service';
import { AgenticApprovalsController } from './agentic-approvals.controller';
import { KnownFoldersResolverService } from './known-folders-resolver.service';
import { ActiveTargetService } from './active-target.service';
import { NativeToolLoopService } from './native-tool-loop.service';
import { ToolsModule } from '../tools/tools.module';
import { SecurityModule } from '../security/security.module';
import { LocalFilesystemModule } from '../local-filesystem/local-filesystem.module';
import { MemoryStratificationModule } from '../memory-stratification/memory-stratification.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    ToolsModule,
    SecurityModule,
    LocalFilesystemModule,
    MemoryStratificationModule,
    LlmModule,
  ],
  controllers: [AgenticApprovalsController],
  providers: [
    AgenticToolPolicyService,
    ToolAutoExecutionService,
    ToolApprovalService,
    ToolGrantService,
    ApprovalMessageRendererService,
    ToolResultSummarizerService,
    KnownFoldersResolverService,
    ActiveTargetService,
    NativeToolLoopService,
  ],
  exports: [
    AgenticToolPolicyService,
    ToolApprovalService,
    ToolGrantService,
    ToolAutoExecutionService,
    KnownFoldersResolverService,
    ActiveTargetService,
    NativeToolLoopService,
  ],
})
export class AgenticToolsModule {}
