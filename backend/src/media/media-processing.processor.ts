import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MediaProcessingService } from './media-processing.service';
import { ProcessingMode, ProcessCapabilitiesDto } from './media.types';

@Processor('media-processing', {
  concurrency: parseInt(process.env.JOBS_MEDIA_CONCURRENCY || '1', 10),
})
export class MediaProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingProcessor.name);

  constructor(private readonly processing: MediaProcessingService) {
    super();
  }

  async process(
    job: Job<{
      mediaAssetId: string;
      mode?: ProcessingMode;
      capabilities?: ProcessCapabilitiesDto;
      enableVlm?: boolean;
    }>,
  ) {
    this.logger.log(`Processando mídia ${job.data.mediaAssetId} (${job.name})`);
    await this.processing.runProcessImage({
      mediaAssetId: job.data.mediaAssetId,
      mode: job.data.mode,
      capabilities: job.data.capabilities,
      enableVlm: job.data.enableVlm,
    });
    return { ok: true };
  }
}
