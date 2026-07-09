import { Injectable, Logger } from '@nestjs/common';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { FilesystemAuditEntry } from './local-filesystem.types';

@Injectable()
export class FilesystemAuditService {
  private readonly logger = new Logger(FilesystemAuditService.name);
  private readonly recent: FilesystemAuditEntry[] = [];
  private readonly maxRecent = 500;

  constructor(private readonly fsConfig: LocalFilesystemConfigService) {}

  log(entry: Omit<FilesystemAuditEntry, 'timestamp'>): void {
    if (!this.fsConfig.auditEnabled) return;

    const full: FilesystemAuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.recent.unshift(full);
    if (this.recent.length > this.maxRecent) {
      this.recent.length = this.maxRecent;
    }

    this.logger.log(
      JSON.stringify({
        event: 'filesystem.audit',
        ...full,
      }),
    );
  }

  getRecent(limit = 50): FilesystemAuditEntry[] {
    return this.recent.slice(0, limit);
  }
}
