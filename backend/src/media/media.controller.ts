import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { ProcessingMode } from './media.types';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype?: string },
    @Body() body: { projectId: string; conversationId?: string },
  ) {
    if (!file) return { error: 'Arquivo não enviado' };
    const asset = await this.media.uploadImage({
      projectId: body.projectId,
      conversationId: body.conversationId,
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
    return { mediaAssetId: asset.id, status: asset.status };
  }

  @Post(':id/process')
  async process(
    @Param('id') id: string,
    @Body() body: { mode?: ProcessingMode; wait?: boolean },
  ) {
    if (body.wait) {
      const result = await this.media.processImageSync(id, body.mode);
      return {
        mediaAssetId: id,
        resultId: result.id,
        status: 'status' in result ? result.status : 'completed',
      };
    }
    return this.media.enqueueProcessImage(id, body.mode);
  }

  @Get(':id')
  getResult(
    @Param('id') id: string,
    @Query('includeRawJson') includeRawJson?: string,
    @Query('includeMarkdown') includeMarkdown?: string,
    @Query('includeBlocks') includeBlocks?: string,
  ) {
    return this.media.getResult(id, {
      includeRawJson: includeRawJson !== 'false',
      includeMarkdown: includeMarkdown === 'true',
      includeBlocks: includeBlocks === 'true',
    });
  }

  @Get()
  search(
    @Query('projectId') projectId: string,
    @Query('query') query: string,
    @Query('conversationId') conversationId?: string,
    @Query('scope') scope?: 'conversation' | 'project' | 'conversation_or_project',
  ) {
    return this.media.searchMedia({ projectId, query, conversationId, scope });
  }

  @Post(':id/promote')
  promote(
    @Param('id') id: string,
    @Body() body: { indexRag?: boolean; saveAsProjectAsset?: boolean },
  ) {
    return this.media.promoteToProject({
      mediaAssetId: id,
      indexRag: body.indexRag,
      saveAsProjectAsset: body.saveAsProjectAsset,
    });
  }

  @Post(':id/index')
  index(@Param('id') id: string) {
    return this.media.indexMediaContext(id);
  }
}
