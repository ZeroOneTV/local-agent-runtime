import { Injectable, Logger } from '@nestjs/common';
import { EventService } from '../orchestrator/event.service';

export type MediaEventType =
  | 'media.uploaded'
  | 'media.processing.started'
  | 'media.processing.progress'
  | 'media.processing.completed'
  | 'media.processing.failed'
  | 'media.indexing.pending_approval'
  | 'media.indexed';

@Injectable()
export class MediaEventService {
  private readonly logger = new Logger(MediaEventService.name);

  constructor(private readonly events: EventService) {}

  async emit(
    type: MediaEventType,
    projectId: string,
    conversationId: string | undefined,
    payload: Record<string, unknown>,
  ) {
    try {
      await this.events.emit(type, projectId, conversationId, payload);
    } catch (error) {
      this.logger.warn(`Falha ao emitir evento ${type}`, error);
    }
  }
}
