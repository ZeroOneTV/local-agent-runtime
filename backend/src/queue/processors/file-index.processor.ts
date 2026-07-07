import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IndexingService } from '../../rag/indexing.service';

@Processor('file-index')
export class FileIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(FileIndexProcessor.name);

  constructor(private readonly indexing: IndexingService) {
    super();
  }

  async process(
    job: Job<{
      projectId: string;
      filePath: string;
      filename: string;
      content: string;
    }>,
  ) {
    this.logger.log(`Indexando arquivo: ${job.data.filePath}`);
    return this.indexing.indexFile(
      job.data.projectId,
      job.data.filePath,
      job.data.filename,
      job.data.content,
    );
  }
}
