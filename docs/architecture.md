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
- Open WebUI como interface de chat
- Cognitive Orchestrator para decisões de fluxo
- Context Engine com 8 camadas de contexto

## Política do loop cognitivo (autonomia)

O orquestrador opera um loop iterativo com orçamento limitado por `.env`
(`COGNITIVE_MAX_CYCLES`, `COGNITIVE_MAX_CONSECUTIVE_TOOLS`,
`AUTO_TOOL_MAX_CALLS_PER_TURN`, `AUTO_TOOL_MAX_CHAIN_DEPTH`). A política de
comportamento **dentro** desse orçamento é:

### Dois tipos de incerteza (decisão de produto)

- **Incerteza de informação** — "não sei onde está o arquivo / ainda não tenho
  a resposta". Resolve-se com **mais exploração autônoma** usando tools
  read-only (que não exigem aprovação), dentro do orçamento. O agente *tenta
  antes de perguntar*. Só pergunta ao usuário quando o orçamento se esgota **e**
  ainda há ambiguidade real.
- **Incerteza de permissão** — a ação é sensível (escrita/shell/delete). Aqui
  `AGENTIC_DENY_ON_PERMISSION_UNCERTAINTY=true` continua valendo: **nega/pergunta,
  não tenta "só para ver"**. Autonomia maior é só para exploração read-only.

Essa distinção é deliberada: incerteza de *informação* empurra para tentar de
novo; incerteza de *permissão* empurra para pedir aprovação.

### O que a "reflection" decide (a cada ciclo)

Perguntas estruturadas que o LLM responde por ciclo (não heurística fixa):

1. A informação que já tenho responde à pergunta do usuário?
2. Se não: qual é a próxima tool/parâmetro que vale tentar (outro caminho de
   arquivo, reformular a busca, outra tool)?
3. Se o orçamento de ciclos esgotou e ainda não há resposta: formular uma
   pergunta **específica** ao usuário — ex.: "Encontrei 3 arquivos `config` em
   `src/`, `config/` e `scripts/` — qual deles?", nunca genérica.

### Ao atingir os limites de ciclo

Sempre retornar ao usuário um **resumo do que foi tentado** ("tentei X, Y, Z e
não encontrei — pode me dizer onde fica?"), nunca erro técnico cru nem silêncio.

> Dependência: a "tentativa automática de outra estratégia" só é robusta com
> tool-calling nativo no backend (ver `backend/AGENT_LOOP_REFACTOR.md`). Sem
> isso, vira regex disfarçado. Esta seção documenta a política-alvo; a
> implementação plena acompanha o refactor do loop.
