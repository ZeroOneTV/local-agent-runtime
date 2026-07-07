
# 08 - Project Execution Flow

> Objetivo: confirmar o fluxo final de execução do projeto, desde a subida da infraestrutura até o caminho completo de uma mensagem enviada pelo Open WebUI, passando pelo backend, orquestrador, contexto, tools, LLM, eventos e persistência.

---

# Visão geral

Este projeto deve funcionar como um assistente local operacional.

A arquitetura final esperada é:

```text
Usuário

↓

Open WebUI

↓

Backend NestJS / OpenAI-compatible Provider

↓

Cognitive Orchestrator

↓

Context Engine

↓

Memory / RAG

↓

Tool System

↓

Security / Permissions

↓

LLM local

↓

Resposta

↓

Open WebUI
```

A LLM não é acessada diretamente pelo frontend.

O backend é o centro do sistema.

---

# Componentes principais

## 1. Open WebUI

Responsável por:

- interface visual
- chat
- envio de mensagens
- upload de arquivos
- exibição de respostas
- experiência parecida com ChatGPT/Claude

Não é responsável por:

- montar contexto oficial
- controlar memória
- executar tools críticas
- controlar segurança
- decidir permissões
- falar diretamente com a LLM

---

## 2. Backend NestJS

Responsável por:

- receber mensagens
- expor endpoint OpenAI-compatible
- orquestrar contexto
- chamar LLM
- controlar tools
- persistir conversas
- emitir eventos
- criar jobs
- auditar ações
- aplicar segurança

---

## 3. PostgreSQL + pgvector

Responsável por:

- usuários
- projetos
- conversas
- mensagens
- resumos
- arquivos
- chunks
- embeddings
- memórias
- tool calls
- tool results
- jobs
- eventos
- auditoria

---

## 4. Redis / BullMQ

Responsável por:

- filas de jobs
- tarefas longas
- processamento assíncrono
- jobs retomáveis

---

## 5. LLM local

Responsável por:

- raciocínio
- interpretação semântica
- análise
- geração da resposta
- sugestão de próximos passos

Roda preferencialmente fora do Docker no Windows.

Exemplo:

```text
Ollama nativo no Windows
http://localhost:11434
```

O backend em Docker acessa via:

```text
http://host.docker.internal:11434
```

---

# Fluxo de inicialização

## Etapa 1 - Subir LLM local

No Windows, iniciar o servidor da LLM.

Exemplo com Ollama:

```bash
ollama serve
```

Baixar ou garantir que o modelo existe:

```bash
ollama pull qwen3:32b
```

Ou outro modelo configurado no backend.

---

## Etapa 2 - Subir infraestrutura Docker

Subir containers:

```bash
docker compose up -d
```

Serviços esperados:

```text
backend
postgres
redis
open-webui
```

Opcionalmente:

```text
qdrant
minio
workers
```

---

## Etapa 3 - Aplicar migrations

Executar migrations Prisma:

```bash
npx prisma migrate deploy
```

Ou, em desenvolvimento:

```bash
npx prisma migrate dev
```

---

## Etapa 4 - Validar backend

Verificar health check:

```text
GET /health
```

Resultado esperado:

```json
{
  "status": "ok"
}
```

---

## Etapa 5 - Validar provider OpenAI-compatible

Verificar modelos:

```text
GET /v1/models
```

Resultado esperado:

```json
{
  "object": "list",
  "data": [
    {
      "id": "local-assistant",
      "object": "model",
      "owned_by": "local"
    }
  ]
}
```

---

## Etapa 6 - Configurar Open WebUI

No Open WebUI:

```text
Admin Panel
→ Settings
→ Connections
→ OpenAI API
```

Configurar:

```text
Base URL: http://backend:3000/v1
API Key: local-dev-key
```

Se o Open WebUI estiver fora do Docker:

```text
Base URL: http://localhost:3000/v1
```

---

# Regra crítica de execução

O Open WebUI deve apontar para:

```text
Backend /v1
```

Não para:

```text
Ollama direto
```

Correto:

```text
Open WebUI → Backend → Orchestrator → Ollama
```

Errado:

```text
Open WebUI → Ollama
```

---

# Fluxo completo de uma mensagem

## 1. Usuário envia mensagem

Exemplo:

```text
Analise a estrutura desse projeto e veja se a arquitetura está coerente.
```

---

## 2. Open WebUI envia para o backend

Endpoint:

```text
POST /v1/chat/completions
```

Payload simplificado:

```json
{
  "model": "local-assistant",
  "messages": [
    {
      "role": "user",
      "content": "Analise a estrutura desse projeto e veja se a arquitetura está coerente."
    }
  ],
  "stream": true
}
```

---

## 3. Backend identifica projeto

O backend resolve o projeto por uma das estratégias:

- model id associado ao projeto
- API key associada ao projeto
- projeto padrão
- mapeamento interno de conversa

Exemplo inicial:

```text
local-assistant → projeto padrão
```

---

## 4. Backend salva mensagem do usuário

Tabela:

```text
messages
```

Campos principais:

- conversation_id
- role = user
- content
- token_count

---

## 5. Cognitive Orchestrator inicia

O orquestrador recebe:

- projectId
- conversationId
- mensagem atual
- modelo solicitado
- modo de execução
- metadata do frontend

---

## 6. Intent Analyzer classifica a tarefa

Exemplo de classificação:

```json
{
  "intent": "architecture_discussion",
  "complexity": "medium",
  "requiresPlan": true,
  "requiresRag": true,
  "requiresTools": true,
  "risk": "low"
}
```

---

## 7. Planner cria plano se necessário

Para tarefas de projeto, código, arquitetura ou alteração, o planner gera um plano.

Exemplo:

```json
{
  "objective": "Avaliar coerência da arquitetura",
  "steps": [
    "Inspecionar estrutura do projeto",
    "Detectar stack utilizada",
    "Buscar documentos arquiteturais",
    "Consultar memórias permanentes",
    "Gerar diagnóstico"
  ],
  "requiresApproval": false
}
```

---

## 8. Context Engine monta contexto

O contexto é montado em camadas:

```text
1. Instruções do sistema
2. Configuração do projeto
3. Resumo da conversa
4. Histórico recente
5. Memórias relevantes
6. RAG
7. Resultados recentes de tools
8. Mensagem atual
```

---

## 9. Memory/RAG recuperam conhecimento

Memórias:

```text
memories
```

RAG:

```text
files → file_chunks → embeddings
```

O backend busca apenas o que for relevante.

Nunca envia o projeto inteiro para a LLM.

---

## 10. Execution Loop decide próximas ações

Se a tarefa exigir inspeção, o loop pode executar tools read-only automaticamente.

Exemplos:

```text
inspect_structure
detect_stack
search_rag
search_memories
git_status
```

Essas tools passam por:

```text
Tool Router

↓

Permission Engine

↓

Policy Engine

↓

Executor

↓

Audit
```

---

## 11. Tools sensíveis pedem aprovação

Se a LLM/orquestrador decidir alterar algo:

Exemplo:

```text
apply_patch
write_file
run_command
delete_file
```

O backend cria:

```text
tool_call.status = pending
```

E o usuário recebe uma solicitação:

```text
Quero executar a tool apply_patch.

Motivo:
Corrigir import incorreto no arquivo X.

Parâmetros:
...

Impacto esperado:
...

Risco:
medium

Aprovar?
```

Sem aprovação, a tool não executa.

---

## 12. Tool executa

Quando aprovada ou quando for read-only automática:

```text
pending/approved

↓

running

↓

success/error
```

Resultados são salvos em:

```text
tool_calls
tool_results
tool_audit_logs
```

---

## 13. Reflection Layer revisa

Após tools ou etapas relevantes, o sistema avalia:

- o resultado responde ao pedido?
- precisa de mais contexto?
- houve erro?
- precisa pedir aprovação?
- precisa criar job?
- deve finalizar?

---

## 14. LLM gera resposta

O backend chama a LLM local com contexto já preparado.

Fluxo:

```text
Backend

↓

LLM local

↓

Resposta gerada

↓

Backend
```

A resposta deve mostrar:

- plano ou etapas quando relevante
- o que foi analisado
- o que foi encontrado
- limitações
- próximos passos
- pendências de aprovação

Não deve expor cadeia de pensamento interna.

---

## 15. Backend salva resposta

Tabela:

```text
messages
```

Campos:

- conversation_id
- role = assistant
- content
- token_count

---

## 16. SummaryService atualiza resumo quando necessário

Atualiza resumo incremental quando:

- muitas mensagens desde o último resumo
- muitos tokens acumulados
- mudança importante de assunto
- conclusão de etapa relevante

Tabela:

```text
conversation_summaries
```

---

## 17. MemoryDecisionService sugere memória

Se surgir uma decisão duradoura, o sistema pergunta:

```text
Isso parece uma decisão permanente do projeto.

Deseja salvar como memória?
```

Se aprovado:

```text
memories
memory_history
```

Se rejeitado:

```text
não salvar
```

---

## 18. Eventos são emitidos

Eventos possíveis:

```text
tool.started
tool.completed
task.created
task.progress
task.completed
memory.suggested
memory.saved
```

Tabela:

```text
orchestrator_events
```

---

## 19. Open WebUI exibe resposta

O usuário vê a resposta no chat.

Se houver streaming, vê os tokens conforme são gerados.

---

# Fluxo de tarefa longa

Exemplo:

```text
Indexe todo o projeto e depois gere um relatório de arquitetura.
```

## 1. Orquestrador identifica tarefa longa

Classificação:

```json
{
  "intent": "project_indexing",
  "longRunning": true
}
```

---

## 2. Backend cria job

Tabela:

```text
jobs
```

Estado inicial:

```text
pending
```

---

## 3. Worker executa

O worker processa etapas:

```text
listar arquivos
extrair conteúdo
chunking
gerar embeddings
salvar no pgvector
gerar resumo
emitir eventos
```

---

## 4. Eventos de progresso

Exemplos:

```text
task.started
task.progress
task.completed
```

---

## 5. Resultado é salvo

O resultado pode ser salvo em:

- jobs.payload/result
- messages
- files/chunks
- memories sugeridas
- documentos gerados

---

## 6. Usuário é notificado

Inicialmente:

```text
evento interno + frontend
```

Futuro:

```text
webhook
PWA
tray app Windows
notificação Windows 11
```

---

# Fluxo de upload

## Upload de documento

```text
Open WebUI recebe arquivo

↓

Backend recebe arquivo ou referência

↓

ContentExtractorService extrai texto

↓

ChunkingService divide

↓

EmbeddingService gera vetor

↓

IndexingService salva

↓

RAG usa quando necessário
```

---

## Upload de imagem

Pipeline futuro:

```text
imagem

↓

armazenar

↓

OCR/análise multimodal

↓

descrição estruturada

↓

RAG/contexto
```

---

## Upload de áudio

Pipeline futuro:

```text
áudio

↓

transcrição

↓

limpeza

↓

chunking

↓

RAG/contexto
```

---

## Upload de vídeo

Pipeline futuro:

```text
vídeo

↓

extrair áudio

↓

transcrever

↓

extrair frames-chave

↓

analisar frames

↓

gerar resumo

↓

RAG/contexto
```

---

# Fluxo de aprovação

## 1. Tool sensível é solicitada

Exemplo:

```text
run_command
```

---

## 2. Backend cria tool_call pending

```text
status = pending
```

---

## 3. Usuário aprova ou rejeita

Endpoints:

```text
POST /tools/approve/:id
POST /tools/reject/:id
```

---

## 4. Se aprovado

```text
approved → running → success/error
```

---

## 5. Se rejeitado

```text
rejected
```

---

## 6. Orquestrador continua

Após aprovação ou rejeição, o orquestrador decide:

- continuar plano
- propor alternativa
- encerrar tarefa
- pedir nova decisão

---

# Fluxo de memória

## 1. Informação duradoura detectada

Exemplo:

```text
"Todas as tools de terminal devem exigir aprovação."
```

---

## 2. Sistema sugere memória

Evento:

```text
memory.suggested
```

---

## 3. Usuário aprova

Tool:

```text
create_memory
```

---

## 4. Memória é salva

Tabelas:

```text
memories
memory_history
```

---

## 5. Context Engine passa a usar

A memória entra em futuras conversas se for relevante.

---

# Fluxo de segurança

Toda tool passa por:

```text
Tool Router

↓

Permission Engine

↓

Policy Engine

↓

Executor

↓

Audit
```

Validações obrigatórias:

- tool existe
- inputSchema válido
- usuário/projeto autorizado
- executionMode permite
- risco exige aprovação?
- root_path respeitado?
- comando permitido?
- rate limit respeitado?
- política global permite?
- output dentro do limite?

---

# Fluxo de RAG

## Indexação

```text
arquivo

↓

hash

↓

verificar mudança

↓

extrair conteúdo

↓

chunking

↓

embedding

↓

salvar
```

---

## Recuperação

```text
query

↓

embedding da query

↓

busca vetorial

↓

heurísticas

↓

chunks relevantes

↓

Context Engine
```

---

# Fluxo de fallback da LLM

Se a LLM estiver indisponível:

```text
Backend detecta erro

↓

não retorna 500 bruto

↓

usa fallback

↓

mantém orquestração funcionando

↓

registra evento/erro
```

Resposta esperada:

```text
A LLM local está indisponível, mas o backend conseguiu processar a estrutura da tarefa...
```

---

# Fluxo esperado em desenvolvimento

## 1. Subir Ollama

```bash
ollama serve
```

## 2. Subir Docker

```bash
docker compose up -d
```

## 3. Validar backend

```text
GET /health
```

## 4. Validar modelos

```text
GET /v1/models
```

## 5. Configurar Open WebUI

```text
Base URL: http://backend:3000/v1
API Key: local-dev-key
```

## 6. Enviar pergunta simples

Validar resposta direta.

## 7. Enviar pergunta sobre projeto

Validar:

```text
intent
context
tools read-only
RAG
resposta
```

## 8. Pedir alteração de arquivo

Validar:

```text
tool pending
aprovação
execução
audit log
```

## 9. Pedir tarefa longa

Validar:

```text
job criado
eventos
status
resultado final
```

---

# Critérios de validação final

O projeto estará executando corretamente quando:

- Open WebUI abrir normalmente
- Open WebUI listar o modelo do backend
- mensagens forem enviadas para `/v1/chat/completions`
- backend não for bypassado
- backend salvar conversa oficial
- Context Engine montar contexto
- RAG recuperar chunks relevantes
- memórias aparecerem quando relevantes
- tools read-only executarem automaticamente
- tools sensíveis exigirem aprovação
- audit logs forem gerados
- jobs longos forem criados
- eventos forem emitidos
- fallback funcionar com LLM indisponível
- LLM local responder quando ativa
- nenhuma operação escapar do root_path

---

# Modelo mental final

Este projeto não deve ser visto como:

```text
Chat conectado ao Ollama
```

Deve ser visto como:

```text
Runtime local de assistente cognitivo

com frontend pronto,
backend orquestrador,
memória,
RAG,
tools,
segurança,
jobs,
eventos
e LLM local.
```

---

# Ordem de execução em produção local

```text
1. LLM local ativa
2. Banco ativo
3. Redis ativo
4. Backend ativo
5. Open WebUI ativo
6. Projeto padrão carregado
7. /v1/models validado
8. Open WebUI configurado
9. Mensagem enviada
10. Orquestrador executando
```

---

# Decisão final

O fluxo oficial do sistema será:

```text
Open WebUI
    ↓
Backend /v1 OpenAI-compatible
    ↓
Cognitive Orchestrator
    ↓
Context Engine
    ↓
Memory / RAG
    ↓
Tool System
    ↓
Security / Permissions
    ↓
LLM local
    ↓
Backend
    ↓
Open WebUI
```

Este fluxo deve ser mantido como referência para todas as próximas implementações.
