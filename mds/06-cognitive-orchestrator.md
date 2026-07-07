
# 06 - Cognitive Orchestrator

> Objetivo: definir como o assistente decide, planeja, executa, revisa e responde usando contexto, memória, RAG, tools, jobs longos e eventos.

---

# Visão geral

O Cognitive Orchestrator é a camada responsável por transformar o sistema em um assistente operacional.

Ele coordena:

- interpretação do pedido
- classificação da intenção
- montagem de plano
- uso de contexto
- uso de RAG
- uso de memória
- uso de tools
- execução assistida
- revisão dos resultados
- resposta final
- criação de jobs longos
- emissão de eventos/notificações

A LLM continua sendo o motor de raciocínio, mas não é dona do fluxo.

```text
Frontend

↓

Backend / Cognitive Orchestrator

↓

Context Engine

↓

Memory / RAG

↓

Tool System

↓

Security / Permissions

↓

LLM
```

---

# Princípio fundamental

O backend deve mastigar o máximo possível antes de chamar a LLM.

A LLM deve receber contexto organizado e raciocinar sobre ele.

O backend decide:

- quando buscar contexto
- quando buscar RAG
- quando buscar memória
- quando usar tool
- quando pedir aprovação
- quando criar job
- quando interromper execução
- quando emitir eventos
- quando persistir resultados

A LLM decide:

- interpretação semântica
- raciocínio
- análise de trade-offs
- solução sugerida
- próximos passos
- revisão qualitativa

---

# Modo padrão

O modo padrão do assistente será:

```text
Executor assistido
```

Isso significa:

- responde diretamente perguntas simples
- planeja tarefas complexas
- executa leituras e buscas sem aprovação
- pede aprovação para escrita, terminal e ações sensíveis
- descreve exatamente o que pretende fazer antes da execução
- mantém o usuário informado durante tarefas longas
- registra todas as ações relevantes

---

# Tipos de interação

## Perguntas simples

Exemplos:

- "O que é RAG?"
- "Qual a diferença entre Redis e RabbitMQ?"
- "Esse fluxo faz sentido?"

Fluxo:

```text
Mensagem

↓

Context Engine mínimo

↓

LLM

↓

Resposta direta
```

Não precisa de plano formal.

---

## Perguntas sobre projeto

Exemplos:

- "Analise essa arquitetura."
- "Veja se essa implementação está boa."
- "Onde esse módulo deveria ficar?"

Fluxo:

```text
Mensagem

↓

Classificação

↓

Context Engine

↓

Memória + RAG

↓

LLM analisa

↓

Resposta com diagnóstico e próximos passos
```

Pode usar tools read-only automaticamente.

---

## Tarefas complexas

Exemplos:

- "Refatore esse módulo."
- "Analise o projeto inteiro."
- "Planeje a próxima camada."
- "Corrija os erros de build."

Fluxo:

```text
Mensagem

↓

Intent Analyzer

↓

Planner

↓

Context Builder

↓

Tool/RAG/Memory

↓

Execution Loop

↓

Reflection

↓

Resposta ou Job
```

---

# Classificação de intenção

Toda mensagem deve ser classificada em uma intenção principal.

Tipos iniciais:

- question_answer
- architecture_discussion
- code_analysis
- code_change
- debug
- planning
- research
- file_operation
- project_indexing
- memory_operation
- long_running_task

A classificação serve para escolher o fluxo, não para limitar a resposta.

---

# Intent Analyzer

Responsável por identificar:

- tipo da tarefa
- complexidade
- necessidade de contexto
- necessidade de RAG
- necessidade de tools
- risco provável
- se pode responder direto
- se precisa planejar

Pode usar regras do backend antes da LLM.

Exemplo:

```text
Se pedido menciona "projeto", "arquitetura", "implementar", "refatorar"
→ provavelmente exige planejamento e contexto.
```

---

# Planner

Responsável por criar um plano estruturado para tarefas complexas.

O plano deve conter:

- objetivo
- etapas
- tools previstas
- riscos
- pontos que exigem aprovação
- critério de conclusão

Exemplo:

```json
{
  "objective": "Analisar o módulo de autenticação",
  "steps": [
    "Listar arquivos relevantes",
    "Ler services e controllers",
    "Buscar referências ao AuthModule",
    "Identificar acoplamentos",
    "Gerar diagnóstico"
  ],
  "requiresApproval": false
}
```

---

# Planejamento adaptativo

Nem toda tarefa exige plano formal.

Regras iniciais:

```text
Pergunta simples → resposta direta
Projeto/código/arquitetura → plano leve
Mudança em arquivos → plano + aprovação
Terminal/comando → plano + aprovação
Tarefa longa → job
```

---

# Execution Loop

O Execution Loop coordena ciclos de raciocínio e ação.

Fluxo:

```text
1. Avaliar estado atual
2. Decidir próxima ação
3. Validar permissão
4. Executar tool ou consultar RAG
5. Analisar resultado
6. Decidir se continua
7. Responder ou criar job
```

---

# Limites do loop

Configuração inicial:

- máximo de 8 ciclos por mensagem
- máximo de 3 tools consecutivas sem nova decisão
- bloquear repetição da mesma tool com mesmos argumentos
- parar em caso de erro crítico
- parar quando exigir aprovação humana
- parar quando não houver informação suficiente

---

# Tools automáticas

Podem ser executadas sem aprovação, desde que respeitem permissões:

- read_file
- list_directory
- search_files
- git_status
- git_diff
- search_rag
- search_memories
- inspect_structure
- detect_stack

---

# Tools que exigem aprovação

Sempre devem explicar exatamente o que será feito.

Exemplos:

- write_file
- apply_patch
- delete_file
- run_command
- run_tests
- run_build
- npm_install
- docker_compose_up
- update_memory
- create_memory
- fetch_url quando sensível

Formato da solicitação:

```text
Quero executar a tool X.

Motivo:
...

Parâmetros:
...

Impacto esperado:
...

Risco:
...

Aprovar?
```

---

# Aprovação humana

O backend deve criar uma tool_call com status pending.

O frontend deve exibir:

- nome da tool
- descrição da ação
- parâmetros
- risco
- impacto
- botões aprovar/rejeitar

Após aprovação:

```text
pending → approved → running → success/error
```

Após rejeição:

```text
pending → rejected
```

---

# Reflection Layer

Após cada tool ou etapa relevante, o sistema deve revisar:

- o resultado responde ao pedido?
- a tool falhou?
- preciso buscar mais contexto?
- o plano ainda faz sentido?
- existe conflito com memória/RAG?
- preciso pedir aprovação?
- devo criar job?
- devo finalizar?

A reflexão pode ser feita com:

- regras do backend
- LLM com prompt curto e estruturado

---

# Memory Decision

O sistema nunca salva memória permanente automaticamente como verdade final.

Quando uma informação parecer duradoura, criar uma sugestão.

Exemplo:

```text
Isso parece uma decisão permanente do projeto:

"Todas as tools de terminal devem exigir aprovação."

Deseja salvar como memória do projeto?
```

Se o usuário aprovar:

```text
create_memory
```

Se rejeitar:

```text
não salvar
```

---

# Jobs longos

Tarefas longas devem virar jobs retomáveis.

Exemplos:

- indexar projeto inteiro
- analisar muitos arquivos
- processar vídeo
- processar áudio
- processar PDF grande
- rodar build/testes demorados
- gerar relatório extenso

Fluxo:

```text
Pedido

↓

Cognitive Orchestrator identifica tarefa longa

↓

Cria job

↓

Worker executa

↓

Eventos são emitidos

↓

Resultado é salvo

↓

Context Engine pode usar depois
```

---

# Estados de job

Estados sugeridos:

- pending
- running
- waiting_approval
- completed
- failed
- cancelled
- paused

---

# Retomada de tarefas

Jobs devem possuir payload suficiente para retomar.

Exemplo:

```json
{
  "type": "project_analysis",
  "projectId": "...",
  "conversationId": "...",
  "stepsCompleted": 3,
  "currentStep": "search_dependencies"
}
```

---

# Event System

O sistema deve emitir eventos para frontend, logs e notificações.

Eventos sugeridos:

- task.created
- task.started
- task.progress
- task.waiting_approval
- task.completed
- task.failed
- tool.pending_approval
- tool.started
- tool.completed
- tool.failed
- memory.suggested
- memory.saved

---

# Webhooks

O backend deve permitir webhooks para eventos importantes.

Exemplo:

```text
POST /webhooks/events
```

Uso futuro:

- notificação no frontend
- integração com Open WebUI
- notificações no Windows
- integração com tray app
- automações locais

---

# Notificações

O sistema deve ser preparado para notificar quando:

- job terminar
- job falhar
- aprovação for necessária
- memória for sugerida
- tarefa longa precisar de decisão

Inicialmente:

```text
Frontend + eventos internos
```

Futuro:

```text
PWA / Browser Notifications
Tray app Windows
Webhook local
Central de notificações do Windows 11
```

---

# Frontend

O frontend inicial será:

```text
Open WebUI
```

Ele será usado como interface de chat, enquanto o backend mantém o controle do orquestrador.

Regra arquitetural:

```text
O frontend nunca deve ser dono do contexto, memória, tools ou permissões.
```

O frontend pode:

- enviar mensagens
- enviar arquivos
- exibir respostas
- exibir plano
- exibir tool calls
- aprovar/rejeitar ações
- mostrar status de jobs
- receber eventos

---

# Multimodalidade

O frontend pode receber:

- texto
- imagem
- áudio
- vídeo
- documentos
- links

O backend decide o pipeline.

Exemplos:

```text
Imagem → análise multimodal/OCR
Áudio → transcrição
Vídeo → áudio + frames + resumo
PDF → extração + chunking + RAG
Link → fetch + limpeza + indexação
```

Nem todo processamento precisa ser implementado inicialmente, mas a arquitetura deve permitir.

---

# Integração com Open WebUI

A integração deve ser feita de forma desacoplada.

Opções:

- endpoint OpenAI-compatible exposto pelo backend
- webhook/event system
- custom functions
- proxy entre Open WebUI e LLM
- backend como provider central

Objetivo:

```text
Open WebUI → Backend Orchestrator → LLM/Tools/Memory/RAG
```

Evitar:

```text
Open WebUI → LLM direto
```

Pois isso ignoraria o Cognitive Orchestrator.

---

# Resposta ao usuário

A resposta final deve conter, quando relevante:

- o que foi analisado
- o que foi executado
- o que foi encontrado
- limitações
- próximos passos
- pendências de aprovação
- sugestões de memória

Não revelar raciocínio interno detalhado.

Mostrar:

```text
plano e etapas
```

Não mostrar:

```text
cadeia de pensamento interna
```

---

# Debug Mode

Modo opcional para desenvolvimento.

Pode exibir:

- camadas de contexto usadas
- tools executadas
- tokens estimados
- chunks recuperados
- memórias usadas
- eventos emitidos
- decisões do orquestrador

Não deve ser o modo padrão.

---

# Critérios de conclusão

Uma tarefa termina quando:

- objetivo foi satisfeito
- limite de ciclos foi atingido
- aprovação é necessária
- erro crítico ocorreu
- faltam informações
- tarefa foi convertida em job

---

# Configurações sugeridas

```env
COGNITIVE_MAX_CYCLES=8
COGNITIVE_MAX_CONSECUTIVE_TOOLS=3
COGNITIVE_REQUIRE_MEMORY_CONFIRMATION=true
COGNITIVE_DEFAULT_MODE=assisted_executor
COGNITIVE_ENABLE_REFLECTION=true
COGNITIVE_ENABLE_LONG_JOBS=true
COGNITIVE_EVENT_SYSTEM=true
COGNITIVE_DEBUG=false
```

---

# Responsabilidades finais

## Cognitive Orchestrator

- classificar intenção
- decidir fluxo
- montar plano
- coordenar contexto
- controlar ciclo
- acionar tools
- criar jobs
- emitir eventos
- sugerir memórias
- gerar resposta final

## Context Engine

- montar contexto textual

## Memory/RAG

- recuperar conhecimento

## Tool System

- executar capacidades externas

## Security

- autorizar e auditar

## LLM

- raciocinar e propor soluções

---

# Objetivos

- transformar chat em assistente operacional
- manter segurança e controle
- permitir execução assistida
- suportar tarefas longas
- integrar eventos/notificações
- preparar multimodalidade
- manter o núcleo independente do frontend
- permitir troca futura de LLM

---

# Próximo documento

07-frontend-open-webui-integration.md — estratégia para usar o Open WebUI como frontend, conectando-o ao backend orquestrador sem perder controle de contexto, tools, jobs e permissões.
