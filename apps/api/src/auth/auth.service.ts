import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';

// Redis クライアント（シングルトン）
let redisClient: Redis | null = null;
function getRedis() {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    redisClient.on('error', (e) => console.error('[Redis]', e));
  }
  return redisClient;
}

const RT_TTL_SEC = 60 * 60 * 24 * 7; // 7日

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
    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    };
  }

  async refresh(refreshToken: string) {
    const redis = getRedis();
    const userId = await redis.get(`rt:${refreshToken}`);
    if (!userId) throw new UnauthorizedException('リフレッシュトークンが無効または期限切れです');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('ユーザーが無効です');

    // 旧トークン削除（ローテーション）
    await redis.del(`rt:${refreshToken}`);

    const payload = { sub: user.id, username: user.username, role: user.role };
    const newAccessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const newRefreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    };
  }

  async logout(refreshToken: string) {
    const redis = getRedis();
    await redis.del(`rt:${refreshToken}`);
    return { message: 'ログアウトしました' };
  }

  async createUser(username: string, password: string, displayName: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { username, passwordHash, displayName, role },
      select: { id: true, username: true, displayName: true, role: true },
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(40).toString('hex');
    const redis = getRedis();
    await redis.set(`rt:${token}`, userId, 'EX', RT_TTL_SEC);
    return token;
  }
}
