# 05 - Security & Permissions

> Objetivo: definir o modelo de segurança do assistente, garantindo que
> nenhuma ação executada pela LLM possa ultrapassar os limites definidos
> pelo backend.

------------------------------------------------------------------------

# Princípios

-   A LLM nunca recebe permissões diretas.
-   Toda autorização pertence ao backend.
-   Segurança deve prevalecer sobre conveniência.
-   Toda ação relevante deve ser auditável.

------------------------------------------------------------------------

# Camadas de segurança

``` text
LLM

↓

Tool Router

↓

Permission Engine

↓

Policy Engine

↓

Executor

↓

Logs/Auditoria
```

------------------------------------------------------------------------

# Permission Engine

Responsável por responder:

-   a tool existe?
-   está habilitada?
-   o projeto permite?
-   o usuário possui acesso?
-   exige aprovação?
-   pode executar agora?

------------------------------------------------------------------------

# Níveis de risco

## Low

Somente leitura.

Exemplos:

-   read_file
-   list_directory
-   git_status

------------------------------------------------------------------------

## Medium

Escrita reversível.

Exemplos:

-   write_file
-   apply_patch
-   create_memory

------------------------------------------------------------------------

## High

Execução de processos.

Exemplos:

-   run_command
-   run_tests
-   docker_compose_up

------------------------------------------------------------------------

## Critical

Pode afetar ambiente externo.

Exemplos:

-   remover arquivos
-   modificar banco
-   chamadas HTTP autenticadas
-   execução privilegiada

------------------------------------------------------------------------

# Política padrão

  Risco      Aprovação   Auditoria
  ---------- ----------- -----------
  Low        Não         Sim
  Medium     Sim         Sim
  High       Sim         Sim
  Critical   Sempre      Completa

------------------------------------------------------------------------

# Root Path

Todas as operações em arquivos devem ocorrer dentro do root_path do
projeto.

Fluxo:

1.  resolver caminho absoluto
2.  normalizar
3.  validar
4.  bloquear se escapar

Nunca confiar no caminho informado pela LLM.

------------------------------------------------------------------------

# Sandbox

As tools devem executar em ambiente controlado.

Restrições iniciais:

-   timeout configurável
-   limite de memória quando aplicável
-   limite de saída
-   diretório de trabalho controlado
-   ambiente mínimo

------------------------------------------------------------------------

# Shell

Shell deve permanecer desabilitado por padrão.

Quando habilitado:

-   allowlist de comandos
-   argumentos validados
-   timeout
-   stdout/stderr limitados
-   código de saída registrado

Nunca permitir comandos compostos ou interpretados diretamente.

------------------------------------------------------------------------

# Navegação Web

Políticas:

-   whitelist opcional de domínios
-   timeout
-   limite de tamanho
-   bloqueio de downloads automáticos

------------------------------------------------------------------------

# Banco de dados

Acesso sempre por services internos.

Nunca expor SQL livre para a LLM.

Quando necessário:

LLM → Tool → Service → ORM

------------------------------------------------------------------------

# Aprovação humana

Fluxo:

``` text
LLM solicita

↓

Backend gera pending

↓

Frontend pergunta ao usuário

↓

approve/reject

↓

Execução ou cancelamento
```

A aprovação deve registrar:

-   usuário
-   horário
-   tool
-   parâmetros

------------------------------------------------------------------------

# Auditoria

Toda execução relevante deve registrar:

-   usuário
-   projeto
-   conversa
-   tool
-   parâmetros
-   resultado
-   duração
-   aprovação
-   erro (se existir)

Logs nunca devem ser alterados.

------------------------------------------------------------------------

# Limites

Configurações recomendadas:

-   tamanho máximo de output
-   tempo máximo
-   quantidade máxima de arquivos
-   profundidade máxima de diretórios
-   limite de chamadas consecutivas

------------------------------------------------------------------------

# Policy Engine

Camada responsável por aplicar regras globais.

Exemplos:

-   proibir delete em produção
-   bloquear browser em projetos offline
-   impedir terminal durante indexação
-   impedir múltiplos comandos perigosos

Essas regras independem da LLM.

------------------------------------------------------------------------

# Modo de execução

## Safe

Somente leitura.

## Developer

Leitura + escrita mediante aprovação.

## Autonomous

Permissões configuráveis para execução automática de ações específicas.

O modo deve ser configurável por projeto.

------------------------------------------------------------------------

# Recuperação

Em caso de falha:

-   registrar erro
-   preservar contexto
-   não perder histórico
-   permitir nova tentativa

------------------------------------------------------------------------

# Objetivos

-   minimizar riscos
-   permitir auditoria completa
-   separar autorização de execução
-   suportar evolução das tools
-   manter comportamento previsível

------------------------------------------------------------------------

# Próximo documento

06-agent-orchestration.md --- planejamento, execução em múltiplas
etapas, uso sequencial de tools, ciclos de raciocínio e coordenação do
assistente.
