import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobRunnerService } from './job-runner.service';

@Processor('orchestrator-jobs', {
  concurrency: parseInt(process.env.JOBS_ORCHESTRATOR_CONCURRENCY || '1', 10),
})
export class OrchestratorJobProcessor extends WorkerHost {
  private readonly logger = new Logger(OrchestratorJobProcessor.name);

  constructor(private readonly runner: JobRunnerService) {
    super();
  }

  async process(job: Job<{ jobId: string }>) {
    this.logger.log(`Processando job ${job.data.jobId}`);
    await this.runner.run(job.data.jobId);
    return { ok: true };
  }
}
