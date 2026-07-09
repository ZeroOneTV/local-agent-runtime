import { Injectable } from '@nestjs/common';
import { LocalFilesystemConfigService } from '../local-filesystem.config';

@Injectable()
export class HostAgentFilesystemProvider {
  constructor(private readonly fsConfig: LocalFilesystemConfigService) {}

  async notImplemented(): Promise<never> {
    throw new Error(
      `Modo host-agent ainda não implementado. Configure um agente nativo em ${this.fsConfig.hostAgentBaseUrl}`,
    );
  }
}
