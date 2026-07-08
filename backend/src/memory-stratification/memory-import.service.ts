import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  ExportManifest,
  ImportMode,
  ImportReport,
  ImportValidationResult,
} from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import { MemoryValidationService } from './memory-validation.service';
import { MemoryCompatibilityService } from './memory-compatibility.service';
import { DeepMemoryService } from './deep-memory.service';

const execFileAsync = promisify(execFile);

export interface ImportRequest {
  filePath: string;
  mode?: ImportMode;
  targetProjectId?: string;
  reembed?: boolean;
  ownerId?: string;
}

@Injectable()
export class MemoryImportService {
  private readonly logger = new Logger(MemoryImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MemoryStratificationConfigService,
    private readonly validation: MemoryValidationService,
    private readonly compatibility: MemoryCompatibilityService,
    private readonly deep: DeepMemoryService,
    @InjectQueue('memory-jobs') private readonly memoryQueue: Queue,
  ) {}

  async validateImport(filePath: string): Promise<ImportValidationResult> {
    const extractDir = await this.extractZip(filePath);
    try {
      return await this.validation.validateZipExtract(extractDir);
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true });
    }
  }

  async import(request: ImportRequest): Promise<ImportReport> {
    const mode = request.mode ?? this.config.importDefaultMode;
    const stat = await fs.stat(request.filePath);
    this.validation.assertZipSize(stat.size);

    const record = await this.prisma.memoryPortabilityRecord.create({
      data: {
        projectId: request.targetProjectId,
        recordType: 'import',
        status: 'running',
        filePath: request.filePath,
      },
    });

    const extractDir = await this.extractZip(request.filePath, record.id);

    try {
      const validation = await this.validation.validateZipExtract(extractDir);
      if (!validation.valid && validation.conflicts.length) {
        throw new BadRequestException(
          `Import inválido: ${validation.conflicts.join('; ')}`,
        );
      }

      const manifestRaw = await fs.readFile(
        path.join(extractDir, 'manifest.json'),
        'utf8',
      );
      const manifest = JSON.parse(manifestRaw) as ExportManifest;
      const embedCheck = this.compatibility.checkEmbeddingCompatibility(manifest);
      const requiresReembedding =
        request.reembed ?? this.config.importAutoReembed
          ? embedCheck.requiresReembedding
          : false;

      const idMapping: Record<string, Record<string, string>> = {
        projects: {},
        memories: {},
        recent: {},
        deep: {},
      };

      let projectId = request.targetProjectId;
      const projectJson = JSON.parse(
        await fs.readFile(path.join(extractDir, 'project.json'), 'utf8'),
      );

      if (mode === 'new_project') {
        const ownerId =
          request.ownerId ??
          (await this.prisma.user.findFirst())?.id;
        if (!ownerId) throw new BadRequestException('Nenhum usuário para owner');

        const created = await this.prisma.project.create({
          data: {
            ownerId,
            name: `${projectJson.name} (importado)`,
            description: projectJson.description,
            rootPath: projectJson.rootPath,
            executionMode: projectJson.executionMode ?? 'developer',
          },
        });
        idMapping.projects[projectJson.id] = created.id;
        projectId = created.id;
      } else if (!projectId) {
        throw new BadRequestException('targetProjectId obrigatório para merge/replace');
      }

      if (mode === 'replace' && projectId) {
        await this.prisma.memory.updateMany({
          where: { projectId },
          data: { active: false },
        });
      }

      const conflicts: string[] = [];
      const warnings = [...validation.warnings];

      if (manifest.included.consolidatedMemory) {
        await this.importJsonl(
          path.join(extractDir, 'memories.jsonl'),
          async (row: Record<string, unknown>) => {
            const oldId = row.id as string;
            const existing = await this.prisma.memory.findFirst({
              where: {
                projectId: projectId!,
                active: true,
                OR: [
                  { title: row.title as string },
                  { content: row.content as string },
                ],
              },
            });

            if (existing && mode === 'merge') {
              if (existing.content !== row.content) {
                conflicts.push(`same_title_different_content:${row.title}`);
                return;
              }
              idMapping.memories[oldId] = existing.id;
              return;
            }

            const created = await this.prisma.memory.create({
              data: {
                projectId: projectId!,
                title: row.title as string,
                content: row.content as string,
                importance: (row.importance as number) ?? 3,
                origin: (row.origin as string) ?? 'export_import',
                sourceType: 'export_import',
                sourceRef: oldId,
                confidence: (row.confidence as number) ?? 1,
              },
            });
            idMapping.memories[oldId] = created.id;
          },
        );
      }

      if (manifest.included.recentMemory) {
        await this.importJsonl(
          path.join(extractDir, 'recent_memory.jsonl'),
          async (row: Record<string, unknown>) => {
            const oldId = row.id as string;
            const created = await this.prisma.recentMemoryItem.create({
              data: {
                projectId: projectId!,
                conversationId: null,
                title: row.title as string,
                content: row.content as string,
                summary: row.summary as string | undefined,
                sourceType: (row.sourceType as string) ?? 'export_import',
                sourceRef: oldId,
                importance: (row.importance as number) ?? 3,
                confidence: (row.confidence as number) ?? 0.7,
                status: 'active',
              },
            });
            idMapping.recent[oldId] = created.id;
          },
        );
      }

      if (manifest.included.deepMemory) {
        await this.importJsonl(
          path.join(extractDir, 'deep_memory.jsonl'),
          async (row: Record<string, unknown>) => {
            const oldId = row.id as string;
            const created = await this.prisma.deepMemoryItem.create({
              data: {
                projectId: projectId!,
                title: row.title as string,
                summary: row.summary as string | undefined,
                contentPreview: row.contentPreview as string | undefined,
                sourceType: 'export_import',
                sourceRef: oldId,
                artifactPath: row.artifactPath as string | undefined,
                contextPath: row.contextPath as string | undefined,
                documentType: row.documentType as string | undefined,
                tags: (row.tags as string[]) ?? [],
                importance: (row.importance as number) ?? 2,
                embeddingStatus: requiresReembedding
                  ? 'requires_reembedding'
                  : ((row.embeddingStatus as string) ?? 'not_indexed'),
                embeddingModel: manifest.models.embedding.model,
                chunkConfigHash: manifest.chunking.chunkConfigHash,
              },
            });
            idMapping.deep[oldId] = created.id;
          },
        );
      }

      if (manifest.included.conversationSummaries) {
        await this.importJsonl(
          path.join(extractDir, 'conversation_summaries.jsonl'),
          async () => {
            warnings.push('Summaries importados como deep memory metadata apenas');
          },
        );
      }

      await this.copyImportedArtifacts(extractDir, projectId!);

      const createdJobs: string[] = [];
      if (requiresReembedding && projectId) {
        const job = await this.prisma.job.create({
          data: {
            projectId,
            type: 'memory_reembedding',
            status: 'pending',
            payload: { reason: embedCheck.reason },
          },
        });
        await this.memoryQueue.add('memory_reembedding', { jobId: job.id, projectId });
        createdJobs.push(job.id);
        await this.deep.markRequiresReembedding(
          projectId,
          this.compatibility.getCurrentEmbeddingModel(),
        );
      }

      const report: ImportReport = {
        importId: record.id,
        status: 'completed',
        projectId,
        requiresReembedding,
        createdJobs,
        idMapping,
        warnings,
        conflicts,
      };

      await this.prisma.memoryPortabilityRecord.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          projectId,
          manifest: manifest as object,
          report: report as object,
          completedAt: new Date(),
        },
      });

      await fs.writeFile(
        path.join(this.config.reportsPath, `${record.id}.json`),
        JSON.stringify(report, null, 2),
      );

      this.logger.log(`Import completed for project ${projectId}`);
      return report;
    } catch (err) {
      await this.prisma.memoryPortabilityRecord.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          error: { message: (err as Error).message },
          completedAt: new Date(),
        },
      });
      throw err;
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true });
    }
  }

  private async extractZip(filePath: string, importId?: string): Promise<string> {
    const extractDir = path.join(
      this.config.importsPath,
      importId ?? cryptoRandom(),
    );
    await fs.mkdir(extractDir, { recursive: true });

    try {
      await execFileAsync('unzip', ['-q', filePath, '-d', extractDir]);
    } catch {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(filePath);
      zip.extractAllTo(extractDir, true);
    }

    return extractDir;
  }

  private async importJsonl(
    filePath: string,
    handler: (row: Record<string, unknown>) => Promise<void>,
  ) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      for (const line of lines) {
        await handler(JSON.parse(line));
      }
    } catch {
      // optional file
    }
  }

  private async copyImportedArtifacts(extractDir: string, projectId: string) {
    const src = path.join(extractDir, 'artifacts');
    const dest = path.join(
      this.config.storageRoot,
      'imports',
      projectId,
      'artifacts',
    );
    try {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src);
      for (const entry of entries) {
        const from = path.join(src, entry);
        if (!(await fs.stat(from)).isFile()) continue;
        await fs.copyFile(from, path.join(dest, entry));
      }
    } catch {
      // no artifacts
    }
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 12);
}
