import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SdkService {
  constructor(private prisma: PrismaService) {}

  // traceId が traces テーブルになければ自動作成
  private async ensureTrace(traceId: string, projectId?: string) {
    await this.prisma.trace.upsert({
      where: { id: traceId },
      create: {
        id:        traceId,
        projectId: projectId || 'legacy',
        apiKeyId:  'legacy',
        status:    'ACTIVE',
      },
      update: {},
    });
  }

  async saveLog(body: any) {
    try {
      const traceId = body.traceId || null;
      if (traceId) await this.ensureTrace(traceId, body.projectId);

      const log = await this.prisma.log.create({
        data: {
          traceId:    traceId,
          eventType:  body.type      || body.eventType || 'UNKNOWN',
          screenName: body.featureId || body.screenName || null,
          elementId:  body.elementId || null,
          payload:    body.payload   ?? body,
          timestamp:  body.ts ? new Date(body.ts) : new Date(),
        },
      });
      return { ok: true, id: log.id };
    } catch (e) {
      console.error('[SdkService] saveLog error:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async saveConsoleLog(body: any) {
    try {
      const traceId = body.traceId || null;
      if (traceId) await this.ensureTrace(traceId, body.projectId);

      const log = await this.prisma.consoleLog.create({
        data: {
          projectId: body.projectId || 'legacy',
          traceId:   traceId,
          featureId: body.featureId || 'unknown',
          level:     body.level     || 'log',
          args:      body.args      ?? [],
          stack:     body.stack     || null,
          ts:        body.ts ? new Date(body.ts) : new Date(),
        },
      });
      return { ok: true, id: log.id };
    } catch (e) {
      console.error('[SdkService] saveConsoleLog error:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async saveScreenshot(body: any, filePath?: string) {
    try {
      const traceId = body.traceId || null;
      if (traceId) await this.ensureTrace(traceId, body.projectId);

      const ss = await this.prisma.screenshot.create({
        data: {
          projectId: body.projectId || 'legacy',
          traceId:   traceId,
          featureId: body.featureId || 'unknown',
          filePath:  filePath       || '',
          ts:        body.ts ? new Date(body.ts) : new Date(),
        },
      });
      return { ok: true, id: ss.id };
    } catch (e) {
      console.error('[SdkService] saveScreenshot error:', e.message);
      return { ok: false, error: e.message };
    }
  }
}
