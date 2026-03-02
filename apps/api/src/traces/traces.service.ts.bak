import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TracesService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.trace.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { _count: { select: { logs: true } } },
    });
  }

  async findOne(projectId: string, traceId: string) {
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
    });
    if (!trace) return null;
    const logs = await this.prisma.log.findMany({
      where: { traceId },
      orderBy: { timestamp: 'asc' },
      take: 500,
    });
    const screenshots = await this.prisma.screenshot.findMany({
      where: { traceId },
      orderBy: { ts: 'asc' },
    });
    return { trace, logs, screenshots };
  }

  async findIssues(projectId: string) {
    return this.prisma.issue.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findPatterns(projectId: string) {
    return this.prisma.pattern.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
