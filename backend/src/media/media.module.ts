import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MediaProcessingService } from './media-processing.service';
import { MediaContextService } from './media-context.service';
import { MediaRagService } from './media-rag.service';
import { MediaEventService } from './media-event.service';
import { MediaConfigService } from './media.config';
import { MediaWorkerClient } from './media-worker.client';
import { MediaProcessingProcessor } from './media-processing.processor';
import { ImageProcessor } from './processors/image.processor';
import { RagModule } from '../rag/rag.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'media-processing' }),
    RagModule,
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [MediaController],
  providers: [
    MediaConfigService,
    MediaStorageService,
    MediaContextService,
    MediaRagService,
    MediaEventService,
    MediaWorkerClient,
    MediaProcessingService,
    MediaService,
    ImageProcessor,
    MediaProcessingProcessor,
  ],
  exports: [MediaService, MediaProcessingService, MediaContextService, ImageProcessor],
})
export class MediaModule {}
