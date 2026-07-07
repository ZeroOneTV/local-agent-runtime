# Local AI Assistant

Assistente de IA **local e privado** que combina uma interface de chat moderna com um backend orquestrador. Em vez de conectar o chat diretamente ao modelo de linguagem, este projeto trata a LLM como **um componente** dentro de um sistema maior — com contexto, memória, busca em documentos (RAG), ferramentas, segurança, tarefas longas e processamento de imagens.

Ideal para quem quer um assistente estilo ChatGPT/Claude, mas rodando na própria máquina, com controle total sobre dados, permissões e fluxo de execução.

---

## O que este projeto faz

| Você obtém | Como funciona |
|------------|---------------|
| Chat com interface familiar | [Open WebUI](https://github.com/open-webui/open-webui) como frontend |
| Respostas contextualizadas | O backend monta contexto em camadas antes de chamar a LLM |
| Conhecimento do seu projeto | RAG indexa documentos e código; memórias guardam decisões permanentes |
| Análise de imagens | OCR, layout e resumo semântico via worker Python; contexto injetado no chat |
| Ações no projeto | Tools leem arquivos, inspecionam estrutura, consultam Git etc. |
| Segurança por padrão | Tools sensíveis exigem aprovação; tudo é auditado |
| Tarefas demoradas | Jobs longos rodam em background (indexação, análise, reindexação) |

**Regra central:** o frontend **nunca** fala direto com o Ollama. Toda mensagem passa pelo backend, que decide o que fazer antes de chamar o modelo.

```text
Open WebUI  →  Backend (/v1)  →  Orquestrador  →  Contexto / RAG / Mídia / Tools  →  LLM local
```

---

## Por que não conectar o chat direto à LLM?

Se o Open WebUI (ou qualquer frontend) conversar direto com o Ollama, você perde:

- Montagem inteligente de contexto
- Memória e RAG do projeto
- Processamento estruturado de imagens (OCR, layout, `image_context.md`)
- Execução controlada de ferramentas
- Aprovação humana para ações perigosas
- Auditoria e logs de segurança
- Jobs longos e eventos de progresso

Este projeto existe para ser um **runtime de assistente cognitivo**, não apenas um proxy de chat.

---

## Arquitetura

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Windows / Linux (host)                                              │
│  ┌──────────────────┐                                                │
│  │ Ollama (nativo)  │  http://localhost:11434                        │
│  └────────▲─────────┘                                                │
│           │ host.docker.internal                                     │
│  ┌────────┴──────────────────────────────────────────────────────┐   │
│  │ Docker Compose                                                 │   │
│  │                                                                │   │
│  │  Open WebUI :3080 ──► Backend NestJS :3001                     │   │
│  │                            │                                   │   │
│  │              ┌─────────────┼─────────────┐                     │   │
│  │              ▼             ▼             ▼                     │   │
│  │         PostgreSQL     Redis        storage/                   │   │
│  │         + pgvector    + BullMQ      (uploads, media, projects) │   │
│  │                                                                │   │
│  │  media-worker :5000  ◄── OCR / thumbnails (profile media)     │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Função | Porta |
|------------|--------|-------|
| **Open WebUI** | Interface de chat (recomendado) | 3080 |
| **Backend NestJS** | Orquestrador, API, tools, RAG, mídia, segurança | 3001 |
| **PostgreSQL + pgvector** | Dados, embeddings, histórico oficial | 5432 |
| **Redis + BullMQ** | Filas e jobs assíncronos | 6379 |
| **Ollama** | LLM local (fora do Docker) | 11434 |
| **Media Worker** | OCR, thumbnails e JSON estruturado de imagens (opcional) | 5000 |
| **Frontend Next.js** | UI legada (opcional, profile `frontend`) | 3000 |
| **Qdrant** | Vetores alternativos (opcional, profile `qdrant`) | 6333 |

---

## Fluxo de uma mensagem

Exemplo: *"Analise a estrutura deste projeto e diga se a arquitetura está coerente."*

1. **Usuário** envia mensagem no Open WebUI.
2. **Open WebUI** chama `POST /v1/chat/completions` no backend (API compatível com OpenAI).
3. **Backend** identifica o projeto (via modelo lógico ou API key) e salva a mensagem.
4. **Orquestrador cognitivo** classifica a intenção (ex.: discussão de arquitetura).
5. **Planner** monta um plano de etapas, se necessário.
6. **Execution loop** executa tools read-only automaticamente (`inspect_structure`, `detect_stack`, `search_rag`…).
7. **Context Engine** monta o prompt em camadas:
   - instruções do sistema
   - configuração do projeto
   - resumo da conversa
   - histórico recente
   - memórias relevantes
   - chunks RAG
   - contexto de mídia (imagens recentes da conversa)
   - resultados de tools
   - mensagem atual
8. **LLM local** gera a resposta (ou o backend usa fallback se o Ollama estiver off).
9. **Backend** salva a resposta, sugere memórias se aplicável, emite eventos e devolve ao Open WebUI.

### Upload de imagens

Quando o usuário envia uma imagem via `POST /v1/files`:

1. O backend detecta o MIME/extensão e **não** indexa como texto.
2. Salva o original em `storage/media/images/originals/`.
3. Enfileira job `process_image` na fila `media-processing`.
4. O **media-worker** (Python) executa OCR, gera thumbnail e retorna JSON estruturado.
5. O backend persiste resultados, gera `image_context.md` e injeta resumo no Context Engine.
6. A imagem **não entra no RAG automaticamente** — o usuário promove via tool ou aprovação.

### Tools sensíveis

Ações como `write_file`, `apply_patch`, `promote_media_to_project` ou `index_media_context` criam uma solicitação `pending`. O usuário aprova via chat, API ou página `/approvals`.

### Tarefas longas

Pedidos como *"indexe todo o projeto"* criam um **job** em background. O worker processa, emite eventos de progresso e conclui com resultado persistido.

---

## Estrutura do repositório

```text
my_llm/
├── backend/                 # API NestJS (núcleo do sistema)
│   ├── src/
│   │   ├── orchestrator/    # Orquestrador cognitivo
│   │   ├── context/         # Motor de contexto e resumos
│   │   ├── rag/             # Indexação e busca vetorial
│   │   ├── memory/          # Memórias permanentes do projeto
│   │   ├── tools/           # Sistema de ferramentas
│   │   ├── media/           # Pipeline de imagens (upload, jobs, RAG)
│   │   ├── security/        # Permissões, políticas, auditoria
│   │   ├── jobs/            # Workers de tarefas longas
│   │   ├── openwebui/       # Integração OpenAI-compatible + uploads
│   │   ├── conversations/   # Conversas e mensagens
│   │   └── llm/             # Cliente Ollama
│   └── prisma/              # Schema e migrations
├── media-worker/            # Worker Python (OCR, Pillow, Tesseract)
├── docs/                    # Documentação do projeto (também usada pelo RAG)
├── mds/                     # Especificações de arquitetura (design docs)
├── scripts/                 # Scripts de desenvolvimento
├── storage/                 # Dados em runtime (não versionados)
│   ├── uploads/             # Uploads genéricos
│   ├── projects/            # Arquivos de projeto (root_path)
│   └── media/images/        # originals, thumbnails, processed, contexts
├── docker-compose.yml
└── .env.example
```

> A pasta `frontend/` (Next.js legado) não está no repositório por padrão. Use o profile `frontend` no Docker Compose se adicioná-la localmente.

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- [Ollama](https://ollama.com/) instalado no host (Windows, Linux ou macOS)
- Modelo baixado, por exemplo:

```bash
ollama pull qwen2.5:7b
# ou o modelo definido em LLM_MODEL no .env
```

> **Nota:** o backend funciona sem Ollama (modo fallback), mas as respostas serão limitadas até a LLM estar ativa.

---

## Início rápido

### 1. Configurar ambiente

```bash
cp .env.example .env
# Ajuste LLM_MODEL, senhas etc. se necessário
```

### 2. Subir a stack

**Com Open WebUI (recomendado):**

```bash
./scripts/openwebui-up.sh
```

**Com Open WebUI + processamento de imagens:**

```bash
WITH_OPENWEBUI=1 ./scripts/media-up.sh
# ou manualmente:
docker compose --profile openwebui --profile media up -d --build
```

**Apenas backend + serviços base (postgres, redis):**

```bash
./scripts/dev-up.sh
```

### 3. Iniciar o Ollama (no host)

```bash
ollama serve
```

### 4. Configurar o Open WebUI

Acesse http://localhost:3080 e, em **Admin → Settings → Connections → OpenAI API**:

| Campo | Valor |
|-------|-------|
| Base URL | `http://localhost:3001/v1` |
| API Key | `local-dev-key` |

Selecione um modelo lógico: `local-assistant`, `local-coder` ou `local-fast`.

### 5. Validar

```bash
curl http://localhost:3001/health
curl http://localhost:3001/v1/models

# Com profile media ativo:
curl http://localhost:5000/health
```

---

## URLs de desenvolvimento

| Serviço | URL |
|---------|-----|
| Open WebUI | http://localhost:3080 |
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Aprovações de tools | http://localhost:3001/approvals |
| Media Worker | http://localhost:5000/health (profile `media`) |
| Frontend legado | http://localhost:3000 (profile `frontend`) |

---

## API principal

O backend expõe uma API **compatível com OpenAI** para integração com Open WebUI e outros clientes.

| Endpoint | Descrição |
|----------|-----------|
| `GET /v1/models` | Lista modelos lógicos disponíveis |
| `POST /v1/chat/completions` | Chat (com suporte a streaming) |
| `POST /v1/files` | Upload de arquivos; imagens vão para o pipeline de mídia |
| `POST /orchestrator/chat` | Chat direto via orquestrador |
| `GET /orchestrator/events/project/:id` | Eventos de tarefas, tools e mídia |
| `POST /tools/approve/:id` | Aprovar execução de tool |
| `POST /tools/reject/:id` | Rejeitar execução de tool |
| `GET /rag/search?projectId=&q=` | Busca RAG |
| `GET /security/audit/project/:id` | Logs de auditoria |
| `POST /media/upload` | Upload direto de imagem |
| `GET /media/:id` | Resultado estruturado de uma imagem |
| `GET /media?projectId=&query=` | Busca em imagens processadas |
| `POST /media/:id/promote` | Promove imagem para conhecimento do projeto |
| `POST /media/:id/index` | Indexa `image_context.md` no RAG |

### Tools de mídia

| Tool | Descrição |
|------|-----------|
| `process_image` | Dispara/reprocessa OCR e análise de uma imagem |
| `search_media` | Busca por OCR, tags e resumo semântico |
| `get_media_result` | Retorna JSON estruturado completo |
| `promote_media_to_project` | Promove para asset do projeto (requer aprovação) |
| `index_media_context` | Indexa `image_context.md` no RAG (requer aprovação) |

Documentação detalhada de arquitetura: pasta `mds/` e `docs/`.

---

## Modelos lógicos

O backend expõe **modelos lógicos**, não os modelos físicos do Ollama. Isso permite trocar o modelo interno sem reconfigurar o frontend.

| Modelo lógico | Uso sugerido |
|---------------|--------------|
| `local-assistant` | Assistente geral |
| `local-coder` | Tarefas de código |
| `local-fast` | Respostas rápidas |

Cada modelo pode ser associado a um `projectId` via variáveis `OPENWEBUI_LOGICAL_MODELS` e `OPENWEBUI_API_KEY_PROJECT_MAP` no `.env`.

---

## Segurança

- **Modo de execução por projeto:** `safe` (só leitura), `developer` (escrita com aprovação), `autonomous` (mais permissivo).
- **root_path:** tools só acessam arquivos dentro do diretório do projeto.
- **Shell desabilitado por padrão** (`ALLOW_SHELL_COMMANDS=false`).
- **Imagens:** limite de tamanho/dimensões; indexação no RAG exige confirmação (`MEDIA_REQUIRE_CONFIRMATION_TO_INDEX=true`).
- **Auditoria:** toda execução de tool gera log em `tool_audit_logs`.
- **Aprovação:** tools de escrita/execução ficam `pending` até aprovação explícita.

---

## Scripts úteis

```bash
./scripts/dev-up.sh          # Sobe backend, postgres, redis
./scripts/openwebui-up.sh    # Sobe stack base + Open WebUI
./scripts/media-up.sh        # Sobe media-worker (use WITH_OPENWEBUI=1 para incluir Open WebUI)
./scripts/dev-down.sh        # Para os containers
./scripts/db-migrate.sh      # Aplica migrations Prisma
./scripts/seed.sh            # Seed do banco (usuário e projeto padrão)
```

---

## Configuração da LLM

O backend em Docker acessa o Ollama no host via:

```env
LLM_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=qwen3:14b
```

No Linux sem `host.docker.internal`, use o IP da máquina host ou configure `extra_hosts` no `docker-compose.yml` (já incluso para WSL2).

---

## Configuração de mídia

Variáveis principais (ver `.env.example`):

```env
MEDIA_STORAGE_ROOT=/storage/media
MEDIA_WORKER_URL=http://media-worker:5000
MEDIA_MAX_IMAGE_SIZE_MB=25
MEDIA_DEFAULT_PROCESSING_MODE=balanced
MEDIA_ENABLE_VLM=false
MEDIA_REQUIRE_CONFIRMATION_TO_INDEX=true
```

O worker usa **Tesseract** por padrão (leve). PaddleOCR e VLM podem ser habilitados em builds futuros do `media-worker`.

---

## Perfis Docker

Serviços opcionais são ativados por **profile**. A stack base (`backend`, `postgres`, `redis`) sobe sem profiles.

```bash
# Open WebUI (frontend de chat)
docker compose --profile openwebui up -d

# Processamento de imagens
docker compose --profile media up -d

# Open WebUI + imagens (setup completo recomendado)
docker compose --profile openwebui --profile media up -d

# Qdrant (vetores alternativos ao pgvector)
docker compose --profile qdrant up -d

# Frontend Next.js legado (requer pasta frontend/ local)
docker compose --profile frontend up -d
```

| Profile | Serviço | Quando usar |
|---------|---------|-------------|
| `openwebui` | Open WebUI | Chat com interface familiar |
| `media` | media-worker | Upload e análise de imagens |
| `qdrant` | Qdrant | Vetores fora do pgvector |
| `frontend` | Next.js legado | UI alternativa local |

---

## O que este projeto **não** é (ainda)

- Multimodal completo (áudio e vídeo) — imagens já suportadas; áudio/vídeo planejados
- App nativo Windows / notificações de sistema
- Multi-usuário em produção
- Substituto do Open WebUI para gerenciar modelos localmente

---

## Documentação adicional

| Pasta | Conteúdo |
|-------|----------|
| `docs/` | Visão prática: arquitetura, tools, RAG, segurança |
| `mds/` | Especificações completas de cada camada (design docs) |

Ordem sugerida de leitura em `mds/`:

1. `01-database-schema.md` — modelo de dados
2. `02-chat-context-engine.md` — motor de contexto
3. `03-memory-rag.md` — memória e RAG
4. `04-tool-system.md` — ferramentas
5. `05-security-permissions.md` — segurança
6. `06-cognitive-orchestrator.md` — orquestrador
7. `07-frontend-open-webui-integration.md` — integração Open WebUI
8. `08-project-execution-flow.md` — fluxo operacional completo
9. `09-media-processing-images.md` — pipeline de imagens (OCR, contexto, RAG)

---

## Licença

Consulte o arquivo `LICENSE` na raiz do repositório (se aplicável).

---

## Contribuindo

Issues e pull requests são bem-vindos. Antes de contribuir, leia `mds/08-project-execution-flow.md` para entender o fluxo oficial do sistema e manter a arquitetura consistente.
