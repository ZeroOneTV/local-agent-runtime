import { Controller, Get, Param, Query } from '@nestjs/common';
import { JobsQueryService } from './jobs-query.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsQueryService) {}

  @Get('project/:projectId')
  listByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.jobs.listByProject(projectId, limit, offset, status);
  }
}
