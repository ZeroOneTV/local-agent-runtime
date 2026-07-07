# RAG e Memória

## Armazenamento vetorial

Por padrão usa **PostgreSQL + pgvector** na tabela `memory_items`.

Qdrant fica disponível como alternativa via profile Docker:

```bash
docker compose --profile qdrant up -d
```

## Embeddings

Gerados via API do Ollama (`nomic-embed-text`).

## Indexação assíncrona

Filas Redis + BullMQ:

- `file-index` — indexa arquivos do projeto
- `embeddings` — gera embeddings de conteúdo

## Busca

1. Gera embedding da query
2. Busca por similaridade no pgvector (`<=>` operator)
3. Fallback para busca textual se embedding indisponível

## Entidades

- `MemoryItem` — chunks de memória com embedding
- `ConversationSummary` — resumos de conversas longas
- `ProjectFile` — metadados de arquivos indexados
