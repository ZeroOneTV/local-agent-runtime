import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { MemoryDecayService } from './memory-decay.service';
import { MemoryExportService } from './memory-export.service';
import { MemoryImportService } from './memory-import.service';
import { MemoryEtlService } from './memory-etl.service';
import { DeepMemoryService } from './deep-memory.service';
import { MemoryCompatibilityService } from './memory-compatibility.service';

@Processor('memory-jobs', {
  concurrency: parseInt(process.env.JOBS_MEMORY_CONCURRENCY || '1', 10),
})
export class MemoryStratificationProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryStratificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decay: MemoryDecayService,
    private readonly exportService: MemoryExportService,
    private readonly importService: MemoryImportService,
    private readonly etl: MemoryEtlService,
    private readonly deep: DeepMemoryService,
    private readonly compatibility: MemoryCompatibilityService,
  ) {
    super();
  }

  async process(job: Job) {
    const name = job.name;
    this.logger.log(`Memory job: ${name}`);

    switch (name) {
      case 'memory_decay':
        return this.decay.run(job.data.projectId);

      case 'memory_export':
        return this.exportService.export(job.data);

      case 'memory_import':
        return this.importService.import(job.data);

      case 'memory_etl':
        if (job.data.type === 'conversation_turn') {
          return this.etl.extractFromConversationTurn(job.data.payload);
        }
        if (job.data.type === 'job_result') {
          return this.etl.extractFromJobResult(job.data.projectId, job.data.jobId);
        }
        return null;

      case 'memory_reembedding': {
        const { projectId, jobId } = job.data;
        await this.prisma.job.update({
          where: { id: jobId },
          data: { status: 'running', startedAt: new Date() },
        });

        const deepItems = await this.prisma.deepMemoryItem.findMany({
          where: {
            projectId,
            embeddingStatus: 'requires_reembedding',
          },
          take: 500,
        });

        const model = this.compatibility.getCurrentEmbeddingModel();
        for (const item of deepItems) {
          await this.prisma.deepMemoryItem.update({
            where: { id: item.id },
            data: {
              embeddingStatus: 'indexed',
              embeddingModel: model,
              chunkConfigHash: this.compatibility.getChunkConfig().chunkConfigHash,
            },
          });
        }

        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            finishedAt: new Date(),
            result: { reindexed: deepItems.length },
          },
        });

        return { reindexed: deepItems.length };
      }

      case 'deep_memory_archive':
        return this.decay.run(job.data.projectId);

      default:
        this.logger.warn(`Unknown memory job: ${name}`);
        return null;
    }
  }
}
