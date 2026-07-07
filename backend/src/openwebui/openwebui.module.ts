import { Module, forwardRef } from '@nestjs/common';
import { OpenAiCompatibleController } from './openai-compatible.controller';
import { OpenWebuiFilesController } from './openwebui-files.controller';
import { ApprovalsController } from './approvals.controller';
import { OpenWebuiConfigService } from './openwebui.config';
import { LogicalModelsService } from './logical-models.service';
import { OpenAiStreamService } from './openai-stream.service';
import { OpenAiAuthGuard } from './openai-auth.guard';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { FilesModule } from '../files/files.module';
import { RagModule } from '../rag/rag.module';
import { ToolsModule } from '../tools/tools.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    forwardRef(() => OrchestratorModule),
    forwardRef(() => ConversationsModule),
    FilesModule,
    RagModule,
    ToolsModule,
    MediaModule,
  ],
  controllers: [OpenAiCompatibleController, OpenWebuiFilesController, ApprovalsController],
  providers: [
    OpenWebuiConfigService,
    LogicalModelsService,
    OpenAiStreamService,
    OpenAiAuthGuard,
  ],
  exports: [LogicalModelsService, OpenWebuiConfigService],
})
export class OpenWebuiModule {}
