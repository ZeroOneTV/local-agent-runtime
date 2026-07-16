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
- O `media-worker` também segue esse default: prompt do VLM (`MEDIA_VLM_PROMPT_LANGUAGE`),
  OCR (`MEDIA_OCR_LANGUAGES`) e classificação heurística de imagem partem de `pt`
  quando não configurados. Generalizações de idioma nunca trocam o default para inglês.

## Autonomia do agente ("tenta antes de perguntar")

- Distinguir **incerteza de informação** (explorar mais com tools read-only, dentro
  do orçamento, antes de perguntar) de **incerteza de permissão** (ação sensível →
  negar/pedir aprovação, nunca tentar "só para ver"). Ver `docs/architecture.md`.
- Os limites numéricos do loop (`COGNITIVE_MAX_CYCLES` etc.) são de custo/latência,
  não de comportamento — a autonomia muda **o que** o agente faz dentro deles.
- Ao esgotar o orçamento sem resposta: retornar resumo do que foi tentado + pergunta
  específica, nunca erro cru ou silêncio.
