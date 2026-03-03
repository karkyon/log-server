import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async resetProjectData(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`プロジェクト "${slug}" が見つかりません`);

    const traces = await this.prisma.trace.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });
    const traceIds = traces.map((t: { id: string }) => t.id);

    const [logs, patterns, issues, apiKeys] = await Promise.all([
      this.prisma.log.deleteMany({ where: { traceId: { in: traceIds } } }),
      this.prisma.pattern.deleteMany({ where: { projectId: project.id } }),
      this.prisma.issue.deleteMany({ where: { projectId: project.id } }),
      this.prisma.apiKey.deleteMany({ where: { projectId: project.id } }),
    ]);
    const tracesDel = await this.prisma.trace.deleteMany({ where: { projectId: project.id } });

    return {
      message: `プロジェクト "${project.name}" のデータを初期化しました`,
      deleted: {
        traces: tracesDel.count, logs: logs.count,
        patterns: patterns.count, issues: issues.count, apiKeys: apiKeys.count,
      },
    };
  }
}
