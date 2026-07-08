import { Module, forwardRef } from '@nestjs/common';
import { ContextService } from './context.service';
import { SummaryService } from './summary.service';
import { ContextConfigService } from './context.config';
import { RagModule } from '../rag/rag.module';
import { LlmModule } from '../llm/llm.module';
import { MediaModule } from '../media/media.module';
import { MemoryStratificationModule } from '../memory-stratification/memory-stratification.module';

@Module({
  imports: [
    RagModule,
    LlmModule,
    MemoryStratificationModule,
    forwardRef(() => MediaModule),
  ],
  providers: [ContextService, SummaryService, ContextConfigService],
  exports: [ContextService, SummaryService, ContextConfigService],
})
export class ContextModule {}
