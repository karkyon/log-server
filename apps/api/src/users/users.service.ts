import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, displayName: true,
        role: true, isActive: true, createdAt: true,
      },
    });
  }

  async create(username: string, password: string, displayName: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException(`ユーザー名 "${username}" は既に使用されています`);
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { username, passwordHash, displayName, role },
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
  }

  async update(id: string, data: { displayName?: string; role?: 'ADMIN' | 'MEMBER'; isActive?: boolean; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.role        !== undefined) updateData.role = data.role;
    if (data.isActive    !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 10);

    return this.prisma.user.update({
      where: { id },
      data:  updateData,
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
  }
}
