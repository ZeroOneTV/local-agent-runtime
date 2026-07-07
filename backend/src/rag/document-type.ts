export type DocumentType =
  | 'code'
  | 'markdown'
  | 'text'
  | 'json'
  | 'yaml'
  | 'pdf'
  | 'image_ocr'
  | 'image_context'
  | 'html'
  | 'unknown';

const EXTENSION_MAP: Record<string, DocumentType> = {
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  py: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  cs: 'code',
  cpp: 'code',
  c: 'code',
  h: 'code',
  sql: 'code',
  md: 'markdown',
  mdx: 'markdown',
  txt: 'text',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  pdf: 'pdf',
  png: 'image_ocr',
  jpg: 'image_ocr',
  jpeg: 'image_ocr',
  gif: 'image_ocr',
  webp: 'image_ocr',
  html: 'html',
  htm: 'html',
};

export function detectDocumentType(filename: string): DocumentType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? 'unknown';
}

export const DOCUMENT_TYPE_PRIORITY_BOOST: Record<DocumentType, number> = {
  markdown: 0.1,
  code: 0.05,
  text: 0,
  json: 0,
  yaml: 0,
  html: 0,
  pdf: -0.05,
  image_ocr: -0.1,
  image_context: 0.05,
  unknown: -0.1,
};
