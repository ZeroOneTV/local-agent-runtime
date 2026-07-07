# 03 - Memory & RAG

> Objetivo: definir como o sistema aprende sobre um projeto ao longo do
> tempo, separando conhecimento permanente de conhecimento recuperável.

------------------------------------------------------------------------

# Princípio fundamental

Existem dois tipos de conhecimento:

## Memória

Conhecimento permanente.

Exemplos:

-   padrões arquiteturais
-   decisões técnicas
-   preferências do usuário
-   convenções

É pequeno, altamente relevante e raramente muda.

------------------------------------------------------------------------

## RAG

Conhecimento recuperável.

Exemplos:

-   código-fonte
-   PDFs
-   documentação
-   READMEs
-   imagens processadas
-   páginas indexadas

É potencialmente enorme e consultado sob demanda.

------------------------------------------------------------------------

# Arquitetura

``` text
Projeto

↓

Arquivos

↓

Chunking

↓

Embeddings

↓

Banco Vetorial

↓

Busca Semântica

↓

Context Engine

↓

LLM
```

------------------------------------------------------------------------

# Pipeline de indexação

Sempre que um arquivo novo for detectado:

``` text
Arquivo

↓

Hash

↓

Mudou?

↓

Sim

↓

Extrair conteúdo

↓

Chunking

↓

Embeddings

↓

Salvar

↓

Atualizar índice
```

Arquivos sem alteração não devem ser reprocessados.

------------------------------------------------------------------------

# Chunking

Objetivos:

-   preservar contexto
-   minimizar perda semântica
-   otimizar recuperação

Diretrizes iniciais:

-   chunks com tamanho configurável
-   pequena sobreposição entre chunks
-   preservar títulos e blocos lógicos quando possível

A política exata será parametrizável.

------------------------------------------------------------------------

# Embeddings

Cada chunk gera:

-   vetor
-   referência ao arquivo
-   posição
-   modelo utilizado
-   data de indexação

Caso o modelo de embedding seja alterado, todos os embeddings daquele
projeto deverão ser regenerados.

------------------------------------------------------------------------

# Busca

A recuperação deve considerar:

-   similaridade vetorial
-   prioridade do arquivo
-   tipo do documento
-   proximidade entre chunks

Não retornar apenas pelo score.

O backend poderá combinar regras heurísticas.

------------------------------------------------------------------------

# Tipos de documentos

Inicialmente:

-   código
-   markdown
-   txt
-   json
-   yaml
-   pdf
-   imagens OCR
-   páginas HTML processadas

Cada tipo poderá possuir pipeline próprio.

------------------------------------------------------------------------

# Memória permanente

Memórias representam conhecimento consolidado.

Nunca devem ser criadas automaticamente sem critério.

Exemplos válidos:

-   "Backend utiliza NestJS."
-   "Todos os IDs são UUID."
-   "Utilizar PostgreSQL."

Exemplos inválidos:

-   "Usuário perguntou sobre Docker."
-   "Foi executada uma tool."

------------------------------------------------------------------------

# Criação de memória

Uma memória pode nascer de:

-   confirmação explícita do usuário
-   decisão arquitetural importante
-   regra permanente do projeto
-   síntese validada pelo backend

Cada memória recebe:

-   título
-   conteúdo
-   importância (1-5)
-   origem
-   data de criação

------------------------------------------------------------------------

# Atualização de memória

Quando uma memória conflitar com outra:

1.  localizar memória existente
2.  criar nova versão ou substituir
3.  registrar histórico da alteração

Nunca sobrescrever silenciosamente.

------------------------------------------------------------------------

# Reindexação

Reindexar quando:

-   hash do arquivo mudar
-   arquivo for renomeado
-   modelo de embedding mudar
-   configuração de chunking mudar

------------------------------------------------------------------------

# Exclusão

Ao remover um arquivo:

-   remover chunks
-   remover embeddings
-   preservar histórico de auditoria quando aplicável

------------------------------------------------------------------------

# Limites

O Context Engine deve recuperar apenas os chunks mais relevantes.

Nunca enviar:

-   arquivo completo
-   diretório inteiro
-   projeto inteiro

------------------------------------------------------------------------

# Responsabilidades

Backend:

-   detectar alterações
-   gerar chunks
-   gerar embeddings
-   armazenar vetores
-   recuperar contexto relevante

LLM:

-   interpretar os trechos recuperados
-   citar inconsistências
-   solicitar novas buscas quando necessário

------------------------------------------------------------------------

# Objetivos

-   conhecimento escalável
-   baixo consumo de contexto
-   reindexação incremental
-   independência do modelo de embeddings
-   separação clara entre memória e RAG

------------------------------------------------------------------------

# Próximo documento

04-tool-system.md --- arquitetura das tools, permissões, contratos,
execução e integração com o orquestrador.
