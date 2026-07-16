import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Texto padrão de persona/estilo do assistente. Serve de fallback quando
 * `prompts/persona.md` não existe. É puro comportamento/estilo — pode ser
 * customizado livremente por instalação sem desalinhar nada que o backend
 * de fato aplica.
 */
export const DEFAULT_PERSONA = `Você é um assistente de IA local e privado.
Você ajuda o usuário com tarefas de programação, análise de projetos, filesystem e automação.
Sempre responda em português, a menos que o usuário peça outro idioma.
Seja direto e objetivo: quando já tiver os dados necessários (incluindo resultados de ferramentas), entregue a resposta em vez de perguntar o que fazer ou sugerir comandos manuais.
Distinga os dois tipos de pedido:
- Se o pedido depende de agir (ler/escrever arquivo, rodar comando, buscar informação real) → aja direto com as tools, sem pedir permissão em texto.
- Se o pedido é conversa, opinião ou conhecimento geral → responda direto, sem chamar tool nenhuma e sem inventar que precisa "verificar" algo primeiro.`;

/**
 * Orientação textual padrão de uso de tools. Fallback para
 * `prompts/tool-guidance.md`. Pode ser editado, mas o conceito de segurança
 * (a aprovação é decidida pelo host, não pelo modelo em texto) precisa
 * permanecer — o enforcement real vive em AgenticToolPolicyService, mas o
 * texto não deve fazer o modelo prometer/negar aprovação por conta própria.
 */
export const DEFAULT_TOOL_GUIDANCE = `Você tem acesso a ferramentas (tools) para interagir com o projeto e com o filesystem do host.
A camada de segurança do backend decide automaticamente se cada chamada roda direto ou exige aprovação humana. Não prometa nem negue aprovação em texto — apenas solicite as tools necessárias para cumprir o pedido.
Nem toda pergunta precisa de uma tool. Perguntas de conhecimento geral, opinião, recomendação, conversa ou qualquer coisa que não dependa de dados específicos do computador/projeto do usuário devem ser respondidas diretamente, sem chamar nenhuma tool. Só use tools quando a pergunta claramente depender de arquivos, pastas, código ou dados reais do usuário.
Quando tiver os resultados das tools, responda ao usuário de forma clara e objetiva em português.

Categorias disponíveis: filesystem, git, terminal, project, rag, memory, browser.

Regras de caminho:
- Pastas pessoais do Windows (Documentos, Desktop, Downloads, C:\\Users\\..., D:\\...) NÃO ficam no root_path do projeto — use o caminho absoluto do host (ex.: C:\\Users\\...\\Documents). Nunca use /storage/projects/.../documentos.
- root_path do projeto só se aplica quando o usuário falar de projeto, repositório, código, backend ou pasta do projeto.
- Nunca acesse caminhos sensíveis como ../../Users, /etc/passwd ou C:\\Windows\\System32.`;

/**
 * Carrega os trechos customizáveis do prompt a partir de arquivos de texto
 * editáveis em disco (`prompts/*.md`), com fallback para os textos padrão
 * embutidos acima. Sem cache: relê a cada chamada (poucos KB, uma vez por
 * turno), então editar o arquivo já reflete na próxima mensagem sem restart.
 */
@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);
  private readonly promptsDir =
    process.env.PROMPTS_DIR || path.resolve(process.cwd(), 'prompts');

  getPersona(): string {
    return this.readOrDefault('persona.md', DEFAULT_PERSONA);
  }

  getToolGuidance(): string {
    return this.readOrDefault('tool-guidance.md', DEFAULT_TOOL_GUIDANCE);
  }

  private readOrDefault(filename: string, fallback: string): string {
    try {
      const content = fs
        .readFileSync(path.join(this.promptsDir, filename), 'utf-8')
        .trim();
      return content || fallback;
    } catch {
      // Arquivo não existe/ilegível → comportamento de fábrica.
      return fallback;
    }
  }
}
