import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from '../files/files.service';
import { IndexingService, IndexFileResult } from '../rag/indexing.service';
import { LogicalModelsService } from './logical-models.service';
import { OpenAiAuthGuard } from './openai-auth.guard';

@Controller('v1/files')
@UseGuards(OpenAiAuthGuard)
export class OpenWebuiFilesController {
  constructor(
    private readonly files: FilesService,
    private readonly indexing: IndexingService,
    private readonly models: LogicalModelsService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number },
    @Body() body: { project_id?: string; model?: string; auto_index?: string },
  ) {
    if (!file) {
      return { error: { message: 'Arquivo não enviado' } };
    }

    const projectId = body.project_id || this.models.resolveProjectId(body.model);
    const saved = await this.files.saveUpload(projectId, file.originalname, file.buffer);

    const shouldIndex = body.auto_index !== 'false';
    let indexResult: IndexFileResult | null = null;

    if (shouldIndex) {
      indexResult = await this.indexing.indexFromDisk({
        projectId,
        filePath: saved.path,
        filename: saved.filename,
      });
    }

    return {
      id: saved.id,
      object: 'file',
      filename: saved.filename,
      bytes: saved.size,
      project_id: projectId,
      indexed: indexResult?.indexed ?? false,
      skipped: indexResult?.skipped ?? false,
      chunks_count: indexResult?.chunksCount ?? 0,
    };
  }
}
