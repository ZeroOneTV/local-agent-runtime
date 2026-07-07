# Arquitetura

## Fluxo oficial Open WebUI → LLM

O fluxo oficial do assistente local é:

```text
Open WebUI
    ↓
Backend NestJS /v1 (OpenAI-compatible)
    ↓
Cognitive Orchestrator
    ↓
Context Engine / Memory / RAG / Tools / Security
    ↓
LLM local (Ollama)
    ↓
Resposta ao Open WebUI
```

O Open WebUI **não** deve conversar diretamente com o Ollama. O backend é o centro do sistema.

## Componentes

- **Open WebUI**: interface de chat (porta 3080)
- **Backend NestJS**: orquestrador central (porta 3001)
- **PostgreSQL + pgvector**: persistência e vetores
- **Redis + BullMQ**: filas e jobs longos
- **LLM local**: Ollama nativo no Windows (`http://host.docker.internal:11434`)

## Stack

- NestJS, Prisma, PostgreSQL, pgvector
- Open WebUI como frontend
- Cognitive Orchestrator para decisões de fluxo
- Context Engine com 8 camadas de contexto
