import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.apiKey.findMany({
      where: { projectId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, label: true, isActive: true,
        lastUsedAt: true, createdAt: true,
      },
    });
  }

  async create(projectId: string, label: string) {
    const plain = 'ak_' + crypto.randomBytes(32).toString('hex');
    const hash  = crypto.createHash('sha256').update(plain).digest('hex');
    const key = await this.prisma.apiKey.create({
      data: { projectId, label, keyHash: hash },
    });
    return { id: key.id, label: key.label, createdAt: key.createdAt, plainKey: plain };
  }

  async revoke(projectId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, projectId },
    });
    if (!key) throw new NotFoundException('APIキーが見つかりません');
    return this.prisma.apiKey.delete({
      where: { id: keyId },
    });
  }

  async verifyKey(plain: string): Promise<{ projectId: string; apiKeyId: string } | null> {
    const hash = crypto.createHash('sha256').update(plain).digest('hex');
    const key  = await this.prisma.apiKey.findFirst({
      where: { keyHash: hash, isActive: true },
    });
    if (!key) return null;
    this.prisma.apiKey.update({
      where: { id: key.id },
      data:  { lastUsedAt: new Date() },
    }).catch(() => {});
    return { projectId: key.projectId, apiKeyId: key.id };
  }
}
