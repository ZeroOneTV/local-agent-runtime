# Tools do Assistente

## Tools read-only (execução automática)

Estas tools podem ser executadas automaticamente pelo orquestrador sem aprovação:

- `read_file` — ler arquivo dentro do root_path
- `list_directory` — listar diretório
- `search_files` — buscar arquivos por nome
- `inspect_structure` — inspecionar estrutura do projeto
- `detect_stack` — detectar stack tecnológica
- `search_rag` — buscar no conhecimento indexado
- `search_memories` — buscar memórias do projeto
- `git_status`, `git_diff` — operações Git read-only

## Tools que exigem aprovação humana

Estas tools são sensíveis e criam `tool_call` com status `pending`:

- `write_file` — escrever arquivo
- `apply_patch` — alterar arquivo
- `delete_file` — remover arquivo
- `run_command` — executar comando shell
- `run_tests` — executar testes via terminal
- `run_build` — executar build via terminal

## Fluxo de aprovação

1. Backend cria `tool_call` com `status = pending`
2. Usuário aprova via chat, `POST /tools/approve/:id` ou página `/approvals`
3. Se aprovado: `approved → running → success/error`
4. Se rejeitado: `rejected`

Todas as execuções passam por Permission Engine, Policy Engine e Audit Logs.
