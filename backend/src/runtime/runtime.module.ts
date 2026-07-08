import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceConfigService } from './performance.config';
import { ResourceGuardService } from './resource-guard.service';
import { QueueMonitorService } from './queue-monitor.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'orchestrator-jobs' },
      { name: 'file-index' },
      { name: 'embeddings' },
      { name: 'media-processing' },
      { name: 'memory-jobs' },
    ),
  ],
  providers: [PerformanceConfigService, ResourceGuardService, QueueMonitorService],
  exports: [
    PerformanceConfigService,
    ResourceGuardService,
    QueueMonitorService,
  ],
})
export class RuntimeModule {}
