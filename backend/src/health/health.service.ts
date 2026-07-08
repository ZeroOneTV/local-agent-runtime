import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { PrismaService } from '../database/prisma.service';
import { LlmService } from '../llm/llm.service';
import { ResourceGuardService } from '../runtime/resource-guard.service';
import { QueueMonitorService } from '../runtime/queue-monitor.service';
import { getAppRole } from '../runtime/app-role.util';

export type ServiceStatus = 'ok' | 'unavailable' | 'degraded';

export interface HealthReport {
  status: 'ok' | 'degraded' | 'unavailable';
  timestamp: string;
  services: Record<string, ServiceStatus>;
  details?: Record<string, unknown>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly resourceGuard: ResourceGuardService,
    private readonly queueMonitor: QueueMonitorService,
  ) {}

  async checkAll(): Promise<HealthReport> {
    const [db, redis, llm, mediaWorker, storage] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkLlm(),
      this.checkMediaWorker(),
      this.checkStorage(),
    ]);

    const services = {
      backend: 'ok' as ServiceStatus,
      db: db.status,
      redis: redis.status,
      llm: llm.status,
      mediaWorker: mediaWorker.status,
      storage: storage.status,
    };

    const values = Object.values(services);
    let status: HealthReport['status'] = 'ok';
    if (values.includes('unavailable')) {
      status = values.filter((v) => v === 'unavailable').length >= 2 ? 'unavailable' : 'degraded';
    } else if (values.includes('degraded')) {
      status = 'degraded';
    }

    // LLM off is expected in dev — treat as degraded, not unavailable
    if (services.llm === 'unavailable' && services.db === 'ok') {
      status = status === 'unavailable' ? 'degraded' : status;
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      services,
      details: {
        db: db.detail,
        redis: redis.detail,
        llm: llm.detail,
        mediaWorker: mediaWorker.detail,
        storage: storage.detail,
      },
    };
  }

  async checkDb() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as ServiceStatus, detail: { connected: true } };
    } catch (error) {
      return {
        status: 'unavailable' as ServiceStatus,
        detail: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async checkRedis() {
    const url = this.config.get<string>('redis.url') || 'redis://redis:6379';
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis(url, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      return { status: pong === 'PONG' ? ('ok' as ServiceStatus) : ('degraded' as ServiceStatus), detail: { pong } };
    } catch (error) {
      return {
        status: 'unavailable' as ServiceStatus,
        detail: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async checkLlm() {
    try {
      const available = await this.llm.healthCheck();
      return {
        status: (available ? 'ok' : 'unavailable') as ServiceStatus,
        detail: { available },
      };
    } catch (error) {
      return {
        status: 'unavailable' as ServiceStatus,
        detail: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async checkMediaWorker() {
    const url = `${this.config.get<string>('media.workerUrl') || 'http://media-worker:5000'}/health`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return { status: 'unavailable' as ServiceStatus, detail: { statusCode: response.status } };
      }
      const body = await response.json();
      return { status: 'ok' as ServiceStatus, detail: body };
    } catch {
      return {
        status: 'unavailable' as ServiceStatus,
        detail: { message: 'media-worker not reachable (profile media may be off)' },
      };
    }
  }

  async checkStorage() {
    const root = this.config.get<string>('storage.path') || '/storage';
    const dirs = [
      root,
      this.config.get<string>('storage.temp') || `${root}/temp`,
      this.config.get<string>('storage.artifacts') || `${root}/artifacts`,
    ];

    try {
      const checks = await Promise.all(
        dirs.map(async (dir) => {
          await fs.mkdir(dir, { recursive: true });
          const testFile = `${dir}/.healthcheck`;
          await fs.writeFile(testFile, 'ok');
          await fs.unlink(testFile);
          return { dir, writable: true };
        }),
      );
      return { status: 'ok' as ServiceStatus, detail: { dirs: checks } };
    } catch (error) {
      return {
        status: 'degraded' as ServiceStatus,
        detail: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async checkResources() {
    const resources = this.resourceGuard.getSnapshot();
    const queues = await this.queueMonitor.getQueueCounts();
    return {
      profile: resources.profile,
      appRole: getAppRole(),
      memory: resources.memory,
      cpu: resources.cpu,
      underPressure: resources.underPressure,
      lowPriorityPaused: resources.lowPriorityPaused,
      queues: Object.fromEntries(
        Object.entries(queues).map(([k, v]) => [k, v.waiting + v.active]),
      ),
    };
  }

  async checkQueues() {
    return this.queueMonitor.getQueueCounts();
  }

  async checkWorkers() {
    return this.queueMonitor.getWorkersReport();
  }
}
