import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, role: string) {
    if (role === 'ADMIN') {
      return this.prisma.project.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.project.findMany({
      where: { isActive: true, members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(name: string, slug: string, description: string | undefined, userId: string) {
    const exists = await this.prisma.project.findUnique({ where: { slug } });
    if (exists) throw new ConflictException(`slug "${slug}" は既に使用されています`);
    return this.prisma.project.create({
      data: { id: slug, slug, name, description: description ?? null, createdById: userId },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const where = role === 'ADMIN'
      ? { id }
      : { id, members: { some: { userId } } };
    return this.prisma.project.findFirst({ where });
  }

  async deleteProject(id: string) {
    // 配下データを順番に削除（FK制約対応）
    const traces = await this.prisma.trace.findMany({ where: { projectId: id }, select: { id: true } });
    const traceIds = traces.map(t => t.id);
    if (traceIds.length > 0) {
      await this.prisma.log.deleteMany({ where: { traceId: { in: traceIds } } });
    }
    await this.prisma.trace.deleteMany({ where: { projectId: id } });
    await this.prisma.issue.deleteMany({ where: { projectId: id } });
    await this.prisma.pattern.deleteMany({ where: { projectId: id } });
    await this.prisma.apiKey.deleteMany({ where: { projectId: id } });
    return this.prisma.project.delete({ where: { id } });
  }
}
