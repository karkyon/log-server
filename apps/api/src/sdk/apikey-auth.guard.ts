import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../apikeys/apikeys.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw: string = req.headers['x-api-key'] ?? req.headers['authorization'] ?? '';
    const plain = raw.startsWith('Bearer ') ? raw.slice(7) : raw;

    if (!plain) throw new UnauthorizedException('APIキーが必要です');

    const result = await this.apiKeys.verifyKey(plain);
    if (!result) throw new UnauthorizedException('無効なAPIキーです');

    req.projectId = result.projectId;
    req.apiKeyId  = result.apiKeyId;
    return true;
  }
}
