import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolRegistryService } from './tool-registry.service';
import { ToolRouterService } from './tool-router.service';
import { ToolExecutionService } from './tool-execution.service';
import { PathGuardService } from './path-guard.service';
import { FileSystemService } from './services/filesystem.service';
import { GitService } from './services/git.service';
import { TerminalService } from './services/terminal.service';
import { ProjectInspectService } from './services/project.service';
import { BrowserService } from './services/browser.service';
import { MemoryModule } from '../memory/memory.module';
import { RagModule } from '../rag/rag.module';
import { QueueModule } from '../queue/queue.module';
import { SecurityModule } from '../security/security.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MemoryModule, RagModule, QueueModule, SecurityModule, MediaModule],
  controllers: [ToolsController],
  providers: [
    PathGuardService,
    FileSystemService,
    GitService,
    TerminalService,
    ProjectInspectService,
    BrowserService,
    ToolRegistryService,
    ToolRouterService,
    ToolExecutionService,
  ],
  exports: [ToolRegistryService, ToolRouterService, ToolExecutionService, ProjectInspectService],
})
export class ToolsModule {}
