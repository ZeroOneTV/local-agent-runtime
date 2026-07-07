import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IndexingService } from './indexing.service';
import { RetrievalService } from './retrieval.service';
import { computeContentHash } from './hash.service';
import { detectDocumentType } from './document-type';

@Controller('rag')
export class RagController {
  constructor(
    private readonly indexing: IndexingService,
    private readonly retrieval: RetrievalService,
  ) {}

  @Post('index')
  indexFromDisk(
    @Body()
    body: {
      projectId: string;
      filePath: string;
      filename: string;
      priority?: number;
    },
  ) {
    return this.indexing.indexFromDisk(body);
  }

  @Post('index-content')
  indexContent(
    @Body()
    body: {
      projectId: string;
      path: string;
      filename: string;
      content: string;
      priority?: number;
    },
  ) {
    return this.indexing.indexContent({
      projectId: body.projectId,
      path: body.path,
      filename: body.filename,
      content: body.content,
      hash: computeContentHash(body.content),
      documentType: detectDocumentType(body.filename),
      priority: body.priority,
    });
  }

  @Post('reindex/:projectId')
  reindexProject(@Param('projectId') projectId: string) {
    return this.indexing.reindexProject(projectId);
  }

  @Post('reindex-model/:projectId')
  reindexByModelChange(@Param('projectId') projectId: string) {
    return this.indexing.reindexByModelChange(projectId);
  }

  @Delete('files/:fileId')
  async removeFromIndex(@Param('fileId') fileId: string) {
    await this.indexing.removeFromIndex(fileId);
    return { success: true };
  }

  @Get('search')
  search(
    @Query('projectId') projectId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 5;
    return Promise.all([
      this.retrieval.searchRelevantMemories(projectId, query, n),
      this.retrieval.searchRankedChunks(projectId, query, n),
    ]).then(([memories, chunks]) => ({ memories, chunks }));
  }
}
