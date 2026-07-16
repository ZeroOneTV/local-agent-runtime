import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrchestratorConfigService {
  constructor(private readonly config: ConfigService) {}

  get maxCycles(): number {
    return this.config.get<number>('cognitive.maxCycles') ?? 8;
  }

  get maxConsecutiveTools(): number {
    return this.config.get<number>('cognitive.maxConsecutiveTools') ?? 3;
  }

  get requireMemoryConfirmation(): boolean {
    return this.config.get<boolean>('cognitive.requireMemoryConfirmation') ?? true;
  }

  get defaultMode(): string {
    return this.config.get<string>('cognitive.defaultMode') ?? 'assisted_executor';
  }

  get eventSystemEnabled(): boolean {
    return this.config.get<boolean>('cognitive.eventSystem') ?? true;
  }

  get debug(): boolean {
    return this.config.get<boolean>('cognitive.debug') ?? false;
  }

  /** Opt-in native Ollama function-calling agent loop. */
  get nativeToolCalling(): boolean {
    return this.config.get<boolean>('agentic.nativeToolCalling') ?? false;
  }
}
