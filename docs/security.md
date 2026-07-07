# Segurança e Permissões

## Princípio central

O backend é dono do contexto. A LLM nunca executa ações diretamente.

## Controles

- **TOOL_EXECUTION_MODE**: `approval_required` (padrão) ou `auto`
- **ALLOW_SHELL_COMMANDS**: `false` por padrão
- **MAX_CONTEXT_TOKENS**: limite de contexto no prompt (24000)

## Restrições de arquivos

Tools de arquivo só acessam caminhos dentro de `PROJECTS_PATH` (`/storage/projects`).

## Comandos bloqueados

`rm -rf`, `format`, `del /f`, `shutdown`, `reboot`

## Aprovação humana

Quando `TOOL_EXECUTION_MODE=approval_required`, tool calls de shell retornam status pendente até o frontend enviar `approved: true`.

## Próximos passos

- Autenticação de usuários
- Permissões por projeto
- Audit log de tool calls
- Rate limiting
