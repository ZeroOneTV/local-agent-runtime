# 04 - Tool System

> Objetivo: definir a arquitetura das tools locais, seus contratos,
> permissões, execução, logs e integração com o Context Engine.

------------------------------------------------------------------------

# Princípio fundamental

A LLM nunca executa ações diretamente.

Ela apenas solicita uma ação estruturada.

Quem decide se a ação pode ser executada é o backend.

``` text
LLM

↓

Solicitação de tool

↓

Backend valida

↓

Backend executa

↓

Resultado volta para o contexto
```

------------------------------------------------------------------------

# Papel das tools

Tools são capacidades externas ao modelo.

Exemplos:

-   ler arquivos
-   listar diretórios
-   buscar no projeto
-   executar comandos
-   consultar banco
-   abrir links
-   aplicar patches
-   gerar embeddings
-   rodar testes
-   inspecionar Git

------------------------------------------------------------------------

# Tipos de tools

## Read-only

Não alteram estado.

Exemplos:

-   list_directory
-   read_file
-   search_project
-   git_status
-   git_diff

Podem ter execução mais permissiva.

------------------------------------------------------------------------

## Write

Alteram arquivos ou dados.

Exemplos:

-   write_file
-   apply_patch
-   update_memory
-   create_file

Devem exigir validação mais rígida.

------------------------------------------------------------------------

## Execution

Executam processos.

Exemplos:

-   run_command
-   run_tests
-   npm_install
-   docker_compose_up

Devem ser consideradas potencialmente perigosas.

------------------------------------------------------------------------

## External

Acessam recursos externos.

Exemplos:

-   fetch_url
-   browser_read
-   api_request

Devem ser controladas por whitelist, timeout e logs.

------------------------------------------------------------------------

# Contrato padrão

Toda tool deve possuir:

``` json
{
  "name": "read_file",
  "description": "Lê o conteúdo de um arquivo dentro do projeto.",
  "category": "filesystem",
  "riskLevel": "low",
  "requiresApproval": false,
  "inputSchema": {},
  "outputSchema": {}
}
```

------------------------------------------------------------------------

# Campos obrigatórios

## name

Nome único da tool.

Exemplo:

``` text
read_file
```

------------------------------------------------------------------------

## description

Descrição curta e objetiva para a LLM entender quando usar.

------------------------------------------------------------------------

## category

Categoria operacional.

Exemplos:

-   filesystem
-   git
-   terminal
-   database
-   browser
-   memory
-   rag
-   project

------------------------------------------------------------------------

## riskLevel

Nível de risco.

Valores sugeridos:

-   low
-   medium
-   high
-   critical

------------------------------------------------------------------------

## requiresApproval

Define se o usuário precisa aprovar antes da execução.

------------------------------------------------------------------------

## inputSchema

Schema JSON dos argumentos aceitos.

------------------------------------------------------------------------

## outputSchema

Schema JSON do retorno esperado.

------------------------------------------------------------------------

# Fluxo de execução

``` text
1. LLM solicita tool
2. Backend valida nome da tool
3. Backend valida inputSchema
4. Backend checa permissões
5. Backend checa root_path
6. Backend decide se exige aprovação
7. Tool executa
8. Resultado é salvo
9. Resultado entra no Context Engine
10. LLM continua a resposta
```

------------------------------------------------------------------------

# Registro no banco

Toda execução deve gerar:

## tool_calls

-   conversation_id
-   tool_name
-   parameters
-   status
-   started_at
-   finished_at

## tool_results

-   tool_call_id
-   output
-   execution_time
-   success

------------------------------------------------------------------------

# Estados possíveis

Tool call:

-   pending
-   approved
-   rejected
-   running
-   success
-   error
-   cancelled

------------------------------------------------------------------------

# Aprovação humana

Algumas tools devem pedir aprovação antes de executar.

Exemplos:

-   alterar arquivo
-   apagar arquivo
-   executar comando
-   instalar dependências
-   modificar banco
-   enviar requisição externa sensível

O backend deve retornar ao frontend uma solicitação de aprovação.

``` text
A LLM quer executar:

npm install pacote-x

Aprovar?
```

------------------------------------------------------------------------

# Root Path

Toda tool de filesystem deve respeitar o `project.root_path`.

Regra:

``` text
Nenhuma operação pode acessar caminho fora do root_path.
```

Mesmo que a LLM peça.

Exemplo proibido:

``` text
../../Users
C:\Windows
/etc/passwd
```

------------------------------------------------------------------------

# Normalização de caminhos

Antes de executar qualquer operação em arquivo:

1.  resolver caminho absoluto
2.  normalizar path
3.  comparar com root_path
4.  bloquear se escapar do diretório permitido

------------------------------------------------------------------------

# Resultado das tools

Toda tool deve retornar resultado estruturado.

Exemplo:

``` json
{
  "success": true,
  "data": {
    "path": "src/app.module.ts",
    "content": "..."
  },
  "metadata": {
    "bytes": 1200
  }
}
```

Em caso de erro:

``` json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Arquivo não encontrado."
  }
}
```

------------------------------------------------------------------------

# Tools síncronas

Usadas quando a execução é rápida.

Exemplos:

-   read_file
-   list_directory
-   git_status

Retornam no mesmo ciclo da conversa.

------------------------------------------------------------------------

# Tools assíncronas

Usadas quando a execução pode demorar.

Exemplos:

-   index_project
-   run_tests
-   generate_embeddings
-   parse_large_pdf

Devem criar um job.

Fluxo:

``` text
Tool solicitada

↓

Job criado

↓

Worker executa

↓

Resultado salvo

↓

Frontend mostra status

↓

Context Engine pode usar o resultado depois
```

------------------------------------------------------------------------

# Tools iniciais sugeridas

## Filesystem

-   list_directory
-   read_file
-   search_files
-   write_file
-   apply_patch
-   delete_file

## Git

-   git_status
-   git_diff
-   git_log
-   git_branch
-   git_show_file

## Project

-   summarize_project
-   inspect_structure
-   detect_stack
-   list_dependencies

## Terminal

-   run_command
-   run_tests
-   run_build

## RAG

-   index_file
-   index_project
-   search_rag

## Memory

-   create_memory
-   update_memory
-   search_memories

## Browser

-   fetch_url
-   read_web_page

------------------------------------------------------------------------

# Separação entre tool e serviço

A tool é apenas a interface exposta para a LLM.

A regra de negócio deve ficar em services internos.

Exemplo:

``` text
Tool: read_file
Service: FileSystemService
```

Isso evita acoplar a LLM à implementação.

------------------------------------------------------------------------

# Tool Registry

O backend deve possuir um registro central de tools.

Responsabilidades:

-   listar tools disponíveis
-   validar schemas
-   localizar executor
-   controlar permissões
-   expor descrições para a LLM

------------------------------------------------------------------------

# Tool Router

O Tool Router recebe uma solicitação da LLM e decide:

-   se a tool existe
-   se o input é válido
-   se a permissão permite
-   se precisa aprovação
-   se executa agora ou cria job
-   como devolver o resultado

------------------------------------------------------------------------

# Integração com Context Engine

Resultados recentes de tools entram na camada:

``` text
Resultados recentes de tools
```

O Context Engine deve buscar os últimos resultados relevantes da
conversa.

Não enviar outputs gigantes integralmente.

Se o output for muito grande:

-   resumir
-   truncar
-   salvar como arquivo/chunk
-   indexar no RAG

------------------------------------------------------------------------

# Segurança mínima

Mesmo antes do documento de segurança completo, as tools já devem
aplicar:

-   root_path obrigatório
-   timeout
-   limite de output
-   validação de input
-   logs
-   bloqueio de comandos perigosos
-   aprovação para operações destrutivas

------------------------------------------------------------------------

# Objetivos

-   impedir execução direta pela LLM
-   padronizar entrada e saída
-   permitir auditoria
-   separar tools síncronas e assíncronas
-   preparar o sistema para segurança avançada
-   integrar tools ao contexto da conversa

------------------------------------------------------------------------

# Próximo documento

05-security-permissions.md --- modelo de permissões, níveis de risco,
sandbox, bloqueios, aprovação humana e proteção contra ações perigosas.
