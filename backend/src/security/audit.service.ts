import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditEntry } from './security.types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    return this.prisma.toolAuditLog.create({
      data: {
        projectId: entry.projectId,
        conversationId: entry.conversationId,
        toolCallId: entry.toolCallId,
        userId: entry.userId,
        toolName: entry.toolName,
        parameters: entry.parameters as Prisma.InputJsonValue,
        result: entry.result
          ? (entry.result as Prisma.InputJsonValue)
          : undefined,
        success: entry.success,
        executionTime: entry.executionTime,
        approved: entry.approved,
        approvedBy: entry.approvedBy,
        errorCode: entry.errorCode,
        policyBlocked: entry.policyBlocked ?? false,
      },
    });
  }

  async findByProject(projectId: string, limit = 50) {
    return this.prisma.toolAuditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByConversation(conversationId: string, limit = 50) {
    return this.prisma.toolAuditLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
