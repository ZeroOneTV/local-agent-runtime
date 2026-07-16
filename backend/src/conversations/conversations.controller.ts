import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { DEFAULT_PROJECT_ID } from '../common/constants';
import { CognitiveOrchestratorService } from '../orchestrator/cognitive-orchestrator.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly orchestrator: CognitiveOrchestratorService,
  ) {}

  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string) {
    return this.conversations.findByProject(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversations.findOne(id);
  }

  @Post()
  create(@Body() body: { projectId: string; title?: string }) {
    return this.conversations.create(body.projectId, body.title);
  }

  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @Body() body: { message: string; projectId?: string; userId?: string; debug?: boolean },
  ) {
    const projectId = body.projectId || DEFAULT_PROJECT_ID;

    const conversation = await this.conversations.findOne(id);
    if (!conversation) {
      return { error: 'Conversa não encontrada' };
    }

    await this.conversations.addMessage(id, 'user', body.message);

    const result = await this.orchestrator.processMessage({
      conversationId: id,
      projectId,
      message: body.message,
      userId: body.userId,
      debug: body.debug,
    });

    const assistantMessage = await this.conversations.addMessage(
      id,
      'assistant',
      result.content,
    );

    return {
      message: assistantMessage,
      model: result.model,
      orchestrator: {
        intent: result.intent,
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
}
