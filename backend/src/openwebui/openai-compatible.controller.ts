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
      conversationId = await this.resolveOrCreateConversation(projectId, body.messages);
    }

    await this.conversations.addMessage(conversationId, 'user', userMessage);

    const completionId = `chatcmpl-${Date.now()}`;
    const modelName = body.model || logicalModel.id;

    if (body.stream) {
      this.stream.startStream(res, completionId, modelName);

      // Everything written to the SSE stream is also accumulated here so we
      // persist exactly what the user saw — as a single assistant message
      // (continuity relies on one message per turn, not fragmented rows).
      let streamed = '';
      const push = (text: string) => {
        if (!text) return;
        streamed += text;
        this.stream.writeContent(res, completionId, modelName, text);
      };

      let result: Awaited<
        ReturnType<CognitiveOrchestratorService['processMessage']>
      >;
      try {
        result = await this.orchestrator.processMessage({
          conversationId,
          projectId,
          message: userMessage,
          userId: body.user,
          // Surface text/tool activity as it happens (delta.content markdown).
          onEvent: (event) => {
            switch (event.type) {
              case 'text':
                push(event.content);
                break;
              case 'tool_call':
                push(`\n\n> 🔧 \`${event.tool}(${this.formatArgsShort(event.args)})\`\n\n`);
                break;
              case 'tool_result':
                // Success is implicit in the text that follows; only call out failures.
                if (!event.success) push(`\n> ✗ ${event.summary}\n\n`);
                break;
              case 'pending_approval':
                push(`\n\n${event.message}`);
                break;
            }
          },
        });
      } catch (error) {
        // Loop blew up mid-stream: surface a short note, persist whatever ran,
        // and always close the SSE connection so the client isn't left hanging.
        push('\n\n⚠️ Ocorreu um erro ao processar sua solicitação.');
        await this.conversations.addMessage(
          conversationId,
          'assistant',
          streamed.trim() || 'Erro ao processar a solicitação.',
        );
        this.stream.endStream(res, completionId, modelName);
        return;
      }

      // Non-native/simple path emits no events — stream the consolidated answer.
      if (!streamed.trim() && result.content) {
        push(result.content);
      }

      if (result.jobId) {
        push(`\n\n> Job em background criado: \`${result.jobId}\`\n`);
      }

      await this.conversations.addMessage(
        conversationId,
        'assistant',
        streamed.trim() || result.content,
      );
      this.stream.endStream(res, completionId, modelName);
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
        jobId: result.jobId,
        pendingApprovals: result.pendingApprovals,
        memorySuggestions: result.memorySuggestions,
      },
    });
  }

  /**
   * OpenAI-compatible clients (Open WebUI included) never send back a stable
   * conversation id — they just resend the full transcript in `body.messages`
   * on every turn. Without this, every turn would spawn a brand new, empty
   * conversation and the assistant would lose all prior context (the exact
   * "esqueceu tudo depois de uma resposta curta" symptom). We recover
   * continuity by matching on the first user message of the transcript
   * (stable across turns of the same chat), and backfill any prior turns the
   * client already has but we don't, so context isn't lost even the first
   * time we see an in-progress chat.
   */
  private async resolveOrCreateConversation(
    projectId: string,
    messages: OpenAiMessage[],
  ): Promise<string> {
    const firstUser = messages.find((m) => m.role === 'user');
    const firstContent = firstUser
      ? this.extractMessageContent(firstUser.content)
      : undefined;

    if (firstContent) {
      const existing = await this.conversations.findByFirstUserMessage(
        projectId,
        firstContent,
      );
      if (existing) return existing.id;
    }

    const conv = await this.conversations.create(
      projectId,
      (firstContent || 'Nova conversa').slice(0, 80),
    );

    // Backfill everything the client already has except the newest user
    // message — that one is added by the caller right after this returns.
    const priorTurns = messages.slice(0, -1);
    for (const m of priorTurns) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      const content = this.extractMessageContent(m.content);
      if (content.trim()) {
        await this.conversations.addMessage(conv.id, m.role, content);
      }
    }

    return conv.id;
  }

  /**
   * Compact one-line summary of tool args for the live stream — shows the 1-2
   * most relevant keys (path/query/command/...) truncated, so a big JSON blob
   * never floods the chat. Purely cosmetic (the full args still run normally).
   */
  private formatArgsShort(args: Record<string, unknown>): string {
    if (!args || typeof args !== 'object') return '';
    const priority = ['path', 'query', 'command', 'url', 'pattern', 'name', 'content'];
    const keys = Object.keys(args);
    const ordered = [
      ...priority.filter((k) => k in args),
      ...keys.filter((k) => !priority.includes(k)),
    ];
    const parts: string[] = [];
    for (const key of ordered.slice(0, 2)) {
      const raw = args[key];
      let value = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (value && value.length > 60) value = `${value.slice(0, 57)}...`;
      parts.push(`${key}=${value}`);
    }
    return parts.join(', ');
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
