import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ContextConfigService {
  constructor(private readonly config: ConfigService) {}

  get recentMessagesWindow(): number {
    return this.config.get<number>('context.recentMessagesWindow') ?? 15;
  }

  get summaryMessageThreshold(): number {
    return this.config.get<number>('context.summaryMessageThreshold') ?? 20;
  }

  get summaryTokenThreshold(): number {
    return this.config.get<number>('context.summaryTokenThreshold') ?? 4000;
  }

  get memoryLimit(): number {
    return this.config.get<number>('context.memoryLimit') ?? 5;
  }

  get ragChunkLimit(): number {
    return this.config.get<number>('context.ragChunkLimit') ?? 5;
  }

  get recentToolResultsLimit(): number {
    return this.config.get<number>('context.recentToolResultsLimit') ?? 5;
  }

  get highImportanceThreshold(): number {
    return this.config.get<number>('context.highImportanceThreshold') ?? 4;
  }
}
