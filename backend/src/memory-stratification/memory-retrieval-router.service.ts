import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkingMemoryService } from './working-memory.service';
import { RecentMemoryService } from './recent-memory.service';
import { ConsolidatedMemoryService } from './consolidated-memory.service';
import { DeepMemoryService } from './deep-memory.service';
import { ArchiveService } from './archive.service';
import {
  MemoryLayer,
  MemoryRetrievalInput,
  MemoryRetrievalResult,
  RetrievedMemoryItem,
  shouldSearchDeepMemory,
} from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

@Injectable()
export class MemoryRetrievalRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly working: WorkingMemoryService,
    private readonly recent: RecentMemoryService,
    private readonly consolidated: ConsolidatedMemoryService,
    private readonly deep: DeepMemoryService,
    private readonly archive: ArchiveService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async retrieve(input: MemoryRetrievalInput): Promise<MemoryRetrievalResult> {
    const searchedLayers: MemoryLayer[] = ['working', 'recent', 'consolidated'];
    const skippedLayers: MemoryLayer[] = [];
    let reason = 'Standard retrieval';

    const workingState = input.conversationId
      ? await this.working.getConversationState(input.conversationId)
      : null;
    const workingContent = this.working.formatForContext(workingState);
    const working: RetrievedMemoryItem[] = workingContent
      ? [
          {
            id: input.conversationId ?? 'working',
            layer: 'working',
            title: 'Estado ativo',
            content: workingContent,
            score: 1,
          },
        ]
      : [];

    const [recentItems, consolidatedItems] = await Promise.all([
      this.recent.search(
        input.projectId,
        input.query,
        this.config.maxRecent,
        input.conversationId,
      ),
      this.consolidated.search(
        input.projectId,
        input.query,
        this.config.maxConsolidated,
      ),
    ]);

    let deepItems: RetrievedMemoryItem[] = [];
    const needsDeep =
      this.config.enableDeepRetrieval &&
      (shouldSearchDeepMemory(input.query, input.intent) ||
        (consolidatedItems.length === 0 && recentItems.length === 0));

    if (needsDeep) {
      searchedLayers.push('deep');
      reason = 'Historical or fallback deep lookup';
      deepItems = await this.deep.search(
        input.projectId,
        input.query,
        this.config.maxDeep,
      );
    } else {
      skippedLayers.push('deep');
    }

    let archiveItems: RetrievedMemoryItem[] = [];
    if (this.config.enableArchiveRetrieval) {
      searchedLayers.push('archive');
      archiveItems = await this.archive.search(input.projectId, input.query, 2);
    } else {
      skippedLayers.push('archive');
    }

    await this.logAccess(input, [
      ...working,
      ...recentItems,
      ...consolidatedItems,
      ...deepItems,
      ...archiveItems,
    ]);

    for (const item of recentItems) await this.recent.markAccessed(item.id);
    for (const item of consolidatedItems) await this.consolidated.markAccessed(item.id);
    for (const item of deepItems) await this.deep.markAccessed(item.id);

    return {
      working,
      recent: recentItems,
      consolidated: consolidatedItems,
      deep: deepItems,
      archive: archiveItems,
      metadata: { searchedLayers, skippedLayers, reason },
    };
  }

  formatLayersForContext(result: MemoryRetrievalResult): {
    working: string | null;
    recent: string | null;
    consolidated: string | null;
    deep: string | null;
  } {
    const fmt = (items: RetrievedMemoryItem[]) =>
      items.length
        ? items.map((i) => `[${i.layer}] ${i.title}: ${i.content}`).join('\n')
        : null;

    return {
      working: fmt(result.working),
      recent: fmt(result.recent),
      consolidated: fmt(result.consolidated),
      deep: fmt(result.deep),
    };
  }

  private async logAccess(input: MemoryRetrievalInput, items: RetrievedMemoryItem[]) {
    if (!items.length) return;
    await this.prisma.memoryAccessLog.createMany({
      data: items.slice(0, 20).map((item) => ({
        projectId: input.projectId,
        conversationId: input.conversationId,
        memoryLayer: item.layer,
        memoryRefId: item.id,
        query: input.query.slice(0, 500),
        score: item.score,
        reason: input.intent,
      })),
    });
  }
}
