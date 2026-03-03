import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) throw new UnauthorizedException('ユーザーが存在しません');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('パスワードが違います');

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '15m' }),
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    };
  }

  async createUser(username: string, password: string, displayName: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { username, passwordHash, displayName, role },
      select: { id: true, username: true, displayName: true, role: true },
    });
  }
}
