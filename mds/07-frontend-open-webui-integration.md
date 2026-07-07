
# 07 - Frontend Open WebUI Integration

> Objetivo: definir como usar o Open WebUI como frontend inicial do assistente, mantendo o backend NestJS como orquestrador central de contexto, memória, RAG, tools, permissões, jobs e eventos.

---

# Decisão arquitetural

O frontend inicial será:

```text
Open WebUI
```

O backend principal continuará sendo:

```text
NestJS Orchestrator
```

A LLM local continuará rodando fora do Docker, preferencialmente nativa no Windows:

```text
Ollama / LM Studio / llama.cpp / vLLM
```

---

# Regra principal

O Open WebUI não deve conversar diretamente com a LLM.

Evitar:

```text
Open WebUI

↓

Ollama / LLM
```

Preferir:

```text
Open WebUI

↓

NestJS Orchestrator

↓

Context Engine / Memory / RAG / Tools / Security

↓

Ollama / LLM
```

Motivo:

Se o Open WebUI conversar direto com a LLM, ele ignora as camadas mais importantes do sistema:

- Context Engine
- Cognitive Orchestrator
- Memory
- RAG próprio
- Tool System
- Security
- Permission Engine
- Audit Logs
- Jobs
- Event System

---

# Papel do Open WebUI

O Open WebUI será responsável por:

- interface de chat
- autenticação visual/local
- envio de mensagens
- envio de arquivos
- exibição de respostas
- organização de conversas
- experiência de usuário
- suporte multimodal inicial
- interação com modelos via API compatível

Ele não será responsável por:

- decidir contexto
- executar tools
- aplicar permissões
- armazenar memória oficial do projeto
- decidir RAG principal
- executar jobs longos
- controlar segurança
- conversar diretamente com Ollama

---

# Papel do Backend

O backend será responsável por:

- receber mensagens do Open WebUI
- classificar intenção
- montar contexto
- consultar memória
- consultar RAG
- decidir uso de tools
- pedir aprovação
- criar jobs longos
- emitir eventos
- chamar a LLM local
- devolver resposta final
- persistir histórico oficial
- auditar ações

---

# Estratégia de integração

A integração principal deve ser via endpoint compatível com OpenAI.

O backend deve expor endpoints semelhantes a:

```text
GET  /v1/models
POST /v1/chat/completions
```

Assim, o Open WebUI poderá configurar o backend como um provider OpenAI-compatible.

---

# Fluxo esperado

```text
Usuário envia mensagem no Open WebUI

↓

Open WebUI chama /v1/chat/completions no backend

↓

Backend executa Cognitive Orchestrator

↓

Context Engine monta contexto

↓

Memory/RAG recuperam conhecimento

↓

Tool System executa ou solicita aprovação

↓

Backend chama LLM local

↓

Backend retorna resposta no formato compatível

↓

Open WebUI exibe a resposta
```

---

# Modelos expostos

O backend pode expor modelos lógicos, não necessariamente modelos reais.

Exemplo:

```json
{
  "id": "local-assistant",
  "name": "Local Assistant",
  "backendModel": "qwen3:32b",
  "orchestration": true
}
```

Isso permite trocar o modelo interno sem alterar a configuração do Open WebUI.

Exemplos de modelos lógicos:

- local-assistant
- local-coder
- local-reasoner
- local-fast
- local-vision

---

# OpenAI-compatible API

## GET /v1/models

Deve retornar os modelos lógicos disponíveis.

Exemplo:

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

## POST /v1/chat/completions

Deve aceitar payload compatível.

Exemplo:

```json
{
  "model": "local-assistant",
  "messages": [
    {
      "role": "user",
      "content": "Analise esse projeto."
    }
  ],
  "stream": true
}
```

O backend deve converter esse payload para o formato interno do Cognitive Orchestrator.

---

# Streaming

O backend deve suportar streaming para boa experiência no Open WebUI.

Fluxo:

```text
Open WebUI abre stream

↓

Backend inicia Cognitive Orchestrator

↓

Backend envia eventos parciais

↓

LLM gera tokens

↓

Backend envia tokens no formato esperado

↓

Stream finaliza
```

Eventos internos de tool/job podem ser traduzidos para mensagens parciais, quando o frontend suportar.

---

# Conversas

Existem duas opções:

## Opção A - Open WebUI mantém a conversa visual

O Open WebUI armazena a conversa para exibição.

O backend também armazena a conversa oficial.

Vantagem:

- mais simples
- aproveita UX pronta

Desvantagem:

- duplicação de histórico

---

## Opção B - Backend é fonte única de verdade

Open WebUI funciona como casca visual.

Vantagem:

- arquitetura mais limpa
- controle total

Desvantagem:

- integração mais trabalhosa

---

# Decisão inicial

Começar com:

```text
Opção A
```

Ou seja:

```text
Open WebUI armazena conversa visual
Backend armazena conversa oficial
```

No futuro, evoluir para fonte única se necessário.

---

# Identificação de projeto

O backend precisa saber qual projeto está ativo.

Opções:

## 1. Modelo por projeto

Criar um model lógico por projeto.

Exemplo:

```text
project-local-assistant-game
project-local-assistant-nestjs
```

Simples, mas pode poluir a lista de modelos.

---

## 2. Prefixo na mensagem

Exemplo:

```text
/project 00000000-0000-4000-8000-000000000001
Analise a arquitetura.
```

Funciona, mas é ruim para UX.

---

## 3. Header/API key por projeto

Cada conexão no Open WebUI usa uma chave associada a um projeto.

Exemplo:

```text
OPENWEBUI_API_KEY → projectId
```

Boa opção para uso local.

---

## 4. Workspace mapping

Criar um mapeamento interno entre usuário/modelo/conversa e projeto.

Melhor opção futura.

---

# Decisão inicial

Usar:

```text
API key ou model id associado ao projectId
```

Exemplo:

```text
local-assistant-default → projeto padrão
local-assistant-game → projeto jogo
local-assistant-work → projeto trabalho
```

---

# Upload de arquivos

O Open WebUI pode receber arquivos.

O backend deve decidir como lidar com eles.

Fluxo ideal:

```text
Arquivo enviado

↓

Open WebUI envia junto da mensagem ou referencia o arquivo

↓

Backend recebe ou busca o arquivo

↓

Content Extractor processa

↓

RAG indexa se necessário

↓

Context Engine usa os trechos relevantes
```

---

# Tipos de upload

Suporte arquitetural para:

- texto
- markdown
- pdf
- imagens
- áudio
- vídeo
- planilhas
- JSON/YAML
- arquivos de código
- links

---

# Imagens

Pipeline futuro:

```text
Imagem

↓

armazenamento

↓

OCR ou modelo multimodal

↓

descrição estruturada

↓

chunks/RAG quando útil

↓

Context Engine
```

---

# Áudio

Pipeline futuro:

```text
Áudio

↓

transcrição

↓

limpeza

↓

chunks

↓

RAG/memória/contexto
```

---

# Vídeo

Pipeline futuro:

```text
Vídeo

↓

extrair áudio

↓

transcrever áudio

↓

extrair frames-chave

↓

analisar frames

↓

gerar resumo multimodal

↓

indexar no RAG
```

---

# Documentos

Pipeline:

```text
Documento

↓

extração de texto

↓

chunking

↓

embeddings

↓

RAG

↓

Context Engine
```

---

# Links

Pipeline:

```text
URL

↓

fetch_url

↓

limpeza do HTML

↓

extração de texto

↓

chunking

↓

RAG temporário ou permanente
```

Links externos podem exigir aprovação dependendo do modo de segurança.

---

# Aprovação de tools no frontend

O Open WebUI pode não ter, inicialmente, uma tela própria para o fluxo de aprovação do backend.

Estratégias possíveis:

## Estratégia A - Aprovação por mensagem

O backend responde:

```text
Preciso da sua aprovação para executar:

Tool: apply_patch
Motivo: alterar arquivo X
Risco: medium

Responda: aprovar ou rejeitar.
```

Mais simples.

---

## Estratégia B - Endpoint externo

O backend fornece uma pequena página própria para aprovações.

Exemplo:

```text
http://localhost:3000/approvals
```

O Open WebUI apenas recebe o link.

---

## Estratégia C - Integração customizada no Open WebUI

Usar extensões/functions/webhooks para fluxo mais nativo.

Mais poderoso, mas deve ficar para uma fase posterior.

---

# Decisão inicial

Começar com:

```text
Estratégia A
```

E preparar backend para evoluir para:

```text
Estratégia B
```

---

# Jobs longos

Jobs longos não devem depender do Open WebUI.

O backend deve controlar:

- criação
- progresso
- pausa
- retomada
- conclusão
- erro
- cancelamento

O Open WebUI deve apenas exibir mensagens ou receber notificações.

---

# Mensagens de progresso

Durante um job longo, o backend pode responder:

```text
Criei uma tarefa longa para analisar o projeto.

Job: project_analysis
Status: running

Vou avisar quando terminar.
```

Quando terminar:

```text
A análise do projeto foi concluída.

Resumo:
...

Próximos passos:
...
```

---

# Event System

O backend deve emitir eventos independentes do frontend.

Eventos:

- task.created
- task.started
- task.progress
- task.completed
- task.failed
- tool.pending_approval
- tool.completed
- tool.failed
- memory.suggested
- memory.saved

---

# Webhooks

O backend deve possuir webhook/event dispatcher.

Uso:

- Open WebUI
- PWA
- tray app Windows
- notificações locais
- logs externos
- automações

Exemplo de payload:

```json
{
  "event": "task.completed",
  "projectId": "...",
  "conversationId": "...",
  "jobId": "...",
  "title": "Análise concluída",
  "message": "O relatório do projeto foi finalizado."
}
```

---

# Notificações Windows

O Open WebUI sozinho pode não resolver notificação nativa confiável no Windows.

Estratégias futuras:

## PWA instalada

Instalar o Open WebUI ou frontend auxiliar como PWA no Edge/Chrome.

## Tray app local

Criar app pequeno em Electron/Tauri.

## Webhook local

Backend envia evento para um listener local.

## Browser notifications

Usar permissões do navegador.

---

# Decisão inicial

Preparar o backend para eventos e webhooks.

Não depender inicialmente da notificação nativa do Windows 11.

---

# RAG do Open WebUI vs RAG do Backend

O Open WebUI possui recursos próprios de arquivos/conhecimento/RAG.

Porém, para este projeto, o RAG oficial deve ser o do backend.

Motivo:

- precisa respeitar projectId
- precisa respeitar root_path
- precisa integrar com memória
- precisa gerar auditoria
- precisa alimentar Context Engine
- precisa funcionar com tools
- precisa ser reproduzível

Regra:

```text
Open WebUI pode fazer upload.
Backend decide indexação e uso.
```

---

# Tools do Open WebUI vs Tools do Backend

O Open WebUI possui sistema próprio de tools/functions.

Porém, as tools oficiais devem ser as do backend.

Motivo:

- segurança centralizada
- auditoria
- permission engine
- policy engine
- root_path
- aprovação humana
- logs
- integração com jobs

Regra:

```text
Tools críticas ficam no backend.
```

Tools do Open WebUI podem ser usadas apenas para UX ou integrações não críticas.

---

# Configuração Docker

Exemplo conceitual:

```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3001:8080"
    volumes:
      - open-webui-data:/app/backend/data
    environment:
      - OPENAI_API_BASE_URL=http://backend:3000/v1
      - OPENAI_API_KEY=local-dev-key
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
    ports:
      - "3000:3000"
    environment:
      - LLM_BASE_URL=http://host.docker.internal:11434
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
```

A LLM local pode ficar fora do Docker.

---

# Configuração no Open WebUI

No painel do Open WebUI:

```text
Admin Panel
→ Settings
→ Connections
→ OpenAI API
→ Add connection
```

Configurar:

```text
Base URL: http://backend:3000/v1
API Key: local-dev-key
```

Em ambiente fora do Docker:

```text
Base URL: http://localhost:3000/v1
```

---

# Segurança

Desabilitar ou limitar:

- conexões diretas não confiáveis
- providers externos desnecessários
- tools nativas não auditadas
- usuários anônimos se não forem necessários
- exposição pública da porta

Recomendações:

- uso local primeiro
- atualizar Open WebUI regularmente
- não expor sem autenticação
- manter backend como boundary de segurança
- não deixar navegador falar com providers desconhecidos

---

# Modos de operação

## Local Dev

```text
Open WebUI
Backend
Postgres
Redis
LLM local no Windows
```

## Local Secure

```text
Open WebUI sem providers externos
Backend com API key
Tools com aprovação
Shell desabilitado por padrão
```

## Future Multi-Project

```text
vários projectIds
modelos lógicos por projeto
permissões por workspace
jobs por projeto
notificações por projeto
```

---

# Limitações conhecidas

- Open WebUI pode duplicar histórico com backend.
- Fluxo de aprovação pode começar simples via mensagem.
- Uploads multimodais podem exigir pipeline próprio no backend.
- Notificações Windows exigem solução adicional.
- Alguns recursos nativos do Open WebUI podem conflitar com o backend se usados sem controle.

---

# Critério de sucesso

A integração será considerada válida quando:

- Open WebUI listar o modelo lógico do backend
- Open WebUI enviar mensagem para /v1/chat/completions
- backend montar contexto via Cognitive Orchestrator
- backend chamar LLM local
- resposta aparecer no Open WebUI
- histórico oficial for salvo no backend
- tool read-only puder ser executada automaticamente
- tool sensível gerar pedido de aprovação
- job longo emitir evento
- upload de arquivo puder ser encaminhado ao backend

---

# Próximo documento

08-openai-compatible-provider.md — especificação técnica dos endpoints compatíveis com OpenAI que o backend deverá expor para o Open WebUI.
