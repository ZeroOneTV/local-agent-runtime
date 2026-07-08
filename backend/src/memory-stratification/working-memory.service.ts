import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkingMemoryState } from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<'OK'>;
};

@Injectable()
export class WorkingMemoryService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkingMemoryService.name);
  private client: RedisClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly memConfig: MemoryStratificationConfigService,
  ) {}

  private async getClient(): Promise<RedisClient> {
    if (this.client) return this.client;
    const { default: Redis } = await import('ioredis');
    const url = this.config.get<string>('redis.url') ?? 'redis://redis:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: 1 });
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  private conversationKey(conversationId: string) {
    return `working_memory:conversation:${conversationId}`;
  }

  private projectKey(projectId: string) {
    return `working_memory:project:${projectId}`;
  }

  async getConversationState(conversationId: string): Promise<WorkingMemoryState | null> {
    try {
      const client = await this.getClient();
      const raw = await client.get(this.conversationKey(conversationId));
      return raw ? (JSON.parse(raw) as WorkingMemoryState) : null;
    } catch (err) {
      this.logger.warn(`Working memory read failed: ${(err as Error).message}`);
      return null;
    }
  }

  async getProjectState(projectId: string): Promise<WorkingMemoryState | null> {
    try {
      const client = await this.getClient();
      const raw = await client.get(this.projectKey(projectId));
      return raw ? (JSON.parse(raw) as WorkingMemoryState) : null;
    } catch {
      return null;
    }
  }

  async updateConversation(
    conversationId: string,
    patch: Partial<WorkingMemoryState>,
  ): Promise<WorkingMemoryState> {
    const current = (await this.getConversationState(conversationId)) ?? {
      updatedAt: new Date().toISOString(),
    };
    const next: WorkingMemoryState = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.save(this.conversationKey(conversationId), next, this.memConfig.workingTtlHours * 3600);
    return next;
  }

  async updateProject(
    projectId: string,
    patch: Partial<WorkingMemoryState>,
  ): Promise<WorkingMemoryState> {
    const current = (await this.getProjectState(projectId)) ?? {
      updatedAt: new Date().toISOString(),
    };
    const next: WorkingMemoryState = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.save(
      this.projectKey(projectId),
      next,
      this.memConfig.workingProjectTtlDays * 86400,
    );
    return next;
  }

  async clearConversation(conversationId: string) {
    try {
      const client = await this.getClient();
      await client.del(this.conversationKey(conversationId));
    } catch {
      // ignore
    }
  }

  formatForContext(state: WorkingMemoryState | null): string | null {
    if (!state) return null;
    const parts: string[] = [];
    if (state.currentGoal) parts.push(`Objetivo atual: ${state.currentGoal}`);
    if (state.activePlan) {
      parts.push(`Plano: ${state.activePlan.objective}`);
      if (state.activePlan.steps.length) {
        parts.push(state.activePlan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
      }
    }
    if (state.activeFiles?.length) {
      parts.push(`Arquivos em foco: ${state.activeFiles.join(', ')}`);
    }
    if (state.activeJobId) parts.push(`Job ativo: ${state.activeJobId}`);
    if (state.pendingApprovals?.length) {
      parts.push(`Aprovações pendentes: ${state.pendingApprovals.join('; ')}`);
    }
    if (state.temporaryFindings?.length) {
      parts.push(`Descobertas recentes:\n- ${state.temporaryFindings.join('\n- ')}`);
    }
    if (state.lastError) parts.push(`Último erro: ${state.lastError}`);
    return parts.length ? parts.join('\n') : null;
  }

  private async save(key: string, state: WorkingMemoryState, ttlSeconds: number) {
    const client = await this.getClient();
    await client.set(key, JSON.stringify(state), 'EX', ttlSeconds);
  }
}
