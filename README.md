# Local AI Assistant

Assistente de IA **local e privado** que combina uma interface de chat moderna com um backend orquestrador. Em vez de conectar o chat diretamente ao modelo de linguagem, este projeto trata a LLM como **um componente** dentro de um sistema maior — com contexto, memória, busca em documentos (RAG), ferramentas, segurança, tarefas longas e processamento de imagens.

Ideal para quem quer um assistente estilo ChatGPT/Claude, mas rodando na própria máquina, com controle total sobre dados, permissões e fluxo de execução.

---

## O que este projeto faz

| Você obtém | Como funciona |
|------------|---------------|
| Chat com interface familiar | [Open WebUI](https://github.com/open-webui/open-webui) como interface de chat |
| Respostas contextualizadas | O backend monta contexto em camadas antes de chamar a LLM |
| Conhecimento do seu projeto | RAG indexa documentos e código; memórias guardam decisões permanentes |
| Análise de imagens | OCR, layout, parsing documental e VLM opcional via worker Python |
| Ações no projeto | Tools leem arquivos, inspecionam estrutura, consultam Git etc. |
| Segurança por padrão | Tools sensíveis exigem aprovação; tudo é auditado |
| Memória em camadas e portabilidade | Working/recent/deep no Redis+Postgres; export/import ZIP entre máquinas |

**Regra central:** o Open WebUI **nunca** fala direto com o Ollama. Toda mensagem passa pelo backend, que decide o que fazer antes de chamar o modelo.

```text
Open WebUI  →  Backend (/v1)  →  Orquestrador  →  Contexto / RAG / Mídia / Tools  →  LLM local
```

---

## Por que não conectar o chat direto à LLM?

Se o Open WebUI conversar direto com o Ollama, você perde:

- Montagem inteligente de contexto com limite de tokens
- Memória permanente e RAG do projeto
- Processamento estruturado de imagens (OCR, layout, `image_context.md`)
- Execução controlada de ferramentas
- Aprovação humana para ações perigosas
- Auditoria e logs de segurança
- Jobs longos e eventos de progresso

Este projeto é um **runtime de assistente cognitivo**, não um proxy de chat.

---

## Arquitetura

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Windows / Linux (host)                                              │
│  ┌──────────────────┐   ┌──────────────────┐                          │
│  │ Ollama (nativo)  │   │ VLM nativo       │  (opcional, via HTTP)  │
│  │ :11434           │   │ qwen2.5vl etc.   │                          │
│  └────────▲─────────┘   └────────▲─────────┘                          │
│           │ host.docker.internal                                     │
│  ┌────────┴──────────────────────────────────────────────────────┐   │
│  │ Docker Compose                                                 │   │
│  │                                                                │   │
│  │  Open WebUI :3080 ──► Backend NestJS :3001 (host ou Docker)    │   │
│  │                            │                                   │   │
│  │         Cognitive Orchestrator                               │   │
│  │              ┌─────────────┼─────────────┐                     │   │
│  │              ▼             ▼             ▼                     │   │
│  │         Context Engine  Tools/Security  Jobs (BullMQ)          │   │
│  │              │             │             │                     │   │
│  │              ▼             ▼             ▼                     │   │
│  │         PostgreSQL     Redis         storage/                  │   │
│  │         + pgvector      (working)     (uploads, media, memory) │   │
│  │                                                                │   │
│  │  media-worker :5000  ◄── providers OCR/layout/VLM              │   │
│  │  worker-all         ◄── filas BullMQ (index, jobs, memória)    │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Função | Porta |
|------------|--------|-------|
| **Open WebUI** | Interface de chat | 3080 |
| **Backend NestJS** | Orquestrador, API, tools, RAG, mídia, segurança | 3001 (host ou Docker) |
| **worker-all** | Processa filas BullMQ (indexação, jobs, memória) | — |
| **PostgreSQL + pgvector** | Dados, embeddings, histórico oficial | 5432 |
| **Redis + BullMQ** | Filas e jobs assíncronos | 6379 |
| **Ollama** | LLM local (fora do Docker) | 11434 |
| **Media Worker** | Pipeline de imagens com providers | 5000 |
| **Qdrant** | Vetores alternativos (opcional, profile `qdrant`) | 6333 |

### Stack técnica

- **Backend:** NestJS, Prisma, BullMQ
- **Banco:** PostgreSQL + pgvector (embeddings)
- **Interface:** Open WebUI via API OpenAI-compatible (`/v1`)
- **LLM:** Ollama nativo no host (melhor uso de GPU)
- **Mídia:** Worker Python separado (backend orquestra, worker executa)

---

## Fluxo operacional

### Mensagem de chat

Exemplo: *"Analise a estrutura deste projeto e diga se a arquitetura está coerente."*

1. Usuário envia mensagem no Open WebUI.
2. Open WebUI chama `POST /v1/chat/completions` no backend.
3. Backend identifica o **projeto** (modelo lógico ou API key) e persiste a mensagem.
4. **Orquestrador cognitivo** analisa intenção (`intent`) e decide o fluxo:
   - resposta direta
   - tools read-only automáticas
   - job longo em background
5. **Planner** monta plano de etapas quando necessário.
6. **Execution loop** executa tools read-only (`inspect_structure`, `search_rag`, etc.).
7. **Context Engine** monta o prompt final (ver seção abaixo).
8. **LLM local** gera resposta (ou fallback técnico se Ollama estiver off).
9. Backend salva resposta, sugere memórias, emite eventos e retorna ao Open WebUI.

### Upload de imagem

1. `POST /v1/files` detecta MIME/extensão de imagem — **não** indexa como texto.
2. Backend cria `media_asset` e enfileira job `process_image`.
3. **media-worker** executa pipeline (OCR, layout, etc.) e retorna JSON estruturado.
4. Backend persiste blocos OCR/layout/tags, gera `image_context.md`.
5. **Context Engine** injeta resumo na conversa atual.
6. Imagem **não entra no RAG automaticamente** — requer `promote_media_to_project` ou aprovação.

### Tools sensíveis

`write_file`, `apply_patch`, `run_command`, `promote_media_to_project` e similares criam `tool_call` com status `pending`. Aprovação via chat, API ou `/approvals`.

### Jobs longos

Pedidos como *"indexe todo o projeto"* criam job BullMQ (`orchestrator-jobs`). O chat não bloqueia; eventos reportam progresso.

---

## Context Engine

O prompt enviado à LLM é montado em **camadas**, com budget de tokens e deduplicação:

```text
1. Instruções do sistema
2. Configuração do projeto (root_path, memórias de alta importância)
3. Memória de trabalho (Redis — objetivo/plano/job ativo)
4. Memória recente (Postgres — fatos recentes)
5. Resumo da conversa (quando existir)
6. Memórias consolidadas (busca por similaridade/importância)
7. RAG (chunks vetoriais — pulado em mensagens casuais curtas)
8. Media Context (imagens recentes da conversa)
9. Memória profunda (somente quando a query indica histórico)
10. Resultados recentes de tools (truncados)
11. Mensagem atual do usuário
```

Variáveis relevantes: `CONTEXT_RECENT_MESSAGES`, `CONTEXT_MAX_RECENT_TOKENS`, `MAX_CONTEXT_TOKENS`, `CONTEXT_RAG_CHUNK_LIMIT`, `MEMORY_RETRIEVAL_*`.

---

## Orquestrador cognitivo

Responsável por decidir **quando** usar LLM, tools, RAG, jobs e memória.

| Fluxo | Quando |
|-------|--------|
| `direct` | Pergunta simples, contexto já suficiente |
| `assisted_executor` | Tools read-only + LLM (padrão) |
| `long_job` | Indexação, análise pesada, reindexação |

Em modo debug (`COGNITIVE_DEBUG=true` ou `debug: true` no `/orchestrator/chat`), retorna tempos por etapa, camadas usadas e tokens estimados.

---

## RAG e memória

### RAG (Retrieval-Augmented Generation)

- Indexação incremental por **hash** — arquivos inalterados não são reprocessados.
- Chunks com embeddings em pgvector (ou Qdrant, profile `qdrant`).
- Tipos de documento: `code`, `markdown`, `text`, `image_context`, etc.
- Busca vetorial injetada na camada RAG do Context Engine.

### Memórias permanentes

- Decisões duradouras, convenções, preferências do projeto.
- Confirmação obrigatória antes de salvar (`COGNITIVE_REQUIRE_MEMORY_CONFIRMATION`).
- Alta importância aparece também na camada de projeto.

### Memória em camadas

| Camada | Onde | TTL / decay |
|--------|------|-------------|
| **Working** | Redis | 72h (conversa), 7d (projeto) |
| **Recent** | `recent_memory_items` | 30d → deep |
| **Consolidated** | `memories` | permanente |
| **Deep** | `deep_memory_items` + storage | busca sob demanda; 180d → archive |
| **Cold Archive** | `storage/archive/` | restauração manual |

Portabilidade: export ZIP (`minimal` / `portable` / `full`) com manifest + checksums; import com `new_project`, `merge` ou `replace`; reembedding automático se o modelo de embedding mudar.

---

## Sistema de tools

### Read-only (automáticas)

`read_file`, `list_directory`, `search_files`, `inspect_structure`, `detect_stack`, `search_rag`, `search_memories`, `git_status`, `git_diff`, `search_media`, `get_media_result`, `process_image`

### Exigem aprovação

`write_file`, `apply_patch`, `delete_file`, `run_command`, `run_tests`, `run_build`, `promote_media_to_project`, `index_media_context`

Toda execução passa por **Permission Engine**, **Policy Engine** e **Audit Logs** (`tool_audit_logs`).

Outputs grandes são truncados no contexto; versão completa salva em `storage/artifacts/`.

---

## Pipeline de imagens (media-worker)

### Arquitetura de providers

```text
media-worker/
├── ImageProcessor
│   ├── Metadata + Thumbnail (webp)
│   ├── ImageClassifier (heurísticas)
│   ├── OCRRouter          → PaddleOCR (principal) / Tesseract (fallback)
│   ├── LayoutRouter       → PP-Structure / heurística OCR
│   ├── DocumentRouter     → Docling (modo full, documentos)
│   └── VisionRouter       → Ollama VLM via HTTP (opcional)
└── SemanticAssembler      → result_json + tags + performance
```

### Modos de processamento

| Modo | O que executa | Uso |
|------|---------------|-----|
| `fast` | metadata, thumbnail, OCR leve (Tesseract) | resposta rápida |
| `balanced` | OCR robusto, layout simples, tags | **padrão** |
| `full` | OCR + layout + Docling + VLM se habilitado | análise profunda, promoção RAG |

### Builds do worker

**Mínimo (Tesseract — leve, padrão do compose):**

```bash
docker compose up -d --build
```

**Com PaddleOCR + PP-Structure:**

```bash
MEDIA_INSTALL_OCR=true MEDIA_ENABLE_PADDLEOCR=true \
  docker compose build media-worker
docker compose up -d
```

**Com Docling (documentos, modo `full`):**

```bash
MEDIA_INSTALL_DOCLING=true MEDIA_ENABLE_DOCLING=true \
  docker compose build media-worker
```

**Com VLM (Ollama nativo no host):**

```env
MEDIA_ENABLE_VLM=true
MEDIA_VLM_MODEL=qwen2.5vl:7b
MEDIA_VLM_BASE_URL=http://host.docker.internal:11434
```

### Cache e RAG de imagens

- Cache por **hash + mode + providers** — imagens duplicadas não reprocessam.
- `image_context.md` gerado para conversa e RAG (quando promovida).
- `documentType = image_context` no índice RAG.

### Health do worker

```bash
curl http://localhost:5000/health
# → status de cada provider (paddleocr, tesseract, ppStructure, docling, vlm),
#    todos reportando enabled + available
```

---

## Modelo de dados

Principais entidades (PostgreSQL via Prisma):

| Domínio | Tabelas | Função |
|---------|---------|--------|
| **Identidade** | `users`, `projects` | Usuário e projeto com `root_path`, `execution_mode` |
| **Chat** | `conversations`, `messages`, `conversation_summaries` | Histórico e resumos incrementais |
| **RAG** | `files`, `file_chunks`, `embeddings` | Arquivos indexados e vetores |
| **Memória** | `memories`, `memory_history`, `recent_memory_items`, `deep_memory_items`, `archive_items`, `memory_access_logs`, `memory_portability_records` | Camadas de memória + export/import |
| **Tools** | `tool_calls`, `tool_results`, `tool_audit_logs` | Execuções e aprovações |
| **Jobs** | `jobs` | Tarefas longas (indexação, análise) |
| **Mídia** | `media_assets`, `media_processing_results`, `media_ocr_blocks`, `media_layout_blocks`, `media_tags` | Pipeline de imagens |
| **Eventos** | `orchestrator_events` | Eventos de tarefas, tools e mídia |

O schema completo está em `backend/prisma/schema.prisma`. Migrations em `backend/prisma/migrations/`.

---

## Estrutura do repositório

```text
local-agent-runtime/
├── backend/                 # API NestJS (núcleo)
│   ├── src/
│   │   ├── orchestrator/    # Orquestrador cognitivo
│   │   ├── context/         # Context Engine + resumos
│   │   ├── rag/             # Indexação e busca vetorial
│   │   ├── memory/          # Memórias consolidadas (CRUD)
│   │   ├── memory-stratification/  # Camadas, router, export/import
│   │   ├── tools/           # Ferramentas + aprovações
│   │   ├── media/           # Pipeline de imagens (jobs, RAG)
│   │   ├── security/        # Permissões e auditoria
│   │   ├── jobs/            # Workers de tarefas longas
│   │   ├── openwebui/       # API OpenAI-compatible + uploads
│   │   ├── health/          # Health checks granulares
│   │   └── storage/         # Artifacts + limpeza de temp
│   └── prisma/              # Schema e migrations
├── media-worker/            # Worker Python (providers OCR/layout/VLM)
├── docs/                    # Documentação indexável pelo RAG
├── scripts/                 # Scripts de desenvolvimento
├── test-assets/images/      # Imagens de teste do pipeline
├── storage/                 # Dados em runtime (não versionados)
│   ├── uploads/
│   ├── projects/
│   ├── media/images/        # originals, thumbnails, processed, contexts
│   ├── memory/              # exports, imports, backups (portabilidade)
│   ├── archive/             # cold archive de memória profunda
│   └── artifacts/           # outputs completos de tools
├── docker-compose.yml
└── .env.example
```

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- [Ollama](https://ollama.com/) no host
- Modelo baixado, por exemplo:

```bash
ollama pull qwen2.5:7b
```

> O backend funciona sem Ollama (fallback técnico), mas respostas ficam limitadas.

---

## Performance-first runtime

Este projeto é **local-first** e **leve por padrão**: usa pouca RAM em idle e escala processamento só quando necessário.

- **API NestJS** (`APP_ROLE=api` no host) — HTTP, contexto, orquestração; **não** executa jobs pesados
- **Workers BullMQ** (`worker-all` no Docker) — indexação, embeddings, orchestrator, memória
- **Redis** — filas + working memory (maxmemory configurável)
- **Postgres** — tuning conservador por perfil de RAM
- **LLM** — fora do Docker (Ollama nativo) para melhor uso de GPU/RAM

### Por que workers?

Tarefas CPU-intensivas **não rodam no processo da API**. O backend enfileira e workers separados consomem jobs — o chat continua responsivo.

| Worker | Fila | Env |
|--------|------|-----|
| orchestrator | `orchestrator-jobs` | `JOBS_ORCHESTRATOR_CONCURRENCY` |
| indexing | `file-index` | `JOBS_INDEXING_CONCURRENCY` |
| embeddings | `embeddings` | `JOBS_EMBEDDINGS_CONCURRENCY` |
| memory | `memory-jobs` | `JOBS_MEMORY_CONCURRENCY` |
| media (Python) | HTTP :5000 | container `media-worker` |

### Perfis de hardware (RAM do sistema)

| Perfil | RAM | Arquivo |
|--------|-----|---------|
| `lite` | 8 GB | `.env.example.lite` |
| `balanced-low` | 16 GB | `.env.example.balanced-low` |
| `balanced` | 32 GB+ | `.env.example.balanced` |
| `performance` | 64 GB+ | `.env.example.performance` |

> Esses perfis ajustam concorrência de workers, memória do Postgres/Redis e limites de contexto (`MAX_CONTEXT_TOKENS`, `RAG_TOP_K`, etc.) — é o consumo da stack (backend + Postgres + Redis + workers), **não** inclui a VRAM/memória usada pelo próprio LLM, que roda fora do Docker via Ollama nativo no host.

### GPU e escolha de modelo

O Ollama roda nativo no host (não em container) justamente para acessar a GPU diretamente. A tabela abaixo é uma recomendação geral por VRAM disponível (quantização `Q4_K_M`, o padrão do `ollama pull`) — não é um número medido neste projeto, é o ponto de partida razoável para cada faixa:

| VRAM da GPU | Modelo sugerido | Observação |
|---|---|---|
| 4–6 GB | `qwen2.5:3b` ou `llama3.2:3b` | Tool-calling funcional; modelo pequeno, respostas mais simples |
| 8 GB | `qwen2.5:7b` | Bom equilíbrio custo/qualidade para o loop de tools |
| 10–12 GB | `qwen2.5:14b` ou `qwen3:14b` (default do `.env.example`) | Melhor raciocínio para código/análise de projeto |
| 16 GB | `qwen3:14b` com mais contexto (`MAX_CONTEXT_TOKENS` maior) | Mesmo modelo do tier anterior, com folga |
| 24 GB | `qwen2.5:32b` ou `qwen3:32b` | Só compensa se a placa tiver ~24 GB livres só para o Ollama |
| 48 GB+ (ex. profissional, ou 2 GPUs) | `qwen2.5:72b` ou `llama3.3:70b` | Fora do alcance da maioria dos setups domésticos |

GPUs AMD (ROCm) seguem a mesma lógica de VRAM da tabela acima — o Ollama suporta ROCm, mas é menos maduro que CUDA (mais chance de precisar ajustar `HSA_OVERRIDE_GFX_VERSION` dependendo do modelo da placa).

### Apple Silicon (MacBooks M1/M2/M3/M4)

Macs com chip Apple não têm VRAM separada — usam **memória unificada**, compartilhada entre CPU e GPU, e o Ollama já acelera via Metal automaticamente (não é um cenário CPU-only, mesmo sem GPU dedicada). Regra prática: reserve uns 6–8 GB para o macOS e os demais apps, e trate o restante como "VRAM disponível" na tabela anterior:

| Memória unificada | Modelo sugerido |
|---|---|
| 8 GB | `qwen2.5:3b` — no limite; espere lentidão rodando o resto da stack junto |
| 16 GB | `qwen2.5:7b` |
| 24 GB | `qwen2.5:14b` ou `qwen3:14b` |
| 32 GB+ | `qwen3:14b` com folga, ou `qwen2.5:32b` com paciência |
| 64 GB+ (M-Max/M-Ultra) | `qwen2.5:32b` ou `llama3.3:70b` |

### Sem GPU dedicada (CPU-only)

Sem GPU (Mac Intel antigo, notebook sem placa dedicada, VM sem passthrough), o Ollama roda inteiramente na CPU — funciona, mas fica bem mais lento, e isso pesa mais neste projeto porque o orquestrador faz **múltiplas chamadas de tool por turno** (cada uma é uma nova inferência). Priorize um modelo pequeno e rápido em vez de um modelo "melhor" e lento:

- **Recomendado:** `qwen2.5:3b-instruct` ou `llama3.2:3b` — suporte a tool-calling razoável no Ollama e velocidade tolerável em CPU moderna (com AVX2).
- **Evite** `qwen3:14b`/`qwen2.5:7b`+ em CPU-only: tecnicamente roda, mas cada ciclo do loop de tools (até `COGNITIVE_MAX_CYCLES` vezes por turno) pode levar minutos, o que inviabiliza o fluxo "tenta antes de perguntar" na prática.
- Se mesmo um modelo de 3B estiver lento demais, `qwen2.5:1.5b` é a opção mais leve disponível — mas espere mais falhas de tool-calling, já que modelos muito pequenos seguem pior o schema de function-calling.

### Custo extra do media-worker

Os números acima cobrem só o LLM de chat. Habilitar processamento de imagem mais pesado no build do `media-worker` (`INSTALL_OCR=true` para PaddleOCR, `INSTALL_DOCLING=true`, `INSTALL_VISION=true`) adiciona RAM ao container `media-worker` (PaddleOCR/PaddlePaddle, Docling, torch/transformers), independente do perfil de hardware escolhido acima — o build mínimo (só Tesseract) é bem mais leve e é o padrão do `docker-compose.yml`. Em hardware já no limite do perfil `lite`/`balanced-low`, prefira manter o build mínimo e `MEDIA_ENABLE_VLM=false`/`MEDIA_ENABLE_DOCLING=false`.

### Resource Guard

Jobs de baixa prioridade (decay, export, backup) são adiados quando RAM/CPU excedem limites.

```bash
curl http://localhost:3001/health/resources
```

---

## Acesso ao filesystem local

Por padrão, as tools de filesystem só acessam o `root_path` do projeto (`/storage/projects/...`). Isso é intencional — o assistente não deve ler seu computador inteiro sem configuração explícita.

### Modos suportados

| Modo | Descrição | Melhor para |
|------|-----------|-------------|
| `disabled` | Apenas storage do projeto | Máximo isolamento |
| `docker-mounted` | Pastas do host montadas como volumes Docker | Stack Docker segura |
| `native` | Backend no host acessa paths reais (`C:\`, `/home/...`) | Desenvolvimento local |
| `host-agent` | Agente nativo futuro (stub) | Produto avançado |

Arquivos de exemplo: `.env.example.native`, `.env.example.docker-mounted`, `.env.example.filesystem-safe`.

### Docker-mounted (recomendado com Docker)

Monte pastas específicas (evite drive inteiro com escrita):

```bash
docker compose -f docker-compose.yml -f docker-compose.filesystem.yml up -d
```

Configure `HOST_FILESYSTEM_MOUNTS_JSON` para mapear host → container:

```text
/home/zero/Documents  →  /host/home/Documents
```

Teste de acesso:

```bash
curl -X POST http://localhost:3001/filesystem/test-access \
  -H 'Content-Type: application/json' \
  -d '{"path":"/home/zero","operation":"list"}'
```

### Segurança

- Leitura ampla pode ser permitida em paths não sensíveis
- **Escrita e deleção exigem aprovação** por padrão (`HOST_FILESYSTEM_REQUIRE_APPROVAL_FOR_WRITE=true`)
- Paths sensíveis bloqueados: `.env`, `.ssh`, `AppData`, `/etc`, etc.

API: `GET /filesystem/mode`, `POST /filesystem/test-access`, `GET /filesystem/permissions`

---

## Início rápido

### Cenário recomendado: backend no Windows + infra no Docker

**1. Docker (projeto `my_llm`):**

```bash
cp .env.example .env
./scripts/native-up.sh
# ou: docker compose up -d --build
```

Sobe: postgres, redis, open-webui, media-worker, worker-all.

**2. Backend no Windows** (`backend/`):

```bash
copy .env.example.windows-native .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Use `APP_ROLE=api` no `.env` do backend (workers rodam no Docker).  
Open WebUI aponta para `http://host.docker.internal:3001/v1`.

### Cenário alternativo: tudo no Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose --profile docker-backend up -d backend
```

### Scripts

```bash
./scripts/native-up.sh       # infra + UI (sem backend container)
./scripts/openwebui-up.sh    # mesmo que native-up
./scripts/media-up.sh        # rebuild + infra completa
./scripts/dev-down.sh        # para containers
```

> Migrations com backend no host: rode `npx prisma migrate deploy` em `backend/`.  
> Com backend no Docker: `./scripts/db-migrate.sh`

### 4. Ollama no host

```bash
ollama serve
```

### 5. Open WebUI

http://localhost:3080 → **Admin → Connections → OpenAI API**

| Campo | Valor |
|-------|-------|
| Base URL | `http://localhost:3001/v1` |
| API Key | `local-dev-key` |

### 6. Validar

```bash
curl http://localhost:3001/health          # status agregado (db, redis, llm, media)
curl http://localhost:3001/v1/models
curl http://localhost:5000/health            # providers do media-worker

# Health "degraded" com llm: unavailable é normal se Ollama não estiver rodando no host

# Após migrations de memória estratificada:
curl -X POST http://localhost:3001/memory/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"00000000-0000-4000-8000-000000000001","query":"arquitetura"}'
```

---

## URLs de desenvolvimento

| Serviço | URL |
|---------|-----|
| Open WebUI | http://localhost:3080 |
| Backend API | http://localhost:3001 |
| Health (agregado) | http://localhost:3001/health |
| Health DB / Redis / LLM / Media | http://localhost:3001/health/{db,redis,llm,media-worker,storage} |
| Health recursos / filas / workers | http://localhost:3001/health/{resources,queues,workers} |
| Aprovações | http://localhost:3001/approvals |
| Media Worker | http://localhost:5000/health |

---

## API principal

| Endpoint | Descrição |
|----------|-----------|
| `GET /v1/models` | Modelos lógicos |
| `POST /v1/chat/completions` | Chat (streaming) |
| `POST /v1/files` | Upload; imagens → pipeline de mídia |
| `POST /orchestrator/chat` | Chat via orquestrador (com debug) |
| `GET /orchestrator/events/project/:id` | Eventos paginados |
| `GET /jobs/project/:id` | Jobs paginados |
| `POST /tools/approve/:id` | Aprovar tool |
| `GET /rag/search?projectId=&q=` | Busca RAG |
| `GET /security/audit/project/:id` | Auditoria paginada |
| `GET /memories/project/:id` | Memórias paginadas |
| `GET /files/project/:id` | Arquivos indexados paginados |
| `POST /media/upload` | Upload direto de imagem |
| `GET /media/:id` | Resultado (`?includeMarkdown=true`) |
| `POST /media/:id/promote` | Promove para conhecimento do projeto |
| `POST /storage/cleanup` | Limpa temp e artifacts antigos |
| `POST /memory/export` | Export ZIP (profiles: minimal, portable, full) |
| `POST /memory/import` | Import ZIP (`mode`: new_project, merge, replace) |
| `POST /memory/import/validate` | Valida manifest/checksums |
| `GET /memory/exports` | Lista exports/backups |
| `POST /memory/backups/create` | Backup full do projeto |
| `POST /memory/retrieve` | Busca nas camadas de memória |
| `POST /memory/decay/run` | Executa envelhecimento recent→deep→archive |

### Memória em camadas

| Camada | Storage | Uso |
|--------|---------|-----|
| Working | Redis (TTL) | Objetivo/plano/job ativo |
| Recent | Postgres | Fatos recentes não consolidados |
| Consolidated | `memories` | Decisões confirmadas |
| Deep | Postgres + storage | Histórico recuperável sob demanda |
| Cold Archive | `storage/archive/` | Snapshots compactados |

CLI: `npm run memory:export`, `memory:import`, `memory:backup`, `memory:validate` (em `backend/`).

### Tools de mídia

| Tool | Descrição |
|------|-----------|
| `process_image` | Dispara/reprocessa análise (`mode`, `enableVlm`) |
| `search_media` | Busca por OCR, tags, resumo |
| `get_media_result` | JSON/markdown/blocks configuráveis |
| `promote_media_to_project` | Promove asset (requer aprovação) |
| `index_media_context` | Indexa `image_context.md` no RAG (requer aprovação) |

---

## Modelos lógicos

O backend expõe modelos lógicos — o Open WebUI não precisa conhecer o modelo físico do Ollama.

| Modelo | Uso |
|--------|-----|
| `local-assistant` | Assistente geral |
| `local-coder` | Código e projeto |
| `local-fast` | Respostas rápidas |

Configuração: `OPENWEBUI_LOGICAL_MODELS` e `OPENWEBUI_API_KEY_PROJECT_MAP` no `.env`.

---

## Segurança

| Controle | Descrição |
|----------|-----------|
| `execution_mode` | `safe` / `developer` / `autonomous` por projeto |
| Filesystem | PathGuard + modos native/docker-mounted/disabled |
| Aprovação | Escrita/shell/delete ficam `pending` em `/approvals` |
| Grants | Permitir uma vez / conversa / path (com TTL) |
| Shell | Desabilitado por padrão (`ALLOW_SHELL_COMMANDS=false`) |
| Imagens | Limites de tamanho; RAG exige confirmação |
| Auditoria | Toda tool gera log em `tool_audit_logs` |

### Agentic tool use and approvals

O backend controla toda execução de tools.

- **Read-only** (list, read, search, git status, RAG…) pode auto-executar quando a Permission Engine permitir.
- **Escrita, delete, shell, patch, restore** exigem aprovação explícita.
- O Open WebUI só exibe a conversa; a lógica de permissão fica no backend.

Quando o assistente precisa de permissão, responde com um card markdown e link:

```text
http://localhost:3001/approvals
```

Opções: permitir uma vez · sempre nesta conversa · sempre neste caminho · negar.

### Why not use Open WebUI tools directly?

O Open WebUI é só a interface. O backend é a fonte de verdade para memória, RAG, filesystem, tools, approvals e audit logs — evitando duplicar segurança no frontend.

---

## Scripts úteis

```bash
./scripts/native-up.sh       # postgres + redis + open-webui + media-worker + worker-all
./scripts/openwebui-up.sh    # alias do native-up
./scripts/media-up.sh        # rebuild + stack completa (sem backend)
./scripts/dev-up.sh          # legado — preferir native-up
./scripts/dev-down.sh        # para containers
./scripts/db-migrate.sh      # migrations (backend no Docker)
./scripts/seed.sh            # usuário e projeto padrão (backend no Docker)
```

---

## Configuração

### LLM

```env
LLM_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=qwen3:14b
LLM_TIMEOUT_MS=120000
```

### Contexto e orquestrador

```env
MAX_CONTEXT_TOKENS=24000
CONTEXT_MAX_RECENT_TOKENS=3000
CONTEXT_SKIP_RAG_CASUAL=true
COGNITIVE_MAX_CYCLES=8
COGNITIVE_DEBUG=false
```

### Mídia

```env
MEDIA_DEFAULT_PROCESSING_MODE=balanced
MEDIA_OCR_PRIMARY=paddleocr
MEDIA_ENABLE_PADDLEOCR=false          # true após build com INSTALL_OCR
MEDIA_ENABLE_TESSERACT_FALLBACK=true
MEDIA_ENABLE_PP_STRUCTURE=false
MEDIA_ENABLE_DOCLING=false
MEDIA_ENABLE_VLM=false
MEDIA_REQUIRE_CONFIRMATION_TO_INDEX=true
```

### Memória estratificada

```env
MEMORY_RECENT_TTL_DAYS=30
MEMORY_RETRIEVAL_ENABLE_DEEP=true
MEMORY_EXPORT_DEFAULT_PROFILE=portable
MEMORY_IMPORT_DEFAULT_MODE=new_project
MEMORY_IMPORT_AUTO_REEMBED=true
MEMORY_STORAGE_ROOT=/storage/memory
```

CLI (dentro de `backend/`):

```bash
npm run memory:export -- --project 00000000-0000-4000-8000-000000000001 --profile portable
npm run memory:import -- ./export.zip --mode new_project
npm run memory:backup -- --project 00000000-0000-4000-8000-000000000001
```

Lista completa em `.env.example`.

---

## Perfis Docker

A stack base sobe **postgres**, **redis**, **open-webui**, **media-worker** e **worker-all** (projeto Docker: `my_llm`). Backend no Docker é opcional (`--profile docker-backend`).

```bash
docker compose up -d   # setup completo (sem backend container)
docker compose --profile workers-split up -d   # workers separados por tipo
docker compose --profile qdrant up -d          # vetores alternativos
docker compose --profile docker-backend up -d backend   # backend no Docker
```

| Profile | Serviço |
|---------|---------|
| *(padrão)* | postgres, redis, open-webui, media-worker, worker-all |
| `docker-backend` | Backend NestJS no Docker (opcional) |
| `workers-split` | worker-orchestrator, indexing, embeddings, memory |
| `qdrant` | Qdrant |

> **Backend no Windows:** `./scripts/native-up.sh` + `backend/.env.example.windows-native`.  
> Open WebUI → `http://host.docker.internal:3001/v1`. Backend usa `localhost:5432`, `localhost:6379`, `APP_ROLE=api`.

---

## Otimização

O projeto aplica otimizações locais por padrão:

- **Cache RAG** por hash + modelo de embedding + config de chunks
- **Cache de imagens** por hash + mode + providers
- **Context budget** com truncamento inteligente de camadas
- **Resource Guard** — adia jobs low-priority sob pressão de RAM/CPU
- **Filas separadas** (`orchestrator-jobs`, `media-processing`, `memory-jobs`, `file-index`, `embeddings`) com concorrência por perfil
- **Artifacts** para outputs grandes de tools (`storage/artifacts/`)
- **Health degradado** — LLM ou media-worker off não derrubam o backend

---

## Limitações atuais

- Áudio e vídeo ainda não implementados (imagens já suportadas)
- App nativo / notificações de sistema
- Multi-usuário em produção
- PaddleOCR/Docling exigem rebuild do worker (não vêm no build mínimo)
- `GET /health` retorna `degraded` quando Ollama está off — demais serviços continuam operacionais

---

## Troubleshooting Docker

| Sintoma | Solução |
|---------|---------|
| Backend com erros TS (`recentMemoryItem` etc.) | `docker compose exec backend npx prisma generate && docker compose restart backend` |
| `adm-zip` não encontrado | `docker compose exec backend npm install` |
| Migration pendente | `./scripts/db-migrate.sh` |
| Media-worker unhealthy | `docker compose up -d --build media-worker` |
| LLM unavailable no health | Inicie Ollama no host: `ollama serve` |

---

## Documentação complementar

A pasta `docs/` contém material de referência (arquitetura, tools, decisões) também indexável pelo RAG do projeto:

- `docs/architecture.md`
- `docs/tools.md`
- `docs/decisions.md`

---

## Licença

Consulte `LICENSE` na raiz do repositório.

---

## Contribuindo

Issues e pull requests são bem-vindos. Mantenha o fluxo oficial: **Open WebUI → Backend → Orquestrador → Contexto/Tools → LLM**. Não conecte o Open WebUI diretamente ao Ollama.
