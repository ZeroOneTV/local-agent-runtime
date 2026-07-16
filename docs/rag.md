# RAG e Memória

> Fonte da verdade do schema: `backend/prisma/schema.prisma`. Este documento descreve as tabelas reais usadas hoje — mantenha-o sincronizado com o Prisma ao alterar o modelo.

## Armazenamento vetorial

Por padrão usa **PostgreSQL + pgvector**. O conteúdo indexado vive em três tabelas relacionadas:

- `files` — metadados de cada arquivo indexado do projeto (path, hash, tipo, tamanho).
- `file_chunks` — o arquivo dividido em pedaços (chunks) para recuperação.
- `embeddings` — o vetor de cada chunk (coluna `vector` do pgvector), ligado a `file_chunks`.

Qdrant fica disponível como alternativa via profile Docker:

```bash
docker compose --profile qdrant up -d
```

## Chat e resumos

- `conversations` / `messages` — histórico das conversas.
- `conversation_summaries` — resumos incrementais de conversas longas (evita reprocessar todo o histórico).

## Camadas de memória

A memória é estratificada por idade/uso, com TTL configurável no `.env`:

| Camada | Tabela | TTL (env) |
|--------|--------|-----------|
| Working | `memories` (+ `memory_history`) | `MEMORY_WORKING_TTL_HOURS` / `MEMORY_WORKING_PROJECT_TTL_DAYS` |
| Recent | `recent_memory_items` | `MEMORY_RECENT_TTL_DAYS` |
| Deep / Consolidated | `deep_memory_items` | `MEMORY_DEEP_ARCHIVE_AFTER_DAYS` |
| Cold Archive | `archive_items` | — (frio; fora da busca por padrão) |

Suporte: `memory_access_logs` (registra acessos, base para `MEMORY_ACCESS_REFRESH`) e `memory_portability_records` (export/import).

## Embeddings

Gerados via API do Ollama (`EMBEDDING_MODEL`, default `nomic-embed-text`).

## Indexação assíncrona

Filas Redis + BullMQ:

- `file-index` — indexa arquivos do projeto (popula `files`/`file_chunks`)
- `embeddings` — gera embeddings de conteúdo (popula `embeddings`)

## Busca (estado atual)

1. Gera embedding da query
2. Busca por similaridade no pgvector (operador `<=>`) sobre `embeddings`
3. Fallback para busca textual simples se o embedding estiver indisponível

> **Limitação conhecida (ver `AUTONOMY_MEMORY_MEDIA_IMPROVEMENTS.md`, seção B):** hoje é vetor puro com *fallback binário* para texto — não há busca híbrida (vetorial + full-text `tsvector`/`ts_rank` via RRF) nem reranking. Isso reduz o recall em buscas por termos exatos (nomes de função, IDs, strings literais). A busca híbrida requer mudança no backend e está registrada como trabalho futuro.

## Decay / promoção entre camadas

Endpoint `POST /memory/decay/run` promove/expira itens entre camadas. Hoje o critério é majoritariamente **idade** (TTL) + `MEMORY_ACCESS_REFRESH` (reaquece o TTL no acesso). Promoção por **importância/frequência de acesso** e agendamento automático do decay são melhorias registradas para o backend (não implementadas ainda).

## Portabilidade

Export/import de memória em ZIP com perfis `minimal` / `portable` / `full` (`MEMORY_EXPORT_DEFAULT_PROFILE`, `MEMORY_IMPORT_AUTO_REEMBED`). Registros em `memory_portability_records`. `MEMORY_RETRIEVAL_ENABLE_ARCHIVE=false` por padrão — arquivo frio não polui a busca corriqueira.
