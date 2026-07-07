import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { IntentAnalysis, OrchestratorPlan } from './orchestrator.types';

const PLANNER_PROMPT = `Você é um planejador de tarefas técnicas.
Crie um plano conciso em JSON com: objective, steps (array de strings), requiresApproval (boolean), toolsPlanned (array), risks (array), completionCriteria (string).
Responda APENAS com JSON válido, em português.`;

@Injectable()
export class PlannerService {
  constructor(private readonly llm: LlmService) {}

  async createPlan(message: string, intent: IntentAnalysis): Promise<OrchestratorPlan> {
    const template = this.templatePlan(message, intent);

    try {
      const response = await this.llm.chat(
        [
          {
            role: 'user',
            content: `Pedido: ${message}\nIntenção: ${intent.intent}\nComplexidade: ${intent.complexity}`,
          },
        ],
        PLANNER_PROMPT,
      );

      const parsed = JSON.parse(this.extractJson(response.content));
      return {
        objective: parsed.objective || template.objective,
        steps: parsed.steps || template.steps,
        requiresApproval: parsed.requiresApproval ?? template.requiresApproval,
        toolsPlanned: parsed.toolsPlanned || template.toolsPlanned,
        risks: parsed.risks || template.risks,
        completionCriteria: parsed.completionCriteria || template.completionCriteria,
      };
    } catch {
      return template;
    }
  }

  formatPlanForContext(plan: OrchestratorPlan): string {
    return [
      `Objetivo: ${plan.objective}`,
      `Etapas:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      plan.requiresApproval ? 'Algumas etapas exigem aprovação do usuário.' : '',
      plan.risks.length ? `Riscos: ${plan.risks.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private templatePlan(message: string, intent: IntentAnalysis): OrchestratorPlan {
    const stepsByIntent: Record<string, string[]> = {
      code_analysis: [
        'Inspecionar estrutura do projeto',
        'Buscar contexto relevante no RAG',
        'Analisar arquivos principais',
        'Gerar diagnóstico e recomendações',
      ],
      code_change: [
        'Entender escopo da mudança',
        'Identificar arquivos afetados',
        'Propor alterações',
        'Solicitar aprovação para escrita',
      ],
      debug: [
        'Coletar contexto do erro',
        'Buscar referências no projeto',
        'Identificar causa provável',
        'Propor correção',
      ],
      planning: [
        'Analisar estado atual',
        'Definir objetivos',
        'Listar etapas e dependências',
        'Sugerir próximos passos',
      ],
      project_indexing: [
        'Identificar arquivos do projeto',
        'Indexar conteúdo no RAG',
        'Validar indexação',
      ],
      long_running_task: [
        'Criar job de processamento',
        'Executar em background',
        'Notificar conclusão',
      ],
    };

    const steps = stepsByIntent[intent.intent] || [
      'Analisar pedido',
      'Coletar contexto',
      'Responder com diagnóstico',
    ];

    return {
      objective: message.slice(0, 200),
      steps,
      requiresApproval: ['code_change', 'file_operation', 'debug'].includes(intent.intent),
      toolsPlanned: intent.suggestedReadonlyTools,
      risks: intent.likelyRisk === 'high' ? ['Alteração de arquivos ou execução'] : [],
      completionCriteria: 'Objetivo do usuário atendido ou aprovação pendente documentada',
    };
  }

  private extractJson(text: string): string {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : text;
  }
}
