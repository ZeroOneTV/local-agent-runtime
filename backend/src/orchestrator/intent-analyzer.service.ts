import { Injectable } from '@nestjs/common';
import {
  Complexity,
  FlowType,
  IntentAnalysis,
  IntentType,
  READONLY_AUTO_TOOLS,
} from './orchestrator.types';

@Injectable()
export class IntentAnalyzerService {
  analyze(message: string): IntentAnalysis {
    const lower = message.toLowerCase();

    const intent = this.classifyIntent(lower);
    const complexity = this.assessComplexity(lower, intent);
    const flow = this.selectFlow(intent, complexity);
    const needsPlan = this.needsPlan(intent, complexity, flow);
    const suggestedReadonlyTools = this.suggestTools(intent, lower);

    return {
      intent,
      complexity,
      flow,
      needsContext: flow !== 'direct',
      needsRag: this.needsRag(intent, lower),
      needsTools: suggestedReadonlyTools.length > 0 || this.needsWriteTools(intent),
      needsPlan,
      canAnswerDirectly: flow === 'direct',
      likelyRisk: this.assessRisk(intent),
      suggestedReadonlyTools,
    };
  }

  private classifyIntent(lower: string): IntentType {
    if (/indexar|indexe|indexação|reindex/.test(lower)) return 'project_indexing';
    if (/memória|lembrar|salvar regra|convenção/.test(lower)) return 'memory_operation';
    if (/refator|implementar|alterar|modificar|escrever arquivo|criar arquivo/.test(lower))
      return 'code_change';
    if (/erro|bug|falha|debug|corrigir/.test(lower)) return 'debug';
    if (/planej|próximos passos|roadmap|estratégia/.test(lower)) return 'planning';
    if (/arquitetura|estrutura|design|módulo|onde ficar/.test(lower))
      return 'architecture_discussion';
    if (/analis|revis|avali|verificar código|review/.test(lower)) return 'code_analysis';
    if (/listar|ler arquivo|buscar arquivo|abrir pasta/.test(lower)) return 'file_operation';
    if (/processar vídeo|processar pdf|tarefa longa|projeto inteiro/.test(lower))
      return 'long_running_task';
    if (/pesquis|buscar sobre|o que é|qual a diferença/.test(lower)) return 'research';
    if (/o que é|como funciona|faz sentido|diferença entre/.test(lower)) return 'question_answer';
    if (/projeto|código|arquivo|implement/.test(lower)) return 'code_analysis';
    return 'question_answer';
  }

  private assessComplexity(lower: string, intent: IntentType): Complexity {
    if (['long_running_task', 'project_indexing', 'code_change', 'planning'].includes(intent))
      return 'high';
    if (['code_analysis', 'architecture_discussion', 'debug'].includes(intent)) return 'medium';
    if (lower.length > 200) return 'medium';
    return 'low';
  }

  private selectFlow(intent: IntentType, complexity: Complexity): FlowType {
    if (['long_running_task', 'project_indexing'].includes(intent)) return 'long_job';
    if (intent === 'question_answer' && complexity === 'low') return 'direct';
    if (['code_change', 'planning', 'debug'].includes(intent) || complexity === 'high')
      return 'complex';
    if (
      ['code_analysis', 'architecture_discussion', 'file_operation', 'research'].includes(intent)
    )
      return 'project';
    return complexity === 'low' ? 'direct' : 'project';
  }

  private needsPlan(intent: IntentType, complexity: Complexity, flow: FlowType): boolean {
    if (flow === 'direct') return false;
    if (flow === 'complex' || flow === 'long_job') return true;
    return complexity !== 'low' && intent !== 'question_answer';
  }

  private needsRag(intent: IntentType, lower: string): boolean {
    if (['project_indexing', 'memory_operation'].includes(intent)) return false;
    if (/projeto|código|arquivo|documentação|readme/.test(lower)) return true;
    return ['code_analysis', 'architecture_discussion', 'research', 'debug'].includes(intent);
  }

  private needsWriteTools(intent: IntentType): boolean {
    return ['code_change', 'file_operation', 'memory_operation'].includes(intent);
  }

  private suggestTools(intent: IntentType, lower: string): string[] {
    const tools: string[] = [];

    if (['code_analysis', 'architecture_discussion', 'debug', 'planning'].includes(intent)) {
      tools.push('inspect_structure', 'detect_stack', 'search_rag');
    }
    if (/git|commit|branch|diff/.test(lower)) {
      tools.push('git_status', 'git_diff');
    }
    if (/dependência|package\.json|npm/.test(lower)) {
      tools.push('list_dependencies');
    }
    if (/buscar|encontrar|onde está/.test(lower)) {
      tools.push('search_files');
    }
    if (/memória|decisão|regra/.test(lower)) {
      tools.push('search_memories');
    }
    if (intent === 'file_operation') {
      tools.push('list_directory');
    }

    return [...new Set(tools)].filter((t) =>
      READONLY_AUTO_TOOLS.includes(t) || t === 'list_dependencies',
    );
  }

  private assessRisk(intent: IntentType): 'low' | 'medium' | 'high' {
    if (['code_change', 'file_operation', 'long_running_task'].includes(intent)) return 'high';
    if (['debug', 'memory_operation', 'project_indexing'].includes(intent)) return 'medium';
    return 'low';
  }
}
