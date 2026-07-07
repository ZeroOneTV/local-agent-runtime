# 02 - Chat Context Engine

> Objetivo: definir como o backend reconstrói o contexto enviado à LLM
> em cada interação, evitando enviar todo o histórico e mantendo
> respostas consistentes.

------------------------------------------------------------------------

# Filosofia

A LLM **não possui memória própria**.

Toda "memória" é reconstruída pelo backend antes de cada chamada.

A responsabilidade da LLM é apenas raciocinar sobre o contexto recebido.

------------------------------------------------------------------------

# Fluxo geral

``` text
Nova mensagem

↓

Carregar projeto

↓

Carregar conversa

↓

Montar contexto

↓

Enviar para a LLM

↓

Receber resposta

↓

Persistir histórico

↓

Atualizar resumo/memória (quando necessário)
```

------------------------------------------------------------------------

# Camadas de contexto

A montagem do contexto sempre seguirá a mesma ordem.

## 1. Instruções do sistema

Informações fixas:

-   identidade do assistente
-   idioma
-   regras globais
-   formato esperado
-   políticas do projeto

Sempre presentes.

------------------------------------------------------------------------

## 2. Configuração do projeto

Informações permanentes.

Exemplos:

-   arquitetura
-   stack
-   convenções
-   diretórios permitidos
-   objetivos do projeto

Origem:

-   projects
-   settings
-   memories (alta importância)

------------------------------------------------------------------------

## 3. Resumo da conversa

Nunca reenviar toda a conversa.

Enviar:

-   resumo incremental
-   objetivo atual
-   decisões tomadas
-   pendências

Origem:

conversation_summaries

------------------------------------------------------------------------

## 4. Histórico recente

Janela deslizante.

Exemplo inicial:

-   últimas 10 a 20 mensagens

Não utilizar quantidade fixa de tokens nesta fase; essa política poderá
ser refinada posteriormente.

------------------------------------------------------------------------

## 5. Memórias relevantes

Consultar apenas memórias relacionadas ao pedido atual.

Exemplos:

-   padrões definidos
-   decisões arquiteturais
-   preferências permanentes

As memórias devem ser ranqueadas por:

-   importância
-   similaridade
-   atualização

------------------------------------------------------------------------

## 6. Conhecimento do projeto (RAG)

Buscar somente o necessário.

Entradas possíveis:

-   arquivos
-   documentação
-   código
-   READMEs
-   diagramas processados

Nunca enviar arquivos completos.

Enviar apenas chunks relevantes.

------------------------------------------------------------------------

## 7. Resultados recentes de tools

Caso uma tool tenha acabado de executar, seu resultado deve entrar no
contexto.

Exemplo:

``` text
Tool:
search_project()

Resultado:
12 arquivos encontrados...
```

------------------------------------------------------------------------

## 8. Mensagem atual

Último elemento do prompt.

Sempre preservada integralmente.

------------------------------------------------------------------------

# Ordem final

``` text
System

↓

Projeto

↓

Resumo

↓

Histórico recente

↓

Memórias

↓

RAG

↓

Resultados de tools

↓

Mensagem atual
```

------------------------------------------------------------------------

# Resumos incrementais

O resumo nunca deve ser refeito do zero.

Fluxo:

``` text
Mensagem 1-50

↓

Resumo A

↓

Mensagens 51-80

↓

Atualizar Resumo A

↓

Salvar nova versão
```

O campo generated_until_message_id define até onde o resumo cobre a
conversa.

------------------------------------------------------------------------

# Política de atualização

Atualizar resumo quando ocorrer um dos eventos:

-   muitas mensagens desde o último resumo
-   muitos tokens acumulados
-   conclusão de uma tarefa importante
-   troca significativa de assunto

Os limites exatos serão configuráveis.

------------------------------------------------------------------------

# Contexto temporário

Algumas informações vivem apenas durante uma execução.

Exemplos:

-   saída de terminal
-   diff do Git
-   conteúdo de clipboard
-   resposta HTTP

Esses dados:

-   não entram em memories
-   não entram no resumo automaticamente
-   podem ser descartados ao final da interação

------------------------------------------------------------------------

# Contexto permanente

Só deve virar memória quando representar conhecimento duradouro.

Exemplos:

-   "Utilizar NestJS como backend."
-   "Nunca executar tools fora do root_path."
-   "Arquitetura baseada em DDD."

Não salvar automaticamente.

O backend decidirá ou solicitará confirmação.

------------------------------------------------------------------------

# Responsabilidades

Backend:

-   montar contexto
-   consultar banco
-   consultar RAG
-   selecionar memórias
-   controlar orçamento de contexto
-   persistir histórico

LLM:

-   interpretar contexto
-   planejar
-   responder
-   solicitar tools quando necessário

------------------------------------------------------------------------

# Objetivos

-   minimizar consumo de tokens
-   manter consistência entre sessões
-   evitar contexto irrelevante
-   permitir conversas muito longas
-   tornar o comportamento independente do modelo utilizado

------------------------------------------------------------------------

# Próximo documento

03-memory-rag.md --- definição da memória permanente, estratégia de
embeddings, indexação e recuperação de conhecimento.
