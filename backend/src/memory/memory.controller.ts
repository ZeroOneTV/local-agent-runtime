import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryOrigin } from './memory.types';

@Controller('memories')
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string) {
    return this.memories.findByProject(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.memories.findOne(id);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.memories.getHistory(id);
  }

  @Post()
  create(
    @Body()
    body: {
      projectId: string;
      title: string;
      content: string;
      importance?: number;
      origin: MemoryOrigin;
      reason?: string;
    },
  ) {
    return this.memories.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      content?: string;
      importance?: number;
      reason: string;
    },
  ) {
    return this.memories.update(id, body);
  }
}
