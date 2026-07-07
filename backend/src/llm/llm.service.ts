import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { TOOL_USE_PROMPT } from './prompts/tool-use.prompt';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  done: boolean;
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

  async chat(
    messages: ChatMessage[],
    systemContent?: string,
  ): Promise<LlmResponse> {
    const prompt: ChatMessage[] = systemContent
      ? [{ role: 'system', content: systemContent }, ...messages]
      : this.buildPrompt(messages);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: prompt,
          stream: false,
        }),
      });

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
      };
    } catch (error) {
      this.logger.error(`Failed to reach LLM at ${this.baseUrl}`, error);
      throw error;
    }
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
