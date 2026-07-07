import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { IndexingService } from '../rag/indexing.service';
import { ProjectInspectService } from '../tools/services/project.service';
import { RetrievalService } from '../rag/retrieval.service';
import { LlmService } from '../llm/llm.service';
import { JobEventService } from './job-event.service';
import {
  JobType,
  OrchestratorJobPayload,
  ProjectAnalysisResult,
  ProjectIndexingResult,
} from './job.types';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  'coverage',
  '.cursor',
  'storage',
]);
const INDEXABLE_EXT = new Set([
  '.md',
  '.txt',
  '.ts',
  '.js',
  '.json',
  '.yaml',
  '.yml',
  '.prisma',
  '.sql',
  '.env.example',
]);

@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly indexing: IndexingService,
    private readonly projectTools: ProjectInspectService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
    private readonly jobEvents: JobEventService,
  ) {}

  async run(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || !job.projectId) {
      throw new Error(`Job ${jobId} não encontrado`);
    }

    const payload = (job.payload ?? {}) as OrchestratorJobPayload;
    const type = this.normalizeType(job.type);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });

    await this.jobEvents.started(
      jobId,
      job.projectId,
      payload.conversationId,
      type,
      `Executando job ${type}`,
    );

    try {
      let result: unknown;

      switch (type) {
        case 'project_indexing':
          result = await this.runProjectIndexing(jobId, job.projectId, payload);
          break;
        case 'project_analysis':
          result = await this.runProjectAnalysis(jobId, job.projectId, payload);
          break;
        case 'rag_reindex':
          result = await this.runRagReindex(jobId, job.projectId, payload);
          break;
        default:
          throw new Error(`Tipo de job não implementado: ${type}`);
      }

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          result: result as object,
          finishedAt: new Date(),
        },
      });

      await this.jobEvents.completed(
        jobId,
        job.projectId,
        payload.conversationId,
        type,
        result,
      );
    } catch (error) {
      const errorPayload = {
        message: error instanceof Error ? error.message : String(error),
      };

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: errorPayload,
          finishedAt: new Date(),
        },
      });

      await this.jobEvents.failed(
        jobId,
        job.projectId,
        payload.conversationId,
        type,
        errorPayload,
      );

      throw error;
    }
  }

  private normalizeType(type: string): JobType {
    if (type === 'index_project') return 'project_indexing';
    return type as JobType;
  }

  private async resolveRootPath(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    return (
      project?.rootPath ||
      this.config.get<string>('storage.projects') ||
      '/workspace'
    );
  }

  private async runProjectIndexing(
    jobId: string,
    projectId: string,
    payload: OrchestratorJobPayload,
  ): Promise<ProjectIndexingResult> {
    const rootPath = await this.resolveRootPath(projectId);
    const files = await this.collectIndexableFiles(rootPath);

    let filesIndexed = 0;
    let chunksCreated = 0;
    let skippedUnchanged = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const filename = path.basename(filePath);

      await this.jobEvents.progress(
        jobId,
        projectId,
        payload.conversationId,
        'project_indexing',
        Math.round(((i + 1) / files.length) * 100),
        `Indexando ${filename} (${i + 1}/${files.length})`,
      );

      try {
        const result = await this.indexing.indexFromDisk({
          projectId,
          filePath,
          filename,
        });
        if (result.skipped) skippedUnchanged++;
        else filesIndexed++;
        chunksCreated += result.chunksCount ?? 0;
      } catch (error) {
        this.logger.warn(`Falha ao indexar ${filePath}: ${error}`);
      }
    }

    return {
      filesScanned: files.length,
      filesIndexed,
      chunksCreated,
      skippedUnchanged,
    };
  }

  private async runProjectAnalysis(
    jobId: string,
    projectId: string,
    payload: OrchestratorJobPayload,
  ): Promise<ProjectAnalysisResult> {
    const rootPath = await this.resolveRootPath(projectId);

    await this.jobEvents.progress(
      jobId,
      projectId,
      payload.conversationId,
      'project_analysis',
      20,
      'Inspecionando estrutura do projeto',
    );

    const structure = await this.projectTools.inspectStructure(rootPath, 2);
    const stack = await this.projectTools.detectStack(rootPath);

    await this.jobEvents.progress(
      jobId,
      projectId,
      payload.conversationId,
      'project_analysis',
      50,
      'Consultando RAG e memórias',
    );

    const query = payload.message || 'análise de arquitetura do projeto';
    const [memories, chunkResults] = await Promise.all([
      this.retrieval.searchRelevantMemories(projectId, query, 5),
      this.retrieval.searchRankedChunks(projectId, query, 5),
    ]);

    await this.jobEvents.progress(
      jobId,
      projectId,
      payload.conversationId,
      'project_analysis',
      75,
      'Gerando diagnóstico',
    );

    const contextParts = [
      `Estrutura:\n${JSON.stringify(structure.data, null, 2).slice(0, 2000)}`,
      `Stack:\n${JSON.stringify(stack.data, null, 2).slice(0, 1000)}`,
      `Memórias:\n${memories.map((m) => `${m.title}: ${m.content}`).join('\n')}`,
      `RAG:\n${chunkResults.map((c) => c.content).join('\n---\n')}`,
    ].join('\n\n');

    let summary: string;
    let partial = false;

    try {
      const response = await this.llm.chat(
        [{ role: 'user', content: `Analise o projeto:\n\n${contextParts}` }],
        'Você é um arquiteto de software. Produza diagnóstico em português com: resumo, pontos fortes, riscos, inconsistências e próximos passos.',
      );
      summary = response.content;
    } catch {
      partial = true;
      summary = [
        'Diagnóstico parcial (LLM indisponível).',
        `Estrutura detectada: ${structure.success ? 'OK' : 'erro'}`,
        `Stack detectada: ${stack.success ? JSON.stringify(stack.data) : 'indisponível'}`,
        `Memórias consultadas: ${memories.length}`,
        `Chunks RAG: ${chunkResults.length}`,
      ].join('\n');
    }

    return {
      summary,
      strengths: ['Orquestrador centralizado', 'RAG e memória integrados'],
      risks: partial ? ['LLM indisponível durante análise'] : ['Revisar dependências externas'],
      inconsistencies: [],
      nextSteps: ['Validar com LLM ativa', 'Revisar documentação em docs/'],
      partial,
    };
  }

  private async runRagReindex(
    jobId: string,
    projectId: string,
    payload: OrchestratorJobPayload,
  ): Promise<{ reindexed: number; skipped: number }> {
    await this.jobEvents.progress(
      jobId,
      projectId,
      payload.conversationId,
      'rag_reindex',
      30,
      'Reindexando arquivos do projeto',
    );

    const result = await this.indexing.reindexProject(projectId);

    await this.jobEvents.progress(
      jobId,
      projectId,
      payload.conversationId,
      'rag_reindex',
      90,
      'Reindexação concluída',
    );

    return result;
  }

  private async collectIndexableFiles(rootPath: string, maxFiles = 200): Promise<string[]> {
    const results: string[] = [];

    const walk = async (dir: string, depth: number) => {
      if (results.length >= maxFiles || depth > 8) return;

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxFiles) break;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (INDEXABLE_EXT.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    };

    await walk(rootPath, 0);
    return results;
  }
}
