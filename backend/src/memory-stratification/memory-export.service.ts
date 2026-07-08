import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  ExportManifest,
  ExportProfile,
  slugifyProjectName,
  WorkingMemoryState,
} from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import { MemoryCompatibilityService } from './memory-compatibility.service';
import { MemoryValidationService } from './memory-validation.service';
import { WorkingMemoryService } from './working-memory.service';

const execFileAsync = promisify(execFile);

export interface ExportRequest {
  projectId: string;
  profile?: ExportProfile;
  includeArtifacts?: boolean;
  includeMedia?: boolean;
  includeFullConversations?: boolean;
  includeAuditLogs?: boolean;
  includeWorkingMemory?: boolean;
}

@Injectable()
export class MemoryExportService {
  private readonly logger = new Logger(MemoryExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MemoryStratificationConfigService,
    private readonly appConfig: ConfigService,
    private readonly compatibility: MemoryCompatibilityService,
    private readonly validation: MemoryValidationService,
    private readonly working: WorkingMemoryService,
  ) {}

  async export(request: ExportRequest) {
    const profile = request.profile ?? (this.config.exportDefaultProfile as ExportProfile);
    const project = await this.prisma.project.findUnique({
      where: { id: request.projectId },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');

    const record = await this.prisma.memoryPortabilityRecord.create({
      data: {
        projectId: project.id,
        recordType: 'export',
        profile,
        status: 'running',
      },
    });

    try {
      const slug = slugifyProjectName(project.name);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const workDir = path.join(this.config.tempPath, record.id);
      const zipName = `memory-export-${slug}-${timestamp}.zip`;
      const zipPath = path.join(this.config.exportsPath, zipName);

      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(this.config.exportsPath, { recursive: true });

      const included = this.resolveIncluded(profile, request);
      const chunking = this.compatibility.getChunkConfig();
      const manifest: ExportManifest = {
        exportFormatVersion: '1.0.0',
        project: { id: project.id, name: project.name, slug },
        createdAt: new Date().toISOString(),
        source: {
          appVersion: '0.1.0',
          schemaVersion: '20240707080000',
          machine: process.env.HOSTNAME ?? 'local',
        },
        models: {
          llm: {
            provider: this.appConfig.get<string>('llm.provider') ?? 'ollama',
            model: this.appConfig.get<string>('llm.model') ?? 'unknown',
          },
          embedding: {
            provider: 'ollama',
            model: this.compatibility.getCurrentEmbeddingModel(),
          },
        },
        chunking,
        included,
        compatibility: {
          requiresReembedding: false,
          portableAcrossModels: true,
        },
        encryption: { enabled: false, algorithm: null },
      };

      await this.writeJsonl(
        path.join(workDir, 'memories.jsonl'),
        included.consolidatedMemory
          ? await this.prisma.memory.findMany({ where: { projectId: project.id, active: true } })
          : [],
      );

      await this.writeJsonl(
        path.join(workDir, 'recent_memory.jsonl'),
        included.recentMemory
          ? await this.prisma.recentMemoryItem.findMany({ where: { projectId: project.id } })
          : [],
      );

      await this.writeJsonl(
        path.join(workDir, 'deep_memory.jsonl'),
        included.deepMemory
          ? await this.prisma.deepMemoryItem.findMany({ where: { projectId: project.id } })
          : [],
      );

      await this.writeJsonl(
        path.join(workDir, 'conversation_summaries.jsonl'),
        included.conversationSummaries
          ? await this.prisma.conversationSummary.findMany({
              where: { conversation: { projectId: project.id } },
            })
          : [],
      );

      await fs.writeFile(
        path.join(workDir, 'project.json'),
        JSON.stringify(
          {
            id: project.id,
            name: project.name,
            description: project.description,
            rootPath: project.rootPath,
            executionMode: project.executionMode,
          },
          null,
          2,
        ),
      );

      if (included.ragMetadata) {
        const files = await this.prisma.file.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: {
            id: true,
            path: true,
            filename: true,
            documentType: true,
            hash: true,
            embeddingModel: true,
            chunkConfigHash: true,
          },
        });
        await fs.writeFile(
          path.join(workDir, 'rag_manifest.json'),
          JSON.stringify({ files }, null, 2),
        );
      }

      if (included.mediaContexts) {
        const media = await this.prisma.mediaAsset.findMany({
          where: { projectId: project.id },
          include: { processingResults: { take: 1, orderBy: { createdAt: 'desc' } } },
        });
        await fs.writeFile(
          path.join(workDir, 'media_manifest.json'),
          JSON.stringify({ media }, null, 2),
        );
      }

      if (included.workingMemory && request.includeWorkingMemory) {
        const conversations = await this.prisma.conversation.findMany({
          where: { projectId: project.id },
          select: { id: true },
        });
        const snapshots: { conversationId: string; state: WorkingMemoryState }[] = [];
        for (const c of conversations.slice(0, 20)) {
          const state = await this.working.getConversationState(c.id);
          if (state) snapshots.push({ conversationId: c.id, state });
        }
        await fs.writeFile(
          path.join(workDir, 'working_memory_snapshot.json'),
          JSON.stringify(snapshots, null, 2),
        );
      }

      if (request.includeArtifacts ?? included.artifacts) {
        await this.copyArtifacts(workDir, project.id);
      }

      await fs.writeFile(path.join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      const checksums = await this.buildChecksums(workDir);
      await fs.writeFile(
        path.join(workDir, 'checksums.json'),
        JSON.stringify(checksums, null, 2),
      );

      await this.createZip(workDir, zipPath);
      const stat = await fs.stat(zipPath);
      this.validation.assertZipSize(stat.size);

      const updated = await this.prisma.memoryPortabilityRecord.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          filePath: zipPath,
          manifest: manifest as object,
          completedAt: new Date(),
          report: { sizeBytes: stat.size, profile },
        },
      });

      await fs.rm(workDir, { recursive: true, force: true });
      this.logger.log(`Export completed: ${zipPath}`);

      return {
        exportId: updated.id,
        status: updated.status,
        path: zipPath,
        manifest,
      };
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
    }
  }

  async listExports(projectId?: string) {
    return this.prisma.memoryPortabilityRecord.findMany({
      where: {
        recordType: 'export',
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getExport(id: string) {
    const record = await this.prisma.memoryPortabilityRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Export não encontrado');
    return record;
  }

  async deleteExport(id: string) {
    const record = await this.getExport(id);
    if (record.filePath) {
      try {
        await fs.unlink(record.filePath);
      } catch {
        // ignore
      }
    }
    await this.prisma.memoryPortabilityRecord.delete({ where: { id } });
    return { deleted: true };
  }

  private resolveIncluded(profile: ExportProfile, request: ExportRequest) {
    const base = {
      workingMemory: false,
      recentMemory: false,
      consolidatedMemory: true,
      deepMemory: false,
      conversationSummaries: false,
      ragMetadata: false,
      mediaContexts: false,
      artifacts: false,
      fullConversations: request.includeFullConversations ?? false,
      auditLogs: request.includeAuditLogs ?? this.config.exportIncludeAudit,
    };

    if (profile === 'minimal') return base;

    if (profile === 'portable') {
      return {
        ...base,
        recentMemory: true,
        deepMemory: true,
        conversationSummaries: true,
        ragMetadata: true,
        mediaContexts: request.includeMedia ?? true,
        artifacts: request.includeArtifacts ?? true,
      };
    }

    return {
      ...base,
      recentMemory: true,
      deepMemory: true,
      conversationSummaries: true,
      ragMetadata: true,
      mediaContexts: true,
      artifacts: true,
      fullConversations: request.includeFullConversations ?? true,
    };
  }

  private async writeJsonl(filePath: string, rows: unknown[]) {
    const content = rows.map((r) => JSON.stringify(r)).join('\n');
    await fs.writeFile(filePath, content + (content ? '\n' : ''), 'utf8');
  }

  private async buildChecksums(dir: string): Promise<Record<string, string>> {
    const checksums: Record<string, string> = {};
    const files = await this.listFilesRecursive(dir);
    for (const file of files) {
      const rel = path.relative(dir, file);
      if (rel === 'checksums.json') continue;
      const hash = await this.validation.sha256File(file);
      checksums[rel] = `sha256:${hash}`;
    }
    return checksums;
  }

  private async listFilesRecursive(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await this.listFilesRecursive(full)));
      else files.push(full);
    }
    return files;
  }

  private async copyArtifacts(workDir: string, projectId: string) {
    const artifactsRoot = this.appConfig.get<string>('storage.artifacts') ?? '/storage/artifacts';
    const dest = path.join(workDir, 'artifacts');
    await fs.mkdir(dest, { recursive: true });

    const auditLogs = await this.prisma.toolAuditLog.findMany({
      where: { projectId },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    await fs.writeFile(
      path.join(dest, 'tool_audit_index.json'),
      JSON.stringify(auditLogs, null, 2),
    );

    try {
      const entries = await fs.readdir(artifactsRoot);
      for (const entry of entries.slice(0, 200)) {
        const src = path.join(artifactsRoot, entry);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
          await fs.copyFile(src, path.join(dest, entry));
        }
      }
    } catch {
      // artifacts dir may be empty
    }
  }

  private async createZip(sourceDir: string, zipPath: string) {
    try {
      await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: sourceDir });
    } catch {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip();
      const files = await this.listFilesRecursive(sourceDir);
      for (const file of files) {
        const rel = path.relative(sourceDir, file);
        const data = await fs.readFile(file);
        zip.addFile(rel, data);
      }
      zip.writeZip(zipPath);
    }
  }
}
