import { Injectable } from '@nestjs/common';
import { MemoryExportService, ExportRequest } from './memory-export.service';
import { MemoryImportService, ImportRequest } from './memory-import.service';
import { MemoryValidationService } from './memory-validation.service';
import { MemoryDecayService } from './memory-decay.service';
import { MemoryEtlService } from './memory-etl.service';
import { ExportProfile } from './memory.types';

@Injectable()
export class MemoryBackupService {
  constructor(
    private readonly exportService: MemoryExportService,
    private readonly importService: MemoryImportService,
  ) {}

  async createBackup(projectId: string) {
    return this.exportService.export({
      projectId,
      profile: 'full',
      includeArtifacts: true,
      includeMedia: true,
    });
  }

  async restoreBackup(filePath: string, ownerId?: string) {
    return this.importService.import({
      filePath,
      mode: 'new_project',
      ownerId,
      reembed: true,
    });
  }
}

@Injectable()
export class MemoryPortabilityService {
  constructor(
    private readonly exportService: MemoryExportService,
    private readonly importService: MemoryImportService,
    private readonly validation: MemoryValidationService,
    private readonly decay: MemoryDecayService,
    private readonly etl: MemoryEtlService,
  ) {}

  export(request: ExportRequest) {
    return this.exportService.export(request);
  }

  validateImport(filePath: string) {
    return this.importService.validateImport(filePath);
  }

  import(request: ImportRequest) {
    return this.importService.import(request);
  }

  listExports(projectId?: string) {
    return this.exportService.listExports(projectId);
  }

  getExport(id: string) {
    return this.exportService.getExport(id);
  }

  deleteExport(id: string) {
    return this.exportService.deleteExport(id);
  }

  runDecay(projectId?: string) {
    return this.decay.run(projectId);
  }

  runEtlFromTurn(params: Parameters<MemoryEtlService['extractFromConversationTurn']>[0]) {
    return this.etl.extractFromConversationTurn(params);
  }
}
