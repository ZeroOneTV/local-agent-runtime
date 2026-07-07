import { Injectable } from '@nestjs/common';
import { ImageProcessingResultDto } from './media.types';

@Injectable()
export class MediaContextService {
  buildImageContextMarkdown(
    result: ImageProcessingResultDto,
    options?: { indexed?: boolean; promoted?: boolean },
  ): string {
    const importantBlocks = result.layout.blocks
      .slice(0, 8)
      .map((b) => `- ${b.type}: ${b.content.slice(0, 200)}`)
      .join('\n');

    const notes = options?.indexed
      ? 'This image context has been indexed in project RAG.'
      : options?.promoted
        ? 'Promoted to project knowledge; indexing pending or completed.'
        : 'Uploaded during a conversation and not yet promoted to project knowledge.';

    return [
      '# Image Context',
      '',
      '## Type',
      result.imageType,
      '',
      '## Summary',
      result.semantic.summary || 'No summary available.',
      '',
      '## OCR Text',
      result.ocr.fullText || '(no text detected)',
      '',
      '## Important Blocks',
      importantBlocks || '(none)',
      '',
      '## Entities',
      result.semantic.entities.length
        ? result.semantic.entities.map((e) => `- ${e}`).join('\n')
        : '(none)',
      '',
      '## Tags',
      result.semantic.tags.join(', ') || '(none)',
      '',
      '## Notes',
      notes,
      '',
      ...(result.warnings.length
        ? ['## Warnings', ...result.warnings.map((w) => `- ${w}`), '']
        : []),
    ].join('\n');
  }

  buildContextSnippet(result: ImageProcessingResultDto, maxChars = 2500): string {
    const parts = [
      `[Imagem processada: ${result.imageType}]`,
      `Resumo: ${result.semantic.summary}`,
      result.ocr.fullText ? `OCR: ${result.ocr.fullText.slice(0, 1200)}` : '',
      result.semantic.tags.length ? `Tags: ${result.semantic.tags.join(', ')}` : '',
    ].filter(Boolean);

    return parts.join('\n\n').slice(0, maxChars);
  }
}
