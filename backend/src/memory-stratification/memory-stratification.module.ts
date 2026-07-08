import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RagModule } from '../rag/rag.module';
import { MemoryModule } from '../memory/memory.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import { WorkingMemoryService } from './working-memory.service';
import { RecentMemoryService } from './recent-memory.service';
import { ConsolidatedMemoryService } from './consolidated-memory.service';
import { DeepMemoryService } from './deep-memory.service';
import { ArchiveService } from './archive.service';
import { MemoryRetrievalRouterService } from './memory-retrieval-router.service';
import { MemoryEtlService } from './memory-etl.service';
import { MemoryDecayService } from './memory-decay.service';
import { MemoryCompatibilityService } from './memory-compatibility.service';
import { MemoryValidationService } from './memory-validation.service';
import { MemoryExportService } from './memory-export.service';
import { MemoryImportService } from './memory-import.service';
import {
  MemoryBackupService,
  MemoryPortabilityService,
} from './memory-portability.service';
import { MemoryStratificationController } from './memory-stratification.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'memory-jobs' }),
    RagModule,
    MemoryModule,
    RuntimeModule,
  ],
  controllers: [MemoryStratificationController],
  providers: [
    MemoryStratificationConfigService,
    WorkingMemoryService,
    RecentMemoryService,
    ConsolidatedMemoryService,
    DeepMemoryService,
    ArchiveService,
    MemoryRetrievalRouterService,
    MemoryEtlService,
    MemoryDecayService,
    MemoryCompatibilityService,
    MemoryValidationService,
    MemoryExportService,
    MemoryImportService,
    MemoryBackupService,
    MemoryPortabilityService,
  ],
  exports: [
    MemoryRetrievalRouterService,
    MemoryPortabilityService,
    WorkingMemoryService,
    MemoryEtlService,
    MemoryDecayService,
    MemoryExportService,
    MemoryImportService,
    DeepMemoryService,
    MemoryCompatibilityService,
  ],
})
export class MemoryStratificationModule {}
