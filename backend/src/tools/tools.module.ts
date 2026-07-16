import { Module, forwardRef } from '@nestjs/common';
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
import { NetGuardService } from './services/net-guard.service';
import { WebSearchService } from './services/web-search/web-search.service';
import { MemoryModule } from '../memory/memory.module';
import { RagModule } from '../rag/rag.module';
import { QueueModule } from '../queue/queue.module';
import { SecurityModule } from '../security/security.module';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { LocalFilesystemModule } from '../local-filesystem/local-filesystem.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MemoryModule,
    RagModule,
    QueueModule,
    SecurityModule,
    MediaModule,
    StorageModule,
    RuntimeModule,
    LocalFilesystemModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [ToolsController],
  providers: [
    PathGuardService,
    FileSystemService,
    GitService,
    TerminalService,
    ProjectInspectService,
    BrowserService,
    NetGuardService,
    WebSearchService,
    ToolRegistryService,
    ToolRouterService,
    ToolExecutionService,
  ],
  exports: [ToolRegistryService, ToolRouterService, ToolExecutionService, ProjectInspectService],
})
export class ToolsModule {}
