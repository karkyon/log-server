import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../apikeys/apikeys.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] ?? '';
    const plain = auth.startsWith('Bearer ') ? auth.slice(7) : auth;

    if (!plain) throw new UnauthorizedException('APIキーが必要です');

    const projectId = await this.apiKeys.verifyKey(plain);
    if (!projectId) throw new UnauthorizedException('無効なAPIキーです');

    // SDK側で projectId を使えるよう req に注入
    req.projectId = projectId;
    return true;
  }
}
