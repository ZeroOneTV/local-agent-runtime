import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryPortabilityService } from './memory-portability.service';
import { MemoryBackupService } from './memory-portability.service';
import { MemoryRetrievalRouterService } from './memory-retrieval-router.service';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import { ExportProfile, ImportMode } from './memory.types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ResourceGuardService } from '../runtime/resource-guard.service';
import { JobPriority, defaultJobOptions } from '../runtime/job-priority';

@Controller('memory')
export class MemoryStratificationController {
  constructor(
    private readonly portability: MemoryPortabilityService,
    private readonly backup: MemoryBackupService,
    private readonly router: MemoryRetrievalRouterService,
    private readonly config: MemoryStratificationConfigService,
    private readonly resourceGuard: ResourceGuardService,
    @InjectQueue('memory-jobs') private readonly memoryQueue: Queue,
  ) {}

  @Post('export')
  async export(
    @Body()
    body: {
      projectId: string;
      profile?: ExportProfile;
      includeArtifacts?: boolean;
      includeMedia?: boolean;
      includeFullConversations?: boolean;
      includeAuditLogs?: boolean;
      includeWorkingMemory?: boolean;
      async?: boolean;
    },
  ) {
    if (body.async) {
      if (!this.resourceGuard.shouldAllowLowPriorityJob()) {
        return { status: 'deferred', reason: 'resource_guard_pressure' };
      }
      const job = await this.memoryQueue.add('memory_export', body, {
        ...defaultJobOptions,
        priority: JobPriority.LOW,
      });
      return { jobId: job.id, status: 'queued' };
    }
    return this.portability.export(body);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body()
    body: {
      mode?: ImportMode;
      targetProjectId?: string;
      reembed?: boolean;
      ownerId?: string;
      filePath?: string;
      async?: boolean;
    },
  ) {
    let filePath = body.filePath;
    if (file) {
      await fs.mkdir(this.config.importsPath, { recursive: true });
      filePath = path.join(this.config.importsPath, `${Date.now()}-${file.originalname}`);
      await fs.writeFile(filePath, file.buffer);
    }
    if (!filePath) {
      return { error: 'file ou filePath obrigatório' };
    }

    const payload = { filePath, ...body };
    if (body.async) {
      const job = await this.memoryQueue.add('memory_import', payload, {
        ...defaultJobOptions,
        priority: JobPriority.LOW,
      });
      return { jobId: job.id, status: 'queued' };
    }
    return this.portability.import(payload);
  }

  @Post('import/validate')
  async validateImport(@Body() body: { filePath: string }) {
    return this.portability.validateImport(body.filePath);
  }

  @Get('exports')
  listExports(@Query('projectId') projectId?: string) {
    return this.portability.listExports(projectId);
  }

  @Get('exports/:id')
  getExport(@Param('id') id: string) {
    return this.portability.getExport(id);
  }

  @Delete('exports/:id')
  deleteExport(@Param('id') id: string) {
    return this.portability.deleteExport(id);
  }

  @Post('backups/create')
  createBackup(@Body() body: { projectId: string }) {
    return this.backup.createBackup(body.projectId);
  }

  @Get('backups')
  listBackups(@Query('projectId') projectId?: string) {
    return this.portability.listExports(projectId);
  }

  @Post('backups/:id/restore')
  async restoreBackup(
    @Param('id') id: string,
    @Body() body: { ownerId?: string },
  ) {
    const record = await this.portability.getExport(id);
    if (!record.filePath) {
      return { error: 'Backup sem arquivo' };
    }
    return this.backup.restoreBackup(record.filePath, body.ownerId);
  }

  @Post('retrieve')
  retrieve(
    @Body()
    body: {
      projectId: string;
      conversationId?: string;
      query: string;
      intent?: string;
      maxTokens?: number;
    },
  ) {
    return this.router.retrieve(body);
  }

  @Post('decay/run')
  async runDecay(@Body() body: { projectId?: string; async?: boolean }) {
    if (!this.resourceGuard.shouldAllowLowPriorityJob()) {
      return { status: 'deferred', reason: 'resource_guard_pressure' };
    }
    if (body.async) {
      const job = await this.memoryQueue.add('memory_decay', body, {
        ...defaultJobOptions,
        priority: JobPriority.LOW,
      });
      return { jobId: job.id, status: 'queued' };
    }
    return this.portability.runDecay(body.projectId);
  }
}
