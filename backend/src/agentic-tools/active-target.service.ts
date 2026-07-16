import { Injectable, Logger } from '@nestjs/common';
import { WorkingMemoryService } from '../memory-stratification/working-memory.service';
import {
  ActiveTarget,
  ActiveTargetSource,
  ActiveTargetType,
  PendingFsIntent,
} from '../memory-stratification/memory.types';

const FS_TARGET_TOOLS = new Set([
  'list_directory',
  'read_file',
  'search_files',
  'stat',
  'size_summary',
]);

@Injectable()
export class ActiveTargetService {
  private readonly logger = new Logger(ActiveTargetService.name);

  constructor(private readonly working: WorkingMemoryService) {}

  async get(conversationId: string): Promise<ActiveTarget | null> {
    const state = await this.working.getConversationState(conversationId);
    return state?.activeTarget ?? null;
  }

  async set(conversationId: string, target: ActiveTarget): Promise<ActiveTarget> {
    const next = { ...target, updatedAt: new Date().toISOString() };
    await this.working.updateConversation(conversationId, { activeTarget: next });
    this.logger.log(
      `activeTarget conversation=${conversationId} path=${next.path} op=${next.lastOperation || '-'}`,
    );
    return next;
  }

  async clear(conversationId: string): Promise<void> {
    await this.working.updateConversation(conversationId, { activeTarget: null });
  }

  async getPendingIntent(conversationId: string): Promise<PendingFsIntent | null> {
    const state = await this.working.getConversationState(conversationId);
    return state?.pendingFsIntent ?? null;
  }

  async setPendingIntent(
    conversationId: string,
    intent: Omit<PendingFsIntent, 'createdAt'>,
  ): Promise<void> {
    await this.working.updateConversation(conversationId, {
      pendingFsIntent: { ...intent, createdAt: new Date().toISOString() },
    });
    this.logger.log(
      `pendingFsIntent set conversation=${conversationId} tool=${intent.tool}`,
    );
  }

  async clearPendingIntent(conversationId: string): Promise<void> {
    await this.working.updateConversation(conversationId, { pendingFsIntent: null });
  }

  isFilesystemTool(toolName: string): boolean {
    return FS_TARGET_TOOLS.has(toolName);
  }

  buildFromTool(params: {
    toolName: string;
    path: string;
    label?: string;
    source?: ActiveTargetSource;
    knownFolder?: string;
    isFile?: boolean;
  }): ActiveTarget {
    const type: ActiveTargetType = params.isFile
      ? 'filesystem_file'
      : 'filesystem_directory';
    return {
      type,
      path: params.path,
      label: params.label || params.path,
      source: params.source || 'absolute',
      lastOperation: params.toolName,
      knownFolder: params.knownFolder,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Infer source from absolute path vs project root. */
  inferSource(resolvedPath: string, projectRoot?: string): ActiveTargetSource {
    if (!resolvedPath) return 'absolute';
    const norm = resolvedPath.replace(/\//g, '\\').toLowerCase();
    if (/^[a-z]:\\/.test(norm) || norm.startsWith('\\\\')) {
      return 'host_personal';
    }
    if (projectRoot) {
      const root = projectRoot.replace(/\//g, '\\').toLowerCase();
      if (norm === root || norm.startsWith(root + '\\') || norm.startsWith(root + '/')) {
        return 'project';
      }
    }
    if (norm.includes('storage\\projects') || norm.includes('/storage/projects')) {
      return 'project';
    }
    return 'absolute';
  }
}
