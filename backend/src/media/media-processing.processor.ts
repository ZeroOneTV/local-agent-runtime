import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MediaProcessingService } from './media-processing.service';
import { ProcessingMode } from './media.types';

@Processor('media-processing')
export class MediaProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingProcessor.name);

  constructor(private readonly processing: MediaProcessingService) {
    super();
  }

  async process(job: Job<{ mediaAssetId: string; mode?: ProcessingMode }>) {
    this.logger.log(`Processando mídia ${job.data.mediaAssetId} (${job.name})`);
    await this.processing.runProcessImage({
      mediaAssetId: job.data.mediaAssetId,
      mode: job.data.mode,
    });
    return { ok: true };
  }
}
