import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  StructuredToolResult,
  ToolCallStatus,
  truncateToolOutput,
} from './tools.types';

@Injectable()
export class ToolExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createCall(
    conversationId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    status: ToolCallStatus = 'pending',
  ) {
    return this.prisma.toolCall.create({
      data: {
        conversationId,
        toolName,
        parameters: parameters as Prisma.InputJsonValue,
        status,
      },
    });
  }

  async markRunning(toolCallId: string) {
    return this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: { status: 'running' },
    });
  }

  async completeCall(
    toolCallId: string,
    result: StructuredToolResult,
    executionTimeMs: number,
  ) {
    const maxChars = this.config.get<number>('tools.maxOutputChars') ?? 4000;
    const output = truncateToolOutput(result, maxChars);

    await this.prisma.toolResult.create({
      data: {
        toolCallId,
        output,
        executionTime: executionTimeMs,
        success: result.success,
      },
    });

    return this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status: result.success ? 'success' : 'error',
        finishedAt: new Date(),
      },
      include: { result: true },
    });
  }

  async setStatus(toolCallId: string, status: ToolCallStatus) {
    return this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status,
        finishedAt: ['rejected', 'cancelled', 'error', 'success'].includes(status)
          ? new Date()
          : undefined,
      },
    });
  }

  async getPending(conversationId: string) {
    return this.prisma.toolCall.findMany({
      where: { conversationId, status: 'pending' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getAllPending(limit = 50) {
    return this.prisma.toolCall.findMany({
      where: { status: 'pending' },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
