# Decisões Permanentes do Projeto

## Arquitetura

- O **Open WebUI** é a interface de chat, conectada ao backend via API OpenAI-compatible (`/v1`).
- O **backend NestJS** é a fonte única de contexto, memória, RAG, tools e segurança.
- A **LLM local** (Ollama) nunca é acessada diretamente pelo Open WebUI.

## Identificadores

- Usar **UUID** para todos os IDs de entidades (projetos, conversas, usuários).
- Projeto padrão: `00000000-0000-4000-8000-000000000001`
- Usuário local padrão: `00000000-0000-4000-8000-000000000002`

## Segurança

- Modo `safe` bloqueia tools de escrita com HTTP 403.
- Modo `developer` exige aprovação para tools sensíveis.
- Todas as tools devem respeitar o `root_path` do projeto.

## Idioma

- Respostas do assistente em **português** por padrão.
