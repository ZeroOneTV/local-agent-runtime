import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MemoryStratificationConfigService {
  constructor(private readonly config: ConfigService) {}

  get workingTtlHours() {
    return this.config.get<number>('memoryStratification.workingTtlHours') ?? 72;
  }

  get workingProjectTtlDays() {
    return this.config.get<number>('memoryStratification.workingProjectTtlDays') ?? 7;
  }

  get recentTtlDays() {
    return this.config.get<number>('memoryStratification.recentTtlDays') ?? 30;
  }

  get deepArchiveAfterDays() {
    return this.config.get<number>('memoryStratification.deepArchiveAfterDays') ?? 180;
  }

  get accessRefresh() {
    return this.config.get<boolean>('memoryStratification.accessRefresh') !== false;
  }

  get enableDeepRetrieval() {
    return this.config.get<boolean>('memoryStratification.retrievalEnableDeep') !== false;
  }

  get enableArchiveRetrieval() {
    return this.config.get<boolean>('memoryStratification.retrievalEnableArchive') === true;
  }

  get maxRecent() {
    return this.config.get<number>('memoryStratification.retrievalMaxRecent') ?? 5;
  }

  get maxConsolidated() {
    return this.config.get<number>('memoryStratification.retrievalMaxConsolidated') ?? 5;
  }

  get maxDeep() {
    return this.config.get<number>('memoryStratification.retrievalMaxDeep') ?? 3;
  }

  get exportDefaultProfile() {
    return this.config.get<string>('memoryStratification.exportDefaultProfile') ?? 'portable';
  }

  get exportIncludeWorking() {
    return this.config.get<boolean>('memoryStratification.exportIncludeWorking') === true;
  }

  get exportIncludeAudit() {
    return this.config.get<boolean>('memoryStratification.exportIncludeAudit') === true;
  }

  get exportMaxSizeMb() {
    return this.config.get<number>('memoryStratification.exportMaxSizeMb') ?? 2048;
  }

  get importDefaultMode() {
    return (this.config.get<string>('memoryStratification.importDefaultMode') ??
      'new_project') as 'new_project' | 'merge' | 'replace';
  }

  get importAutoReembed() {
    return this.config.get<boolean>('memoryStratification.importAutoReembed') !== false;
  }

  get storageRoot() {
    return this.config.get<string>('memoryStratification.storageRoot') ?? '/storage/memory';
  }

  get exportsPath() {
    return `${this.storageRoot}/exports`;
  }

  get importsPath() {
    return `${this.storageRoot}/imports`;
  }

  get backupsPath() {
    return `${this.storageRoot}/backups`;
  }

  get tempPath() {
    return `${this.storageRoot}/temp`;
  }

  get reportsPath() {
    return `${this.storageRoot}/reports`;
  }

  get archiveStoragePath() {
    return this.config.get<string>('storage.path') + '/archive';
  }
}
