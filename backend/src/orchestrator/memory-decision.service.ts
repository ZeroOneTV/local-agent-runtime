import { Injectable } from '@nestjs/common';
import { OrchestratorConfigService } from './orchestrator.config';
import { MemorySuggestion } from './orchestrator.types';

const MEMORY_PATTERNS = [
  {
    pattern: /(?:sempre|nunca|devemos|convém|padrão|arquitetura|utilizar)\s+(.{10,120})/i,
    importance: 4,
  },
  {
    pattern: /decisão(?:\s+arquitetural)?[:\s]+(.{10,120})/i,
    importance: 5,
  },
];

@Injectable()
export class MemoryDecisionService {
  constructor(private readonly config: OrchestratorConfigService) {}

  extractSuggestions(
    userMessage: string,
    assistantResponse: string,
  ): MemorySuggestion[] {
    if (!this.config.requireMemoryConfirmation) return [];

    const suggestions: MemorySuggestion[] = [];
    const combined = `${userMessage}\n${assistantResponse}`;

    for (const { pattern, importance } of MEMORY_PATTERNS) {
      const match = combined.match(pattern);
      if (match?.[1]) {
        const content = match[1].trim();
        if (this.isInvalidMemory(content)) continue;

        suggestions.push({
          title: content.slice(0, 60),
          content,
          importance,
          reason: 'Possível decisão permanente detectada no contexto',
        });
      }
    }

    if (/backend utiliza|stack.*é|banco.*é|framework.*é/i.test(combined)) {
      const match = combined.match(/((?:backend|stack|banco|framework)[^.]{5,80})/i);
      if (match && !this.isInvalidMemory(match[1])) {
        suggestions.push({
          title: 'Decisão técnica',
          content: match[1].trim(),
          importance: 4,
          reason: 'Referência a decisão técnica do projeto',
        });
      }
    }

    return suggestions.slice(0, 2);
  }

  formatSuggestionMessage(suggestion: MemorySuggestion): string {
    return [
      'Isso parece uma decisão permanente do projeto:',
      `"${suggestion.content}"`,
      '',
      'Deseja salvar como memória do projeto?',
    ].join('\n');
  }

  private isInvalidMemory(content: string): boolean {
    const invalid = [/usuário perguntou/i, /foi executada/i, /tool /i];
    return invalid.some((p) => p.test(content));
  }
}
