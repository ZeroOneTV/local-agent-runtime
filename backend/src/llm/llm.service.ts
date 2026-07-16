import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { TOOL_USE_PROMPT } from './prompts/tool-use.prompt';
import type { OllamaToolSpec } from '../tools/tools.types';

export interface LlmToolCall {
  /** Present when the model/runtime assigns an id (Ollama may omit it). */
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Assistant messages may carry structured tool calls (native function-calling). */
  tool_calls?: LlmToolCall[];
  /** For role: 'tool' — the id/name of the call this result answers. */
  tool_call_id?: string;
  name?: string;
}

export interface LlmChatOptions {
  systemContent?: string;
  tools?: OllamaToolSpec[];
}

export interface LlmResponse {
  content: string;
  model: string;
  done: boolean;
  toolCalls?: LlmToolCall[];
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('llm.baseUrl') || 'http://host.docker.internal:11434';
  }

  private get model(): string {
    return this.config.get<string>('llm.model') || 'qwen3:14b';
  }

  buildDefaultSystemContent(): string {
    return [SYSTEM_PROMPT, TOOL_USE_PROMPT].join('\n\n');
  }

  buildPrompt(messages: ChatMessage[]): ChatMessage[] {
    return [
      { role: 'system', content: this.buildDefaultSystemContent() },
      ...messages,
    ];
  }

  private get timeoutMs(): number {
    return this.config.get<number>('llm.timeoutMs') ?? 120000;
  }

  async chat(
    messages: ChatMessage[],
    options?: string | LlmChatOptions,
  ): Promise<LlmResponse> {
    const opts: LlmChatOptions =
      typeof options === 'string' ? { systemContent: options } : options ?? {};

    const prompt: ChatMessage[] = opts.systemContent
      ? [{ role: 'system', content: opts.systemContent }, ...messages]
      : this.buildPrompt(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      messages: prompt,
      stream: false,
    };
    if (opts.tools?.length) {
      body.tools = opts.tools;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LLM error: ${response.status} - ${errorText}`);
        throw new Error(`LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        content: data.message?.content || '',
        model: data.model || this.model,
        done: data.done ?? true,
        toolCalls: this.parseToolCalls(data.message?.tool_calls),
      };
    } catch (error) {
      this.logger.error(`Failed to reach LLM at ${this.baseUrl}`, error);
      throw error;
    }
  }

  private parseToolCalls(raw: unknown): LlmToolCall[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    const calls: LlmToolCall[] = [];
    for (const item of raw) {
      const fn = (item as { function?: { name?: string; arguments?: unknown } })
        .function;
      if (!fn?.name) continue;
      let args: Record<string, unknown> = {};
      if (typeof fn.arguments === 'string') {
        try {
          args = JSON.parse(fn.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
      } else if (fn.arguments && typeof fn.arguments === 'object') {
        args = fn.arguments as Record<string, unknown>;
      }
      calls.push({
        id: (item as { id?: string }).id,
        function: { name: fn.name, arguments: args },
      });
    }
    return calls.length ? calls : undefined;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
