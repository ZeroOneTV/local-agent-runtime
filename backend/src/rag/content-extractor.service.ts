import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { DocumentType, detectDocumentType } from './document-type';

@Injectable()
export class ContentExtractorService {
  private readonly logger = new Logger(ContentExtractorService.name);

  private readonly textTypes: DocumentType[] = [
    'code',
    'markdown',
    'text',
    'json',
    'yaml',
    'html',
  ];

  async extractFromPath(
    filePath: string,
    filename: string,
  ): Promise<{ content: string; documentType: DocumentType }> {
    const documentType = detectDocumentType(filename);

    if (this.textTypes.includes(documentType) || documentType === 'unknown') {
      const content = await fs.readFile(filePath, 'utf-8');
      return { content, documentType };
    }

    if (documentType === 'pdf') {
      return {
        content: `[PDF não processado ainda: ${filename}]`,
        documentType,
      };
    }

    if (documentType === 'image_ocr') {
      return {
        content: `[Imagem OCR não processada ainda: ${filename}]`,
        documentType,
      };
    }

    this.logger.warn(`Tipo não suportado: ${documentType} (${filename})`);
    return { content: '', documentType };
  }

  extractFromContent(
    content: string,
    filename: string,
  ): { content: string; documentType: DocumentType } {
    return { content, documentType: detectDocumentType(filename) };
  }
}
