import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  checkAll() {
    return this.health.checkAll();
  }

  @Get('db')
  async checkDb() {
    const result = await this.health.checkDb();
    return { service: 'db', ...result };
  }

  @Get('redis')
  async checkRedis() {
    const result = await this.health.checkRedis();
    return { service: 'redis', ...result };
  }

  @Get('llm')
  async checkLlm() {
    const result = await this.health.checkLlm();
    return { service: 'llm', ...result };
  }

  @Get('media-worker')
  async checkMediaWorker() {
    const result = await this.health.checkMediaWorker();
    return { service: 'mediaWorker', ...result };
  }

  @Get('storage')
  async checkStorage() {
    const result = await this.health.checkStorage();
    return { service: 'storage', ...result };
  }

  @Get('queues')
  checkQueues() {
    return this.health.checkQueues();
  }

  @Get('workers')
  checkWorkers() {
    return this.health.checkWorkers();
  }

  @Get('resources')
  checkResources() {
    return this.health.checkResources();
  }
}
