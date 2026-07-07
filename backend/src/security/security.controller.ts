import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit/project/:projectId')
  auditByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.findByProject(
      projectId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('audit/conversation/:conversationId')
  auditByConversation(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.findByConversation(
      conversationId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
