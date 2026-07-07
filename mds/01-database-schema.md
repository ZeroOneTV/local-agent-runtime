# 01 - Database Schema

> Objetivo: definir o modelo de dados base do sistema antes da
> implementação das regras de negócio.

## Princípios

-   PostgreSQL como banco principal.
-   Cada entidade possui UUID como chave primária.
-   Nenhuma tabela deve depender diretamente da LLM.
-   A LLM é consumidora dos dados, nunca proprietária deles.
-   Todo histórico deve ser preservado.

------------------------------------------------------------------------

# Domínios

    Users
    Projects
    Conversations
    Messages
    Files
    Embeddings
    Memories
    Tool Calls
    Tool Results
    Jobs
    Configurations

------------------------------------------------------------------------

# Relacionamentos

    User
     └── Projects
          ├── Conversations
          │     ├── Messages
          │     ├── Summaries
          │     └── Tool Calls
          │
          ├── Files
          │     ├── Chunks
          │     └── Embeddings
          │
          ├── Memories
          │
          └── Jobs

------------------------------------------------------------------------

# Tabelas

## users

Responsável pela autenticação e preferências do usuário.

Campos sugeridos

-   id
-   name
-   email
-   created_at
-   updated_at

------------------------------------------------------------------------

## projects

Representa um projeto lógico.

Exemplos:

-   Projeto Unity
-   Projeto NestJS
-   Documentação
-   Estudos

Campos

-   id
-   owner_id
-   name
-   description
-   root_path
-   created_at
-   updated_at

Observação:

`root_path` representa o diretório permitido para leitura das tools.

------------------------------------------------------------------------

## conversations

Cada chat pertence a exatamente um projeto.

Campos

-   id
-   project_id
-   title
-   model
-   created_at
-   updated_at

Nunca armazenar contexto consolidado aqui.

------------------------------------------------------------------------

## messages

Histórico bruto da conversa.

Campos

-   id
-   conversation_id
-   role
-   content
-   token_count
-   created_at

Role:

-   user
-   assistant
-   system
-   tool

Nunca apagar mensagens.

------------------------------------------------------------------------

## conversation_summaries

Resumo incremental utilizado pelo motor de contexto.

Campos

-   id
-   conversation_id
-   summary
-   generated_until_message_id
-   created_at

Sempre regenerável.

------------------------------------------------------------------------

## files

Arquivos conhecidos pelo sistema.

Campos

-   id
-   project_id
-   path
-   filename
-   extension
-   hash
-   size
-   last_modified
-   indexed_at

Não armazenar o conteúdo aqui.

------------------------------------------------------------------------

## file_chunks

Cada arquivo é dividido em pequenos trechos.

Campos

-   id
-   file_id
-   chunk_index
-   content
-   token_count

------------------------------------------------------------------------

## embeddings

Representação vetorial dos chunks.

Campos

-   id
-   chunk_id
-   embedding_model
-   vector_reference
-   created_at

Caso seja utilizado pgvector, o vetor poderá residir nesta própria
tabela.

------------------------------------------------------------------------

## memories

Memórias permanentes do projeto.

Exemplos:

-   arquitetura escolhida
-   padrões definidos
-   convenções
-   decisões técnicas

Campos

-   id
-   project_id
-   title
-   content
-   importance
-   created_at
-   updated_at

Importância sugerida:

1 a 5

------------------------------------------------------------------------

## tool_calls

Registro completo das chamadas realizadas.

Campos

-   id
-   conversation_id
-   tool_name
-   parameters
-   status
-   started_at
-   finished_at

------------------------------------------------------------------------

## tool_results

Resultado das ferramentas.

Campos

-   id
-   tool_call_id
-   output
-   execution_time
-   success

------------------------------------------------------------------------

## jobs

Controle das tarefas assíncronas.

Campos

-   id
-   type
-   status
-   payload
-   created_at
-   finished_at

Exemplos:

-   indexação
-   embeddings
-   OCR
-   atualização de memória

------------------------------------------------------------------------

## settings

Configurações do sistema.

Campos

-   id
-   key
-   value

------------------------------------------------------------------------

# O que NÃO armazenar

Não salvar:

-   prompt final enviado à LLM
-   contexto reconstruído
-   respostas intermediárias
-   cache temporário

Esses elementos devem ser reconstruídos pelo Motor de Contexto.

------------------------------------------------------------------------

# Objetivos deste modelo

-   Histórico completo.
-   Separação entre conversa, memória e conhecimento.
-   Independência da implementação da LLM.
-   Escalabilidade para múltiplos projetos.
-   Facilidade para futuras integrações.

------------------------------------------------------------------------

# Próximo documento

O próximo documento será **02-chat-context-engine.md**, responsável por
definir como o backend reconstruirá o contexto enviado para a LLM a cada
interação.
