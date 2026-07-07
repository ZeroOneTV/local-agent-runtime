import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EventService } from './event.service';
import { CognitiveOrchestratorService } from './cognitive-orchestrator.service';
import { DEFAULT_PROJECT_ID } from '../common/constants';
import { ConversationsService } from '../conversations/conversations.service';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(
    private readonly orchestrator: CognitiveOrchestratorService,
    private readonly events: EventService,
    private readonly conversations: ConversationsService,
  ) {}

  @Post('chat')
  async chat(
    @Body()
    body: {
      conversationId?: string;
      projectId?: string;
      message: string;
      userId?: string;
      debug?: boolean;
    },
  ) {
    const projectId = body.projectId || DEFAULT_PROJECT_ID;

    let conversationId = body.conversationId;
    if (!conversationId) {
      const conv = await this.conversations.create(projectId, body.message.slice(0, 50));
      conversationId = conv.id;
    }

    await this.conversations.addMessage(conversationId, 'user', body.message);

    const result = await this.orchestrator.processMessage({
      conversationId,
      projectId,
      message: body.message,
      userId: body.userId,
      debug: body.debug,
    });

    const assistantMessage = await this.conversations.addMessage(
      conversationId,
      'assistant',
      result.content,
    );

    return {
      conversationId,
      message: assistantMessage,
      model: result.model,
      orchestrator: {
        intent: result.intent,
        plan: result.plan,
        cycles: result.cycles,
        pendingApprovals: result.pendingApprovals,
        memorySuggestions: result.memorySuggestions,
        jobId: result.jobId,
        events: result.events,
        debug: result.debug,
      },
      context: result.contextMetadata,
    };
  }

  @Get('events/conversation/:conversationId')
  eventsByConversation(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.findByConversation(
      conversationId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('events/project/:projectId')
  eventsByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.findByProject(projectId, limit ? parseInt(limit, 10) : 50);
  }
}

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly events: EventService) {}

  @Post('events')
  receiveEvent(
    @Body()
    body: {
      type: string;
      projectId: string;
      conversationId?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.events.emit(
      body.type as Parameters<EventService['emit']>[0],
      body.projectId,
      body.conversationId,
      body.payload,
    );
  }
}
