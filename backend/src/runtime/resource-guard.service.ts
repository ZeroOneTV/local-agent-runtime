import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as os from 'os';
import { PerformanceConfigService } from './performance.config';

export interface ResourceSnapshot {
  profile: string;
  underPressure: boolean;
  lowPriorityPaused: boolean;
  memory: { usedPercent: number; limitPercent: number };
  cpu: { usedPercent: number; limitPercent: number };
}

@Injectable()
export class ResourceGuardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceGuardService.name);
  private interval?: NodeJS.Timeout;
  private lowPriorityPaused = false;
  private lastCpu = process.cpuUsage();
  private lastCpuAt = Date.now();
  private cpuUsedPercent = 0;

  constructor(private readonly perf: PerformanceConfigService) {}

  onModuleInit() {
    if (!this.perf.resourceGuardEnabled) return;
    this.interval = setInterval(() => this.tick(), this.perf.resourceGuardCheckIntervalMs);
    this.tick();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  isLowPriorityPaused(): boolean {
    return this.lowPriorityPaused;
  }

  shouldAllowLowPriorityJob(): boolean {
    if (!this.perf.resourceGuardEnabled) return true;
    return !this.lowPriorityPaused;
  }

  getSnapshot(): ResourceSnapshot {
    const total = os.totalmem();
    const free = os.freemem();
    const usedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;

    return {
      profile: this.perf.profile,
      underPressure: this.lowPriorityPaused,
      lowPriorityPaused: this.lowPriorityPaused,
      memory: {
        usedPercent,
        limitPercent: this.perf.resourceGuardMaxRamPercent,
      },
      cpu: {
        usedPercent: this.cpuUsedPercent,
        limitPercent: this.perf.resourceGuardMaxCpuPercent,
      },
    };
  }

  private tick() {
    this.sampleCpu();
    const snap = this.getSnapshot();
    const ramHigh = snap.memory.usedPercent >= snap.memory.limitPercent;
    const cpuHigh = snap.cpu.usedPercent >= snap.cpu.limitPercent;

    if (this.perf.resourceGuardPauseLowPriority && (ramHigh || cpuHigh)) {
      if (!this.lowPriorityPaused) {
        this.logger.warn(
          `Resource pressure: RAM ${snap.memory.usedPercent}% CPU ${snap.cpu.usedPercent}% — pausing low-priority jobs`,
        );
      }
      this.lowPriorityPaused = true;
    } else {
      if (this.lowPriorityPaused) {
        this.logger.log('Resource pressure relieved — resuming low-priority jobs');
      }
      this.lowPriorityPaused = false;
    }
  }

  private sampleCpu() {
    const now = Date.now();
    const elapsedMs = now - this.lastCpuAt;
    if (elapsedMs < 500) return;

    const current = process.cpuUsage(this.lastCpu);
    const cpuMs = (current.user + current.system) / 1000;
    this.cpuUsedPercent = Math.min(100, Math.round((cpuMs / elapsedMs) * 100));
    this.lastCpu = process.cpuUsage();
    this.lastCpuAt = now;
  }
}
