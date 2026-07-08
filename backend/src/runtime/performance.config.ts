import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PerformanceProfile = 'lite' | 'balanced-low' | 'balanced' | 'performance';

@Injectable()
export class PerformanceConfigService {
  constructor(private readonly config: ConfigService) {}

  get profile(): PerformanceProfile {
    return (this.config.get<string>('performance.profile') ||
      'balanced') as PerformanceProfile;
  }

  get resourceGuardEnabled(): boolean {
    return this.config.get<boolean>('performance.resourceGuardEnabled') !== false;
  }

  get resourceGuardMaxRamPercent(): number {
    return this.config.get<number>('performance.resourceGuardMaxRamPercent') ?? 80;
  }

  get resourceGuardMaxCpuPercent(): number {
    return this.config.get<number>('performance.resourceGuardMaxCpuPercent') ?? 85;
  }

  get resourceGuardPauseLowPriority(): boolean {
    return this.config.get<boolean>('performance.resourceGuardPauseLowPriority') !== false;
  }

  get resourceGuardCheckIntervalMs(): number {
    return this.config.get<number>('performance.resourceGuardCheckIntervalMs') ?? 5000;
  }

  get toolResultInlineMaxKb(): number {
    return this.config.get<number>('performance.toolResultInlineMaxKb') ?? 32;
  }

  get contextArtifactPreviewMaxKb(): number {
    return this.config.get<number>('performance.contextArtifactPreviewMaxKb') ?? 16;
  }

  get ragTopK(): number {
    return this.config.get<number>('performance.ragTopK') ?? 5;
  }
}
