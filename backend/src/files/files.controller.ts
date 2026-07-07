import { Controller, Get, Param, Query } from '@nestjs/common';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('project/:projectId')
  listByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.files.listByProject(projectId, limit, offset);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.files.findOne(id);
  }
}
