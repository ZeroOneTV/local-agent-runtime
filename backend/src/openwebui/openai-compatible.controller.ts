import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CognitiveOrchestratorService } from '../orchestrator/cognitive-orchestrator.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LogicalModelsService } from './logical-models.service';
import { OpenAiStreamService } from './openai-stream.service';
import { OpenAiAuthGuard } from './openai-auth.guard';

interface OpenAiMessage {
  role: string;
  content: string | { type: string; text?: string; file_id?: string }[];
}

@Controller('v1')
@UseGuards(OpenAiAuthGuard)
export class OpenAiCompatibleController {
  constructor(
    private readonly orchestrator: CognitiveOrchestratorService,
    private readonly conversations: ConversationsService,
    private readonly models: LogicalModelsService,
    private readonly stream: OpenAiStreamService,
  ) {}

  @Get('models')
  listModels() {
    return this.models.listOpenAiModels();
  }

  @Post('chat/completions')
  async chatCompletions(
    @Body()
    body: {
      model?: string;
      messages: OpenAiMessage[];
      stream?: boolean;
      conversation_id?: string;
      project_id?: string;
      user?: string;
    },
    @Res() res: Response,
    @Req() req: { openwebuiApiKey?: string },
    @Headers('authorization') authorization?: string,
    @Headers('x-conversation-id') headerConversationId?: string,
    @Headers('x-project-id') headerProjectId?: string,
  ) {
    const apiKey = this.extractApiKey(authorization, req?.openwebuiApiKey);
    const logicalModel = this.models.resolveModel(body.model);
    const projectId =
      body.project_id ||
      headerProjectId ||
      this.models.resolveProjectId(body.model, apiKey);

    const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      return res.status(400).json({
        error: { message: 'Nenhuma mensagem de usuário', type: 'invalid_request_error' },
      });
    }

    const userMessage = this.extractMessageContent(lastUser.content);
    let conversationId = body.conversation_id || headerConversationId;

    if (!conversationId) {
      const conv = await this.conversations.create(projectId, userMessage.slice(0, 80));
      conversationId = conv.id;
    }

    await this.conversations.addMessage(conversationId, 'user', userMessage);

    const completionId = `chatcmpl-${Date.now()}`;
    const modelName = body.model || logicalModel.id;

    if (body.stream) {
      this.stream.startStream(res, completionId, modelName);
      this.stream.writeStatus(res, completionId, modelName, 'Iniciando orquestrador cognitivo');

      const result = await this.orchestrator.processMessage({
        conversationId,
        projectId,
        message: userMessage,
        userId: body.user,
      });

      if (result.plan) {
        this.stream.writeStatus(
          res,
          completionId,
          modelName,
          `Plano: ${result.plan.objective}`,
        );
      }

      if (result.cycles.length) {
        this.stream.writeStatus(
          res,
          completionId,
          modelName,
          `Tools executadas: ${result.cycles.flatMap((c) => c.toolResults.map((t) => t.tool)).join(', ')}`,
        );
      }

      if (result.pendingApprovals.length) {
        this.stream.writeStatus(
          res,
          completionId,
          modelName,
          `${result.pendingApprovals.length} aprovação(ões) pendente(s)`,
        );
      }

      await this.conversations.addMessage(conversationId, 'assistant', result.content);
      this.stream.streamText(res, completionId, modelName, result.content);
      return;
    }

    const result = await this.orchestrator.processMessage({
      conversationId,
      projectId,
      message: userMessage,
      userId: body.user,
    });

    await this.conversations.addMessage(conversationId, 'assistant', result.content);

    res.json({
      id: completionId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: 'stop',
        },
      ],
      conversation_id: conversationId,
      project_id: projectId,
      orchestrator: {
        intent: result.intent.intent,
        flow: result.intent.flow,
        plan: result.plan?.objective,
        jobId: result.jobId,
        pendingApprovals: result.pendingApprovals,
        memorySuggestions: result.memorySuggestions,
      },
    });
  }

  private extractApiKey(authorization?: string, fromGuard?: string): string | undefined {
    if (fromGuard) return fromGuard;
    if (!authorization) return undefined;
    return authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
  }

  private extractMessageContent(
    content: string | { type: string; text?: string }[],
  ): string {
    if (typeof content === 'string') return content;
    return content
      .map((part) => {
        if (part.type === 'text' && part.text) return part.text;
        if (part.type === 'file') return `[arquivo anexado: ${(part as { file_id?: string }).file_id}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
}
