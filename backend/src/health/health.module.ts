import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LlmModule } from '../llm/llm.module';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [LlmModule, RuntimeModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
