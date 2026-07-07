import { Injectable } from '@nestjs/common';
import { EventService } from '../orchestrator/event.service';

@Injectable()
export class JobEventService {
  constructor(private readonly events: EventService) {}

  async created(
    jobId: string,
    projectId: string,
    conversationId: string | undefined,
    type: string,
  ) {
    return this.events.emit('task.created', projectId, conversationId, {
      jobId,
      type,
      status: 'pending',
    });
  }

  async started(
    jobId: string,
    projectId: string,
    conversationId: string | undefined,
    type: string,
    message?: string,
  ) {
    return this.events.emit('task.started', projectId, conversationId, {
      jobId,
      type,
      status: 'running',
      message: message || 'Job iniciado',
    });
  }

  async progress(
    jobId: string,
    projectId: string,
    conversationId: string | undefined,
    type: string,
    progress: number,
    message: string,
  ) {
    return this.events.emit('task.progress', projectId, conversationId, {
      jobId,
      type,
      status: 'running',
      progress,
      message,
    });
  }

  async completed(
    jobId: string,
    projectId: string,
    conversationId: string | undefined,
    type: string,
    result?: unknown,
  ) {
    return this.events.emit('task.completed', projectId, conversationId, {
      jobId,
      type,
      status: 'completed',
      result,
    });
  }

  async failed(
    jobId: string,
    projectId: string,
    conversationId: string | undefined,
    type: string,
    error: unknown,
  ) {
    return this.events.emit('task.failed', projectId, conversationId, {
      jobId,
      type,
      status: 'failed',
      error,
    });
  }
}
