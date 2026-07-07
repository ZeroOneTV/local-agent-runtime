import { Controller, Get } from '@nestjs/common';
import { LlmService } from './llm/llm.service';

@Controller()
export class HealthController {
  constructor(private readonly llm: LlmService) {}

  @Get('health')
  async health() {
    const llmAvailable = await this.llm.healthCheck();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      llm: llmAvailable ? 'connected' : 'unavailable',
    };
  }
}
