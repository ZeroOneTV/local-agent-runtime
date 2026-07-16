import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolResult } from '../tools/tools.types';

@Injectable()
export class ToolResultSummarizerService {
  constructor(private readonly config: ConfigService) {}

  summarize(toolName: string, result: StructuredToolResult): string {
    if (!result.success) {
      return `Erro (${result.error?.code || 'UNKNOWN'}): ${result.error?.message || 'falha'}`;
    }

    const maxKb = this.config.get<number>('agentic.autoToolMaxOutputKb') ?? 64;
    const maxChars = maxKb * 1024;
    const raw = JSON.stringify(result.data ?? result, null, 2);

    if (toolName === 'list_directory' && result.data && typeof result.data === 'object') {
      const data = result.data as {
        path?: string;
        entries?: Array<{ name: string; type: string }>;
      };
      const entries = data.entries || [];
      const dirs = entries.filter((e) => e.type === 'directory').map((e) => e.name);
      const files = entries.filter((e) => e.type === 'file').map((e) => e.name);
      const lines = [
        `Diretório: ${data.path || '.'}`,
        dirs.length ? `Pastas (${dirs.length}): ${dirs.slice(0, 40).join(', ')}${dirs.length > 40 ? '…' : ''}` : 'Pastas: (nenhuma)',
        files.length ? `Arquivos (${files.length}): ${files.slice(0, 40).join(', ')}${files.length > 40 ? '…' : ''}` : 'Arquivos: (nenhum)',
      ];
      return lines.join('\n');
    }

    if (toolName === 'read_file' && result.data && typeof result.data === 'object') {
      const data = result.data as { path?: string; content?: string };
      const content = data.content || '';
      const preview = content.length > 4000 ? content.slice(0, 4000) + '\n…[truncado]' : content;
      return `Arquivo: ${data.path}\n\n${preview}`;
    }

    if (toolName === 'search_files' && result.data && typeof result.data === 'object') {
      const data = result.data as { query?: string; matches?: string[]; count?: number };
      const matches = data.matches || [];
      return `Busca "${data.query}": ${data.count ?? matches.length} resultado(s)\n${matches.slice(0, 30).join('\n')}${matches.length > 30 ? '\n…' : ''}`;
    }

    if (toolName === 'size_summary' && result.data && typeof result.data === 'object') {
      const data = result.data as {
        path?: string;
        directoryCount?: number;
        fileCount?: number;
        heaviestFile?: { name: string; path: string; sizeBytes: number };
        heaviestDirectory?: {
          name: string;
          path: string;
          sizeBytes: number;
          estimated?: boolean;
        };
        recursiveUsed?: boolean;
        warnings?: string[];
      };
      const fmt = (n?: number) =>
        typeof n === 'number'
          ? n >= 1024 * 1024
            ? `${(n / (1024 * 1024)).toFixed(1)} MB`
            : n >= 1024
              ? `${(n / 1024).toFixed(1)} KB`
              : `${n} B`
          : '-';
      const lines = [
        `Resumo de: ${data.path || '.'}`,
        `Pastas: ${data.directoryCount ?? 0}`,
        `Arquivos: ${data.fileCount ?? 0}`,
        data.heaviestFile
          ? `Arquivo mais pesado: ${data.heaviestFile.name} (${fmt(data.heaviestFile.sizeBytes)})`
          : 'Arquivo mais pesado: (nenhum)',
        data.heaviestDirectory
          ? `Pasta mais pesada: ${data.heaviestDirectory.name} (${fmt(data.heaviestDirectory.sizeBytes)}${data.heaviestDirectory.estimated ? ', estimado' : ''})`
          : 'Pasta mais pesada: (nenhuma)',
        `Modo: ${data.recursiveUsed ? 'recursivo' : 'superficial'}`,
      ];
      if (data.warnings?.length) {
        lines.push(`Avisos: ${data.warnings.join(' | ')}`);
      }
      return lines.join('\n');
    }

    if (toolName === 'web_search' && result.data && typeof result.data === 'object') {
      const data = result.data as {
        query?: string;
        provider?: string;
        results?: Array<{ title?: string; url?: string; snippet?: string }>;
      };
      const results = data.results || [];
      if (!results.length) {
        return `Busca "${data.query}" (${data.provider}): nenhum resultado.`;
      }
      const lines = results.slice(0, 10).map((r, i) => {
        const snippet = (r.snippet || '').replace(/\s+/g, ' ').slice(0, 200);
        return `${i + 1}. ${r.title}\n   ${r.url}\n   ${snippet}`;
      });
      return [
        `Busca "${data.query}" (${data.provider}) — ${results.length} resultado(s):`,
        ...lines,
      ].join('\n');
    }

    if (toolName === 'fetch_url' && result.data && typeof result.data === 'object') {
      const data = result.data as { url?: string; status?: number; content?: string };
      const content = data.content || '';
      const preview =
        content.length > 4000 ? content.slice(0, 4000) + '\n…[truncado]' : content;
      return `URL: ${data.url} (HTTP ${data.status})\n\n${preview}`;
    }

    if (toolName === 'enqueue_long_job' && result.data && typeof result.data === 'object') {
      const data = result.data as { jobId?: string; status?: string; type?: string };
      return [
        'Tarefa longa enfileirada em background.',
        `Job: ${data.jobId ?? '-'}`,
        `Tipo: ${data.type ?? '-'}`,
        `Status: ${data.status ?? 'queued'}`,
        'Informe o usuário que ele será avisado quando o job concluir.',
      ].join('\n');
    }

    if (raw.length <= maxChars) return raw;
    return raw.slice(0, maxChars) + `\n…[truncado — ${raw.length} chars]`;
  }
}
