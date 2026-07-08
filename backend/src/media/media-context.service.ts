import { Injectable } from '@nestjs/common';
import { ImageProcessingResultDto, ProcessCapabilitiesDto } from './media.types';

@Injectable()
export class MediaContextService {
  buildImageContextMarkdown(
    result: ImageProcessingResultDto,
    options?: { indexed?: boolean; promoted?: boolean },
  ): string {
    const layoutBlocks = result.layout.blocks
      .slice(0, 8)
      .map((b) => `- ${b.type}: ${b.content.slice(0, 200)}`)
      .join('\n');

    const tables = result.document?.tables?.length
      ? result.document.tables.slice(0, 10).map((t) => `- ${t.slice(0, 150)}`).join('\n')
      : '(none)';

    const relevance = options?.indexed
      ? 'Indexed in project RAG.'
      : options?.promoted
        ? 'Promoted to project knowledge; indexing pending or completed.'
        : 'Conversation-only; not yet promoted to project knowledge.';

    const perf = result.performance
      ? `OCR ${result.performance.ocrMs ?? 0}ms, layout ${result.performance.layoutMs ?? 0}ms, total ${result.performance.totalMs ?? 0}ms`
      : 'n/a';

    return [
      '# Image Context',
      '',
      '## Metadata',
      `- Type: ${result.imageType}`,
      `- Size: ${result.metadata.width}x${result.metadata.height} (${result.metadata.format})`,
      `- Providers: OCR=${result.providers?.ocr ?? result.ocr.provider}, layout=${result.providers?.layout ?? result.layout.provider}, document=${result.providers?.document ?? 'n/a'}, vision=${result.providers?.vision ?? result.vision.provider}`,
      `- Processing: ${result.processingMode}`,
      '',
      '## Summary',
      result.semantic.summary || 'No summary available.',
      '',
      '## OCR Text',
      result.ocr.fullText || '(no text detected)',
      '',
      '## Layout',
      layoutBlocks || '(none)',
      '',
      '## Tables',
      tables,
      '',
      '## Visual Description',
      result.vision.summary || '(not available)',
      '',
      '## Entities',
      result.semantic.entities.length
        ? result.semantic.entities.map((e) => `- ${e}`).join('\n')
        : '(none)',
      '',
      '## Tags',
      result.semantic.tags.join(', ') || '(none)',
      '',
      '## Warnings',
      result.warnings.length ? result.warnings.map((w) => `- ${w}`).join('\n') : '(none)',
      '',
      '## Relevance',
      relevance,
      '',
      '## Performance',
      perf,
    ].join('\n');
  }

  buildContextSnippet(result: ImageProcessingResultDto, maxChars = 2500): string {
    const parts = [
      `[Imagem: ${result.imageType}]`,
      `Resumo: ${result.semantic.summary}`,
      result.ocr.fullText ? `OCR: ${result.ocr.fullText.slice(0, 800)}` : '',
      result.vision.summary ? `Visual: ${result.vision.summary.slice(0, 400)}` : '',
      result.semantic.tags.length ? `Tags: ${result.semantic.tags.join(', ')}` : '',
      result.warnings.length ? `Avisos: ${result.warnings.slice(0, 2).join('; ')}` : '',
    ].filter(Boolean);

    return parts.join('\n\n').slice(0, maxChars);
  }
}
