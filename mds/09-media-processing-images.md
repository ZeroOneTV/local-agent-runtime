
# 09 - Media Processing Pipeline: Images

> Objetivo: adicionar suporte robusto ao processamento de imagens no projeto, usando uma pipeline local, modular e otimizada, sem jogar arquivos brutos diretamente para a LLM como estratégia principal.

---

# Visão geral

O sistema deve passar a aceitar imagens como entrada multimodal.

A imagem deve ser processada por uma pipeline especializada antes de entrar no raciocínio da LLM.

Fluxo geral:

```text
Open WebUI

↓

Backend /v1/files ou endpoint interno

↓

Storage

↓

Media Processing Job

↓

Image Processor

↓

OCR + Layout + Vision + Metadata

↓

Resultado estruturado

↓

Context Engine

↓

LLM textual

↓

Resposta / RAG / Memória
```

---

# Princípio fundamental

A LLM não deve ser usada como OCR principal.

A imagem deve ser convertida em evidências estruturadas:

- texto extraído
- blocos OCR
- layout
- tabelas
- descrição visual
- tags
- entidades
- resumo semântico
- metadados

A LLM deve raciocinar em cima desse resultado.

---

# Objetivos

- suportar imagens enviadas pelo Open WebUI
- salvar sempre a imagem original
- gerar thumbnail
- extrair OCR localmente
- extrair layout quando aplicável
- gerar descrição visual com modelo local quando disponível
- gerar artefato textual para RAG
- perguntar antes de indexar no projeto
- permitir busca futura por conteúdo visual/textual
- manter tudo auditável e reproduzível
- otimizar uso de CPU, RAM e GPU
- preparar a mesma base para áudio e vídeo no futuro

---

# Escopo inicial

Prioridade de tipos de imagem:

```text
1. screenshots de erro
2. screenshots de interface
3. diagramas
4. documentos escaneados
5. gráficos/tabelas
6. fotos reais
```

O sistema deve suportar fotos reais, mas o foco inicial de qualidade deve estar em prints, diagramas e documentos.

---

# Decisão arquitetural

Criar um módulo geral:

```text
backend/src/media/
```

Não criar apenas `image/`, pois áudio e vídeo serão adicionados depois.

Estrutura sugerida:

```text
backend/src/media/
├─ media.module.ts
├─ media.controller.ts
├─ media.service.ts
├─ media-storage.service.ts
├─ media-processing.service.ts
├─ media-context.service.ts
├─ media-rag.service.ts
├─ media.types.ts
├─ processors/
│  ├─ image.processor.ts
│  ├─ audio.processor.ts        # futuro
│  └─ video.processor.ts        # futuro
├─ providers/
│  ├─ ocr/
│  │  ├─ ocr-provider.interface.ts
│  │  ├─ paddle-ocr.provider.ts
│  │  └─ tesseract.provider.ts  # fallback opcional
│  ├─ layout/
│  │  ├─ layout-provider.interface.ts
│  │  └─ paddle-structure.provider.ts
│  ├─ document/
│  │  ├─ document-parser.interface.ts
│  │  └─ docling.provider.ts
│  └─ vision/
│     ├─ vision-provider.interface.ts
│     ├─ local-vlm.provider.ts
│     └─ disabled-vision.provider.ts
└─ dto/
```

---

# Worker Python

Para processamento robusto de mídia, criar um worker Python separado.

Motivo:

- PaddleOCR funciona melhor no ecossistema Python.
- Docling é Python-first.
- OpenCV, PIL, transformers e bibliotecas de visão têm melhor suporte em Python.
- Node/NestJS deve continuar sendo orquestrador, não executor pesado de visão.

Estrutura sugerida:

```text
media-worker/
├─ Dockerfile
├─ requirements.txt
├─ app/
│  ├─ main.py
│  ├─ worker.py
│  ├─ config.py
│  ├─ processors/
│  │  └─ image_processor.py
│  ├─ providers/
│  │  ├─ paddle_ocr_provider.py
│  │  ├─ paddle_structure_provider.py
│  │  ├─ docling_provider.py
│  │  └─ local_vlm_provider.py
│  └─ schemas/
│     └─ image_result.py
```

---

# Relação entre backend e worker

O backend continua controlando:

- permissões
- jobs
- eventos
- persistência
- contexto
- RAG
- decisões de salvar/indexar

O worker Python executa:

- pré-processamento
- OCR
- layout
- parsing documental
- caption visual
- geração de resultado bruto estruturado

Fluxo:

```text
NestJS cria job

↓

BullMQ / fila

↓

media-worker consome

↓

processa imagem

↓

retorna JSON estruturado

↓

NestJS salva resultado

↓

Context Engine usa
```

---

# Provedores recomendados

## OCR principal

Usar:

```text
PaddleOCR
```

Motivo:

- robusto
- local
- bom para prints, documentos e screenshots
- suporta múltiplos idiomas
- mais moderno que Tesseract em muitos cenários

---

## Layout/documentos

Usar:

```text
PP-Structure / PaddleOCR structure
```

Para:

- documentos
- tabelas
- blocos
- ordem visual
- layout de página

---

## Document parsing

Usar:

```text
Docling
```

Para:

- documentos complexos
- páginas convertidas
- estrutura em Markdown
- tabelas
- PDFs/imagens documentais

---

## Vision-language model local

Usar provider abstrato:

```text
LocalVLMProvider
```

Modelos possíveis no futuro:

- Qwen2.5-VL
- MiniCPM-V
- LLaVA
- Gemma multimodal

O provider deve poder ficar desabilitado inicialmente se a máquina não tiver RAM/VRAM suficiente.

---

# Otimização de hardware

O sistema não deve rodar tudo sempre sem necessidade.

Deve existir um modo de processamento adaptativo.

---

## Modos de processamento

```text
fast
balanced
full
```

### fast

Executa:

- metadata
- thumbnail
- OCR básico

Indicado para:

- imagens pequenas
- uso rápido na conversa
- máquinas com pouca RAM

---

### balanced

Executa:

- metadata
- thumbnail
- OCR
- layout simples
- resumo semântico textual

Indicado como padrão.

---

### full

Executa:

- metadata
- thumbnail
- OCR
- layout
- document parsing
- table extraction
- VLM local
- tags
- entidades
- image_context.md para RAG

Indicado para:

- imagem importante
- indexação no projeto
- documentação
- diagramas
- análise profunda

---

# Política padrão

Usar:

```text
balanced
```

Por padrão.

Usar:

```text
full
```

Quando:

- usuário pedir análise profunda
- imagem for salva no projeto
- imagem for documento/diagrama importante
- imagem for indexada no RAG
- tarefa for assíncrona

Usar:

```text
fast
```

Quando:

- imagem for muito simples
- usuário fizer pergunta rápida
- LLM estiver indisponível
- recursos do sistema estiverem limitados

---

# Detecção adaptativa

Antes de decidir a pipeline completa, executar etapa leve:

```text
metadata + thumbnail + heurísticas
```

Coletar:

- largura
- altura
- formato
- tamanho em bytes
- proporção
- quantidade aproximada de texto
- se parece screenshot
- se parece documento
- se parece foto

Com base nisso, escolher rota.

---

# Heurísticas iniciais

```text
Se imagem tem muito texto:
  priorizar OCR/layout

Se imagem parece documento:
  usar OCR + layout + docling

Se imagem parece screenshot de erro:
  usar OCR + classificação + tags técnicas

Se imagem parece diagrama:
  usar OCR + VLM se disponível

Se imagem parece foto real:
  usar VLM se disponível

Se imagem é muito grande:
  gerar versão reduzida para VLM e manter original salva
```

---

# Storage

Toda imagem enviada deve ser salva.

Estrutura sugerida:

```text
storage/
├─ media/
│  ├─ images/
│  │  ├─ originals/
│  │  ├─ thumbnails/
│  │  ├─ processed/
│  │  └─ contexts/
│  └─ temp/
```

Exemplo:

```text
storage/media/images/originals/{projectId}/{imageId}.png
storage/media/images/thumbnails/{projectId}/{imageId}.webp
storage/media/images/processed/{projectId}/{imageId}.json
storage/media/images/contexts/{projectId}/{imageId}.md
```

---

# Banco de dados

Reaproveitar `files` para indexação RAG, mas criar tabelas próprias para mídia.

## media_assets

Representa o arquivo original.

Campos sugeridos:

- id
- project_id
- conversation_id
- source
- media_type
- mime_type
- original_path
- thumbnail_path
- hash
- size
- width
- height
- duration
- status
- created_at
- updated_at

Valores:

```text
media_type:
- image
- audio
- video

source:
- conversation_upload
- project_asset
- external_url
```

---

## media_processing_results

Resultado consolidado do processamento.

Campos:

- id
- media_asset_id
- processing_mode
- status
- provider_versions
- result_json
- context_markdown_path
- error
- started_at
- finished_at
- created_at

---

## media_ocr_blocks

Blocos de OCR com coordenadas.

Campos:

- id
- media_asset_id
- provider
- text
- confidence
- bbox
- page
- order_index
- created_at

---

## media_layout_blocks

Blocos estruturais.

Campos:

- id
- media_asset_id
- provider
- block_type
- content
- confidence
- bbox
- order_index
- created_at

block_type:

- title
- paragraph
- table
- figure
- code
- ui_element
- error_message
- chart
- unknown

---

## media_tags

Tags textuais para busca.

Campos:

- id
- media_asset_id
- tag
- source
- confidence

source:

- ocr
- layout
- vision
- llm
- user

---

# Resultado estruturado

O worker deve retornar JSON padronizado.

Exemplo:

```json
{
  "mediaId": "...",
  "type": "image",
  "imageType": "error_screenshot",
  "processingMode": "balanced",
  "metadata": {
    "width": 1280,
    "height": 720,
    "format": "png",
    "sizeBytes": 321000,
    "sha256": "..."
  },
  "ocr": {
    "provider": "paddleocr",
    "language": ["pt", "en"],
    "fullText": "...",
    "blocks": [
      {
        "text": "Error: PrismaClientKnownRequestError",
        "bbox": [10, 20, 500, 60],
        "confidence": 0.97
      }
    ]
  },
  "layout": {
    "provider": "paddle-structure",
    "blocks": [
      {
        "type": "error_message",
        "content": "...",
        "bbox": [10, 20, 500, 140],
        "confidence": 0.92
      }
    ]
  },
  "vision": {
    "provider": "local-vlm",
    "enabled": false,
    "summary": null,
    "objects": [],
    "uiElements": []
  },
  "semantic": {
    "summary": "Screenshot showing a backend error related to Prisma validation.",
    "tags": ["prisma", "backend", "error", "nestjs"],
    "entities": ["Prisma", "NestJS"],
    "possibleIntent": "debugging"
  },
  "warnings": [
    "VLM disabled; visual summary generated from OCR/layout only."
  ]
}
```

---

# image_context.md

Além do JSON, gerar um Markdown para RAG.

Exemplo:

```md
# Image Context

## Type
error_screenshot

## Summary
Screenshot showing a backend error related to Prisma validation.

## OCR Text
Error: PrismaClientKnownRequestError...

## Important Blocks
- Error message: ...
- File path: ...
- Stack trace: ...

## Entities
- Prisma
- NestJS
- Tool approval endpoint

## Tags
prisma, backend, error, nestjs

## Notes
This image was uploaded during a conversation and has not yet been promoted to project knowledge.
```

Esse arquivo é mais adequado para embeddings do que JSON cru.

---

# Integração com RAG

Toda imagem pode gerar um `image_context.md`.

Por padrão:

```text
usar na conversa atual
não indexar no projeto sem confirmação
```

Após processamento, o sistema deve perguntar:

```text
A imagem foi processada.

Deseja salvar esta análise como conhecimento do projeto?

Opções:
1. Apenas usar nesta conversa
2. Indexar no RAG do projeto
3. Salvar como asset do projeto
4. Criar memória permanente a partir de uma decisão detectada
```

---

# Modos de salvamento

## Apenas conversa

- salva original
- salva resultado processado
- contexto disponível na conversa atual
- não entra no RAG global do projeto

---

## RAG do projeto

- cria ou atualiza registro em `files`
- usa `image_context.md`
- cria chunks
- gera embeddings
- futuras conversas podem recuperar

---

## Asset do projeto

- marca `media_assets.source = project_asset`
- mantém original e thumbnail como material do projeto
- pode ou não indexar no RAG

---

## Memória permanente

- nunca automática
- exige confirmação
- salva apenas decisões duradouras em `memories`

---

# Integração com Context Engine

Adicionar nova camada ou subcamada:

```text
Media Context
```

Pode entrar após RAG ou como parte de RAG/resultados recentes.

Ordem sugerida:

```text
System
Projeto
Resumo
Histórico recente
Memórias
RAG
Media Context
Tool Results
Mensagem atual
```

Media Context deve incluir:

- imagens recém enviadas
- resultados processados
- OCR/resumo/tags relevantes
- status de processamento

Não incluir JSON enorme integralmente se não for necessário.

---

# Integração com Tool System

Adicionar tools:

```text
process_image
search_media
promote_media_to_project
index_media_context
get_media_result
```

---

## process_image

Tipo:

```text
async por padrão
```

Risco:

```text
low
```

Aprovação:

```text
não
```

Entrada:

```json
{
  "mediaAssetId": "...",
  "mode": "balanced"
}
```

Saída:

```json
{
  "success": true,
  "mediaAssetId": "...",
  "resultId": "...",
  "summary": "...",
  "tags": []
}
```

---

## search_media

Busca imagens processadas.

Entrada:

```json
{
  "projectId": "...",
  "query": "erro prisma aprovação",
  "scope": "conversation_or_project"
}
```

Busca em:

- OCR text
- tags
- semantic summary
- RAG
- metadata

---

## promote_media_to_project

Promove imagem/análise para conhecimento do projeto.

Exige confirmação do usuário.

Entrada:

```json
{
  "mediaAssetId": "...",
  "indexRag": true,
  "saveAsProjectAsset": true
}
```

---

## index_media_context

Indexa o `image_context.md` no RAG.

Exige confirmação se não foi explicitamente solicitado.

---

## get_media_result

Recupera resultado estruturado de uma imagem.

---

# Integração com Jobs

Criar fila:

```text
media-processing
```

Jobs:

```text
process_image
process_image_full
promote_media
reprocess_media
```

Estados:

```text
pending
running
completed
failed
cancelled
```

Eventos:

```text
media.uploaded
media.processing.started
media.processing.progress
media.processing.completed
media.processing.failed
media.indexing.pending_approval
media.indexed
```

---

# Fluxo completo

```text
1. Usuário envia imagem no Open WebUI
2. Backend recebe arquivo
3. Backend salva original
4. Backend cria thumbnail
5. Backend cria media_asset
6. Backend cria job process_image
7. Worker Python processa
8. Worker retorna JSON estruturado
9. Backend salva resultados
10. Backend gera image_context.md
11. Context Engine usa resultado na conversa atual
12. LLM responde com base no resultado
13. Sistema pergunta se deve salvar no projeto/RAG
14. Se usuário aprovar, indexa image_context.md
15. Futuras buscas recuperam o conteúdo
```

---

# Fluxo para pergunta sobre imagem recém enviada

Usuário:

```text
O que esse print mostra?
```

Sistema:

```text
1. localiza imagem recém enviada
2. se já processada, recupera resultado
3. se não processada, cria process_image
4. aguarda resultado se for rápido
5. se demorar, responde que está processando
6. envia resultado ao Context Engine
7. LLM responde
```

---

# Fluxo para busca futura

Usuário:

```text
Aquele print do erro do Prisma tinha o quê mesmo?
```

Sistema:

```text
1. classifica como busca de mídia
2. search_media
3. busca OCR/tags/resumo/RAG
4. recupera media result
5. Context Engine injeta resumo relevante
6. LLM responde
```

---

# Segurança

Processamento de imagem é geralmente low risk, mas deve aplicar:

- limite de tamanho
- limite de dimensões
- validação MIME
- bloqueio de arquivos malformados
- scan básico de extensão real
- timeout
- isolamento do worker
- não executar conteúdo embutido
- não seguir links externos automaticamente
- não indexar no projeto sem confirmação

---

# Limites sugeridos

Configurações iniciais:

```env
MEDIA_MAX_IMAGE_SIZE_MB=25
MEDIA_MAX_IMAGE_WIDTH=8000
MEDIA_MAX_IMAGE_HEIGHT=8000
MEDIA_DEFAULT_PROCESSING_MODE=balanced
MEDIA_ENABLE_VLM=false
MEDIA_ENABLE_DOCLING=true
MEDIA_ENABLE_PADDLEOCR=true
MEDIA_GENERATE_THUMBNAILS=true
MEDIA_REQUIRE_CONFIRMATION_TO_INDEX=true
MEDIA_WORKER_CONCURRENCY=1
```

Concorrência inicial 1 para evitar consumo excessivo de RAM/VRAM.

---

# Otimização

## Não processar duplicados

Usar hash SHA-256.

Se a mesma imagem já foi processada com:

- mesmo hash
- mesmo modo
- mesmos providers
- mesma versão

então reaproveitar resultado.

---

## Evitar VLM desnecessário

Não chamar VLM quando:

- OCR/layout já resolve
- imagem é documento puro
- usuário só pediu texto
- modo fast/balanced sem necessidade visual

---

## Redimensionamento inteligente

Para VLM:

- manter original salvo
- gerar versão menor para inferência
- limitar resolução de entrada
- preservar aspecto

---

## Cache

Cachear:

- OCR
- layout
- image_context.md
- thumbnail
- tags

---

## Execução assíncrona

Imagens pequenas podem ser processadas rapidamente.

Mas a arquitetura deve tratar tudo como job para evitar travar o chat.

O backend pode aguardar alguns segundos pelo resultado.

Exemplo:

```text
Se job terminar em até 5s:
  responder direto

Se passar de 5s:
  informar que está processando e emitir evento ao concluir
```

---

# Docker

Adicionar serviço opcional:

```yaml
media-worker:
  build:
    context: ./media-worker
  environment:
    - REDIS_URL=redis://redis:6379
    - DATABASE_URL=${DATABASE_URL}
    - STORAGE_ROOT=/app/storage
    - MEDIA_ENABLE_PADDLEOCR=true
    - MEDIA_ENABLE_DOCLING=true
    - MEDIA_ENABLE_VLM=false
  volumes:
    - ./storage:/app/storage
  depends_on:
    - redis
    - postgres
  profiles:
    - media
```

Subida:

```bash
docker compose --profile media up -d
```

---

# Dependências Python sugeridas

Inicial:

```text
paddleocr
paddlepaddle
opencv-python-headless
pillow
pydantic
redis
python-dotenv
```

Document parsing:

```text
docling
```

Vision local futuro:

```text
transformers
accelerate
torch
qwen-vl-utils
```

Não instalar stack VLM pesada por padrão.

Separar em extras:

```text
requirements.txt
requirements-vision.txt
requirements-docling.txt
```

---

# Configuração de provedores

Criar abstrações:

```text
OCRProvider
LayoutProvider
DocumentParserProvider
VisionProvider
```

Isso permite trocar:

```text
PaddleOCR → outro OCR
Docling → outro parser
Qwen-VL → outro VLM
```

sem alterar o restante do sistema.

---

# Eventos para frontend/Open WebUI

Como Open WebUI pode não suportar UI nativa de progresso, o backend deve emitir mensagens/eventos.

Exemplo de resposta inicial:

```text
Recebi a imagem e iniciei o processamento.

Status:
- OCR: em andamento
- Layout: aguardando
- Vision: desabilitado

Avisarei quando concluir.
```

Ao concluir:

```text
Imagem processada.

Resumo:
...

Texto detectado:
...

Deseja indexar isso no RAG do projeto?
```

---

# API sugerida

## Upload

```text
POST /media/upload
```

Multipart:

```text
file
projectId
conversationId
source
```

---

## Processar

```text
POST /media/:id/process
```

Body:

```json
{
  "mode": "balanced"
}
```

---

## Resultado

```text
GET /media/:id/result
```

---

## Promover para projeto

```text
POST /media/:id/promote
```

Body:

```json
{
  "indexRag": true,
  "saveAsProjectAsset": true
}
```

---

## Buscar mídia

```text
GET /media/search?projectId=...&q=...
```

---

# Alterações no OpenAI-compatible /v1/files

O endpoint `/v1/files` deve detectar imagens.

Se MIME for imagem:

```text
1. criar media_asset
2. salvar original
3. criar process_image job
4. retornar file id compatível
```

Não tentar indexar imagem como texto cru.

---

# Relação com files/file_chunks/embeddings

Quando uma imagem for indexada no RAG:

```text
media_asset
    ↓
image_context.md
    ↓
files
    ↓
file_chunks
    ↓
embeddings
```

O `files.documentType` deve ser:

```text
image_context
```

Ou equivalente.

---

# Critérios de aceite

A implementação estará correta quando:

```text
[ ] Upload de imagem salva original no storage
[ ] Thumbnail é gerada
[ ] media_asset é criado
[ ] process_image job é criado
[ ] worker processa OCR local
[ ] resultado estruturado é salvo
[ ] image_context.md é gerado
[ ] Context Engine usa resultado na conversa atual
[ ] sistema pergunta antes de indexar no RAG do projeto
[ ] aprovação indexa image_context.md
[ ] busca futura encontra a imagem por OCR/tags/resumo
[ ] imagem duplicada reaproveita cache por hash
[ ] limites de tamanho/dimensão são aplicados
[ ] VLM pode ficar desabilitado sem quebrar pipeline
[ ] eventos media.processing.* são emitidos
```

---

# O que não implementar agora

Não implementar ainda:

- processamento completo de vídeo
- processamento completo de áudio
- notificação Windows nativa
- VLM obrigatório
- busca por embedding visual puro
- edição/generation de imagem
- detecção avançada de objetos em tempo real

Esses pontos devem usar a mesma base do Media Pipeline no futuro.

---

# Roadmap futuro

## Áudio

```text
audio upload
↓
transcrição local
↓
segmentação
↓
resumo
↓
RAG
```

## Vídeo

```text
video upload
↓
extrair áudio
↓
transcrever
↓
extrair frames-chave
↓
processar frames como imagens
↓
resumo multimodal
↓
RAG
```

## Visual embeddings

```text
imagem
↓
embedding visual
↓
busca por similaridade visual
```

## VLM local completo

```text
imagem + prompt
↓
modelo vision local
↓
resposta multimodal
```

---

# Conclusão

O suporte a imagens deve ser implementado como parte de uma pipeline de mídia robusta, não como chamada direta à LLM.

A solução recomendada é:

```text
Open WebUI
↓
Backend
↓
Media Pipeline
↓
Python Worker
↓
PaddleOCR / Layout / Docling / VLM opcional
↓
Resultado estruturado
↓
Context Engine
↓
LLM
↓
RAG ou memória mediante confirmação
```

Essa abordagem mantém o projeto local-first, auditável, eficiente e preparado para áudio/vídeo sem refatoração grande.
