/** Remove linhas duplicadas entre camadas de contexto. */
export function deduplicateLines(primary: string, secondary: string): string {
  if (!secondary.trim()) return secondary;

  const primaryLines = new Set(
    primary
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 20),
  );

  const kept = secondary
    .split('\n')
    .filter((line) => {
      const key = line.trim().toLowerCase();
      if (key.length < 20) return true;
      return !primaryLines.has(key);
    });

  return kept.join('\n').trim();
}

/** Filtra memórias já citadas na camada de projeto. */
export function filterDuplicateMemories<T extends { title: string; content: string }>(
  projectLayer: string,
  memories: T[],
): T[] {
  const haystack = projectLayer.toLowerCase();
  return memories.filter((m) => {
    const titleHit = haystack.includes(m.title.toLowerCase());
    const contentSnippet = m.content.slice(0, 60).toLowerCase();
    return !(titleHit && haystack.includes(contentSnippet));
  });
}

/** Heurística: mensagens curtas/casuais não precisam de RAG. */
export function shouldSearchRag(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 40) return false;

  const projectKeywords =
    /projeto|código|codigo|arquivo|documento|erro|bug|rag|index|api|função|funcao|classe|módulo|modulo|config|implement|estrutura|teste|docker|prisma|nestjs/i;

  return projectKeywords.test(trimmed) || trimmed.length > 120;
}
