import { Injectable } from '@nestjs/common';
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
      where: {
        isActive: true,
        members: { some: { userId } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
