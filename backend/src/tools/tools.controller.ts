import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';
import { ToolRouterService } from './tool-router.service';
import { ToolExecutionService } from './tool-execution.service';
import { ExecuteToolRequest } from './tools.types';

@Controller('tools')
export class ToolsController {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly router: ToolRouterService,
    private readonly execution: ToolExecutionService,
  ) {}

  @Get()
  list() {
    return this.registry.listDefinitions();
  }

  @Get('pending/:conversationId')
  getPending(@Param('conversationId') conversationId: string) {
    return this.execution.getPending(conversationId);
  }

  @Post('execute')
  execute(@Body() body: ExecuteToolRequest) {
    return this.router.route(body);
  }

  @Post('approve/:toolCallId')
  approve(
    @Param('toolCallId') toolCallId: string,
    @Body() body: { approvedBy?: string },
  ) {
    return this.router.approve(toolCallId, body.approvedBy);
  }

  @Post('reject/:toolCallId')
  reject(
    @Param('toolCallId') toolCallId: string,
    @Body() body: { userId?: string },
  ) {
    return this.router.reject(toolCallId, body.userId);
  }
}
