import { Controller, Get, Param } from '@nestjs/common';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('project/:projectId')
  listByProject(@Param('projectId') projectId: string) {
    return this.files.listByProject(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.files.findOne(id);
  }
}
