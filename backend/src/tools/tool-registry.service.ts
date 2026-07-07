import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ToolDefinition,
  ToolHandler,
  ToolExecutionContext,
  JsonSchemaProperty,
} from './tools.types';
import { FileSystemService } from './services/filesystem.service';
import { GitService } from './services/git.service';
import { TerminalService } from './services/terminal.service';
import { ProjectInspectService } from './services/project.service';
import { BrowserService } from './services/browser.service';
import { MemoryService } from '../memory/memory.service';
import { IndexingService } from '../rag/indexing.service';
import { RetrievalService } from '../rag/retrieval.service';
import { QueueService } from '../queue/queue.service';
import { MemoryOrigin } from '../memory/memory.types';

function schema(props: Record<string, JsonSchemaProperty>): Record<string, JsonSchemaProperty> {
  return props;
}

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private definitions = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();

  constructor(
    private readonly fs: FileSystemService,
    private readonly git: GitService,
    private readonly terminal: TerminalService,
    private readonly project: ProjectInspectService,
    private readonly browser: BrowserService,
    private readonly memory: MemoryService,
    private readonly indexing: IndexingService,
    private readonly retrieval: RetrievalService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.registerAll();
  }

  listDefinitions(): ToolDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.definitions.get(name);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  validateInput(
    definition: ToolDefinition,
    args: Record<string, unknown>,
  ): string | null {
    for (const [key, prop] of Object.entries(definition.inputSchema)) {
      if (prop.required && (args[key] === undefined || args[key] === null)) {
        return `Parâmetro obrigatório ausente: ${key}`;
      }
      if (args[key] !== undefined && prop.type === 'string' && typeof args[key] !== 'string') {
        return `Parâmetro ${key} deve ser string`;
      }
      if (args[key] !== undefined && prop.type === 'number' && typeof args[key] !== 'number') {
        return `Parâmetro ${key} deve ser number`;
      }
    }
    return null;
  }

  private register(def: ToolDefinition, handler: ToolHandler) {
    this.definitions.set(def.name, def);
    this.handlers.set(def.name, handler);
  }

  private registerAll() {
    const exec = (
      fn: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>,
    ): ToolHandler => ({
      execute: (args, ctx) => fn(args, ctx) as ReturnType<ToolHandler['execute']>,
    });

    // Filesystem
    this.register(
      {
        name: 'read_file',
        description: 'Lê o conteúdo de um arquivo dentro do projeto.',
        category: 'filesystem',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ path: { type: 'string', required: true, description: 'Caminho relativo' } }),
        outputSchema: schema({ path: { type: 'string' }, content: { type: 'string' } }),
      },
      exec((a, c) => this.fs.readFile(c.rootPath, a.path as string)),
    );

    this.register(
      {
        name: 'list_directory',
        description: 'Lista arquivos e pastas de um diretório.',
        category: 'filesystem',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ path: { type: 'string', description: 'Caminho relativo' } }),
        outputSchema: schema({ entries: { type: 'string' } }),
      },
      exec((a, c) => this.fs.listDirectory(c.rootPath, (a.path as string) || '.')),
    );

    this.register(
      {
        name: 'search_files',
        description: 'Busca texto nos arquivos do projeto.',
        category: 'filesystem',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({
          query: { type: 'string', required: true },
          path: { type: 'string' },
        }),
        outputSchema: schema({ matches: { type: 'string' } }),
      },
      exec((a, c) =>
        this.fs.searchFiles(c.rootPath, a.query as string, a.path as string),
      ),
    );

    this.register(
      {
        name: 'write_file',
        description: 'Escreve ou sobrescreve um arquivo no projeto.',
        category: 'filesystem',
        kind: 'write',
        riskLevel: 'high',
        requiresApproval: true,
        async: false,
        inputSchema: schema({
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        }),
        outputSchema: schema({ written: { type: 'string' } }),
      },
      exec((a, c) =>
        this.fs.writeFile(c.rootPath, a.path as string, a.content as string),
      ),
    );

    this.register(
      {
        name: 'apply_patch',
        description: 'Aplica conteúdo completo a um arquivo (substituição).',
        category: 'filesystem',
        kind: 'write',
        riskLevel: 'high',
        requiresApproval: true,
        async: false,
        inputSchema: schema({
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        }),
        outputSchema: schema({ written: { type: 'string' } }),
      },
      exec((a, c) =>
        this.fs.applyPatch(c.rootPath, a.path as string, a.content as string),
      ),
    );

    this.register(
      {
        name: 'delete_file',
        description: 'Remove um arquivo do projeto.',
        category: 'filesystem',
        kind: 'write',
        riskLevel: 'critical',
        requiresApproval: true,
        async: false,
        inputSchema: schema({ path: { type: 'string', required: true } }),
        outputSchema: schema({ deleted: { type: 'string' } }),
      },
      exec((a, c) => this.fs.deleteFile(c.rootPath, a.path as string)),
    );

    // Git
    const gitDef = (name: string, desc: string, fn: (c: ToolExecutionContext, a: Record<string, unknown>) => Promise<unknown>) =>
      this.register(
        {
          name,
          description: desc,
          category: 'git',
          kind: 'readonly',
          riskLevel: 'low',
          requiresApproval: false,
          async: false,
          inputSchema: schema({}),
          outputSchema: schema({ output: { type: 'string' } }),
        },
        exec((a, c) => fn(c, a)),
      );

    gitDef('git_status', 'Retorna status do repositório Git.', (c) => this.git.gitStatus(c.rootPath));
    gitDef('git_diff', 'Retorna diff do Git.', (c, a) => this.git.gitDiff(c.rootPath, a.path as string));
    gitDef('git_log', 'Retorna histórico de commits.', (c) => this.git.gitLog(c.rootPath));
    gitDef('git_branch', 'Lista branches do repositório.', (c) => this.git.gitBranch(c.rootPath));
    this.register(
      {
        name: 'git_show_file',
        description: 'Mostra versão commitada de um arquivo.',
        category: 'git',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ path: { type: 'string', required: true } }),
        outputSchema: schema({ output: { type: 'string' } }),
      },
      exec((a, c) => this.git.gitShowFile(c.rootPath, a.path as string)),
    );

    // Project
    this.register(
      {
        name: 'inspect_structure',
        description: 'Inspeciona estrutura de diretórios do projeto.',
        category: 'project',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ depth: { type: 'number' } }),
        outputSchema: schema({ structure: { type: 'string' } }),
      },
      exec((a, c) => this.project.inspectStructure(c.rootPath, (a.depth as number) || 2)),
    );

    this.register(
      {
        name: 'detect_stack',
        description: 'Detecta stack tecnológica do projeto.',
        category: 'project',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({}),
        outputSchema: schema({ stack: { type: 'string' } }),
      },
      exec((_a, c) => this.project.detectStack(c.rootPath)),
    );

    this.register(
      {
        name: 'list_dependencies',
        description: 'Lista dependências do package.json.',
        category: 'project',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({}),
        outputSchema: schema({ dependencies: { type: 'string' } }),
      },
      exec((_a, c) => this.project.listDependencies(c.rootPath)),
    );

    // Terminal
    this.register(
      {
        name: 'run_command',
        description: 'Executa um comando shell no diretório do projeto.',
        category: 'terminal',
        kind: 'execution',
        riskLevel: 'critical',
        requiresApproval: true,
        async: false,
        inputSchema: schema({ command: { type: 'string', required: true } }),
        outputSchema: schema({ output: { type: 'string' } }),
      },
      exec((a, c) => this.terminal.runCommand(c.rootPath, a.command as string)),
    );

    this.register(
      {
        name: 'run_tests',
        description: 'Executa testes do projeto (npm test).',
        category: 'terminal',
        kind: 'execution',
        riskLevel: 'high',
        requiresApproval: true,
        async: true,
        inputSchema: schema({}),
        outputSchema: schema({ output: { type: 'string' } }),
      },
      exec((a, c) => this.terminal.runTests(c.rootPath)),
    );

    this.register(
      {
        name: 'run_build',
        description: 'Executa build do projeto (npm run build).',
        category: 'terminal',
        kind: 'execution',
        riskLevel: 'high',
        requiresApproval: true,
        async: true,
        inputSchema: schema({}),
        outputSchema: schema({ output: { type: 'string' } }),
      },
      exec((a, c) => this.terminal.runBuild(c.rootPath)),
    );

    // RAG
    this.register(
      {
        name: 'search_rag',
        description: 'Busca conhecimento indexado no projeto.',
        category: 'rag',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ query: { type: 'string', required: true } }),
        outputSchema: schema({ chunks: { type: 'string' } }),
      },
      exec(async (a, c) => {
        const chunks = await this.retrieval.searchRankedChunks(
          c.projectId,
          a.query as string,
          5,
        );
        return { success: true, data: { chunks } };
      }),
    );

    this.register(
      {
        name: 'index_file',
        description: 'Indexa um arquivo no RAG (assíncrono).',
        category: 'rag',
        kind: 'write',
        riskLevel: 'medium',
        requiresApproval: false,
        async: true,
        inputSchema: schema({
          path: { type: 'string', required: true },
          filename: { type: 'string', required: true },
          content: { type: 'string', required: true },
        }),
        outputSchema: schema({ jobId: { type: 'string' } }),
      },
      exec(async (a, c) => {
        const job = await this.queue.enqueueFileIndex(
          c.projectId,
          a.path as string,
          a.filename as string,
          a.content as string,
        );
        return { success: true, data: { jobId: job.id }, metadata: { async: true } };
      }),
    );

    this.register(
      {
        name: 'index_project',
        description: 'Reindexa todos os arquivos do projeto (assíncrono).',
        category: 'rag',
        kind: 'write',
        riskLevel: 'medium',
        requiresApproval: true,
        async: true,
        inputSchema: schema({}),
        outputSchema: schema({ jobId: { type: 'string' } }),
      },
      exec(async (_a, c) => {
        const result = await this.indexing.reindexProject(c.projectId);
        return { success: true, data: result, metadata: { async: true } };
      }),
    );

    // Memory
    this.register(
      {
        name: 'create_memory',
        description: 'Cria memória permanente do projeto.',
        category: 'memory',
        kind: 'write',
        riskLevel: 'medium',
        requiresApproval: true,
        async: false,
        inputSchema: schema({
          title: { type: 'string', required: true },
          content: { type: 'string', required: true },
          importance: { type: 'number' },
          origin: { type: 'string', required: true },
        }),
        outputSchema: schema({ id: { type: 'string' } }),
      },
      exec(async (a, c) => {
        const mem = await this.memory.create({
          projectId: c.projectId,
          title: a.title as string,
          content: a.content as string,
          importance: a.importance as number,
          origin: (a.origin as MemoryOrigin) || 'user_confirmation',
        });
        return { success: true, data: { id: mem.id, title: mem.title } };
      }),
    );

    this.register(
      {
        name: 'update_memory',
        description: 'Atualiza memória permanente existente.',
        category: 'memory',
        kind: 'write',
        riskLevel: 'medium',
        requiresApproval: true,
        async: false,
        inputSchema: schema({
          id: { type: 'string', required: true },
          title: { type: 'string' },
          content: { type: 'string' },
          reason: { type: 'string', required: true },
        }),
        outputSchema: schema({ id: { type: 'string' } }),
      },
      exec(async (a) => {
        const mem = await this.memory.update(a.id as string, {
          title: a.title as string,
          content: a.content as string,
          reason: a.reason as string,
        });
        return { success: true, data: { id: mem.id } };
      }),
    );

    this.register(
      {
        name: 'search_memories',
        description: 'Busca memórias permanentes do projeto.',
        category: 'memory',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({ query: { type: 'string', required: true } }),
        outputSchema: schema({ memories: { type: 'string' } }),
      },
      exec(async (a, c) => {
        const memories = await this.retrieval.searchRelevantMemories(
          c.projectId,
          a.query as string,
          10,
        );
        return { success: true, data: { memories } };
      }),
    );

    // Browser
    this.register(
      {
        name: 'fetch_url',
        description: 'Busca conteúdo de uma URL (whitelist de hosts).',
        category: 'browser',
        kind: 'external',
        riskLevel: 'high',
        requiresApproval: true,
        async: false,
        inputSchema: schema({ url: { type: 'string', required: true } }),
        outputSchema: schema({ content: { type: 'string' } }),
      },
      exec((a) => this.browser.fetchUrl(a.url as string)),
    );

    // Alias legado
    this.register(
      {
        name: 'search_project',
        description: 'Alias de search_files para compatibilidade.',
        category: 'filesystem',
        kind: 'readonly',
        riskLevel: 'low',
        requiresApproval: false,
        async: false,
        inputSchema: schema({
          query: { type: 'string', required: true },
          path: { type: 'string' },
        }),
        outputSchema: schema({ matches: { type: 'string' } }),
      },
      exec((a, c) =>
        this.fs.searchFiles(c.rootPath, a.query as string, a.path as string),
      ),
    );
  }
}
