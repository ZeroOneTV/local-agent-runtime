import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { parsePagination, toPaginated } from '../common/pagination';

@Injectable()
export class JobsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(
    projectId: string,
    limit?: string | number,
    offset?: string | number,
    status?: string,
  ) {
    const { limit: take, offset: skip } = parsePagination(limit, offset);

    const where = {
      projectId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.job.count({ where }),
    ]);

    return toPaginated(items, total, take, skip);
  }
}
