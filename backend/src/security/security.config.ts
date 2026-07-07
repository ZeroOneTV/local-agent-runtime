import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityConfigService {
  constructor(private readonly config: ConfigService) {}

  get maxOutputChars(): number {
    return this.config.get<number>('tools.maxOutputChars') ?? 4000;
  }

  get commandTimeoutMs(): number {
    return this.config.get<number>('tools.commandTimeoutMs') ?? 30000;
  }

  get maxConsecutiveCalls(): number {
    return this.config.get<number>('security.maxConsecutiveCalls') ?? 20;
  }

  get maxDirectoryDepth(): number {
    return this.config.get<number>('security.maxDirectoryDepth') ?? 8;
  }

  get maxFilesPerSearch(): number {
    return this.config.get<number>('security.maxFilesPerSearch') ?? 100;
  }

  get shellAllowlist(): string[] {
    const raw =
      this.config.get<string>('security.shellAllowlist') ||
      'npm,git,node,ls,cat,pwd,echo,npx';
    return raw.split(',').map((c) => c.trim());
  }

  get disabledTools(): string[] {
    const raw = this.config.get<string>('security.disabledTools') || '';
    return raw ? raw.split(',').map((t) => t.trim()) : [];
  }

  get autonomousTools(): string[] {
    const raw =
      this.config.get<string>('security.autonomousTools') ||
      'read_file,list_directory,search_files,git_status,search_rag';
    return raw.split(',').map((t) => t.trim());
  }

  get blockDeleteInProduction(): boolean {
    return this.config.get<boolean>('security.blockDeleteInProduction') ?? true;
  }

  get blockBrowserOffline(): boolean {
    return this.config.get<boolean>('security.blockBrowserOffline') ?? true;
  }
}
