import { Injectable } from '@nestjs/common';
import { CreateIssueDto } from './create-issue.dto';
import { CreatePatternDto } from './create-pattern.dto';
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

  async createIssue(projectId: string, dto: CreateIssueDto, userId?: string) {
    return this.prisma.issue.create({
      data: {
        projectId,
        featureId:   dto.featureId,
        title:       dto.title,
        type:        dto.type,
        priority:    dto.priority,
        description: dto.description ?? null,
        traceId:     dto.traceId    ?? null,
        createdById: userId         ?? null,
        status:      '未対応',
      },
    });
  }

  async createPattern(projectId: string, dto: CreatePatternDto, userId?: string) {
    return this.prisma.pattern.create({
      data: {
        projectId,
        name:       dto.name,
        screenMode: dto.screenMode ?? null,
        seqData:    dto.seqData ?? {},
        memo:       dto.memo ?? null,
        createdById: userId ?? null,
        status:     '未評価',
      },
    });
  }

  async getLogs(projectId: string, traceId: string) {
    const [logs, screenshots] = await Promise.all([
      this.prisma.log.findMany({
        where: { traceId },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.screenshot.findMany({
        where: { traceId },
        orderBy: { ts: 'asc' },
      }),
    ]);

    // screenshotをtimestampで最近傍マッチしてlogに付与
    const logsWithScreenshot = logs.map(log => {
      const logTs = new Date(log.timestamp).getTime();
      // 同じfeatureId(screenName)のscreenshot群から最近傍を探す
      const candidates = screenshots.filter(
        ss => ss.featureId === log.screenName || ss.featureId === 'UNKNOWN'
      );
      const nearest = candidates.reduce((best, ss) => {
        if (!best) return ss;
        const diff = Math.abs(new Date(ss.ts).getTime() - logTs);
        const bestDiff = Math.abs(new Date(best.ts).getTime() - logTs);
        return diff < bestDiff ? ss : best;
      }, null as typeof screenshots[0] | null);

      return {
        ...log,
        screenshotPath: log.screenshotPath || (nearest ? nearest.filePath : null),
      };
    });

    return logsWithScreenshot;
  }

  async forceStop(projectId: string, traceId: string) {
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
    });
    if (!trace) throw new Error('Trace not found');
    return this.prisma.trace.update({
      where: { id: traceId },
      data: { status: 'COMPLETED', endedAt: new Date() },
    });
  }
}
