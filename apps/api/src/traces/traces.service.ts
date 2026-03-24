import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { CreateIssueDto } from './create-issue.dto';
import { CreatePatternDto } from './create-pattern.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TracesService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    const traces = await this.prisma.trace.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { _count: { select: { logs: true } } },
    });
    // 各TraceのSCREEN_LOADから画面遷移順を集約
    const ids = traces.map(t => t.id);
    const screenLogs = await this.prisma.log.findMany({
      where: { traceId: { in: ids }, eventType: 'SCREEN_LOAD' },
      orderBy: { timestamp: 'asc' },
      select: { traceId: true, screenName: true },
    });
    const screenMap: Record<string, string[]> = {};
    for (const l of screenLogs) {
      if (!l.traceId || !l.screenName) continue;
      if (!screenMap[l.traceId]) screenMap[l.traceId] = [];
      const last = screenMap[l.traceId].at(-1);
      if (last !== l.screenName) screenMap[l.traceId].push(l.screenName);
    }
    return traces.map(t => ({ ...t, screens: screenMap[t.id] ?? [] }));
  }

  async findOne(projectId: string, traceId: string) {
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
    });
    if (!trace) return null;
    const logs = await this.prisma.log.findMany({
      where: { traceId },
      orderBy: { timestamp: 'asc' },
      take: 500,
    });
    const screenshots = await this.prisma.screenshot.findMany({
      where: { traceId },
      orderBy: { ts: 'asc' },
    });
    return { trace, logs, screenshots };
  }

  async updateIssue(projectId: string, issueId: string, body: {
    status?: string; priority?: string; title?: string; description?: string;
  }) {
    return this.prisma.issue.update({
      where: { id: issueId },
      data: { ...body, updatedAt: new Date() },
    });
  }

  async deleteIssue(projectId: string, issueId: string) {
    await this.prisma.issue.delete({ where: { id: issueId } });
    return { ok: true };
  }

  async findIssues(projectId: string) {
    return this.prisma.issue.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findPatterns(projectId: string) {
    return this.prisma.pattern.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createIssue(projectId: string, dto: CreateIssueDto, userId?: string) {
    return this.prisma.issue.create({
      data: {
        projectId,
        featureId:   dto.featureId,
        title:       dto.title,
        type:        dto.type,
        priority:    dto.priority,
        description: dto.description ?? null,
        traceId:     dto.traceId    ?? null,
        createdById: userId         ?? null,
        status:      '未対応',
      },
    });
  }

  async createPattern(projectId: string, dto: CreatePatternDto, userId?: string) {
    return this.prisma.pattern.create({
      data: {
        projectId,
        name:       dto.name,
        screenMode: dto.screenMode ?? null,
        seqData:    dto.seqData ?? {},
        memo:       dto.memo ?? null,
        createdById: userId ?? null,
        status:     '未評価',
      },
    });
  }

  async getLogs(projectId: string, traceId: string) {
    const [logs, screenshots, consoleLogs] = await Promise.all([
      this.prisma.log.findMany({
        where: { traceId },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.screenshot.findMany({
        where: { traceId },
        orderBy: { ts: 'asc' },
      }),
      this.prisma.consoleLog.findMany({
        where: { traceId },
        orderBy: { ts: 'asc' },
      }),
    ]);

    // verdictを取得
    const verdicts = await this.prisma.logVerdict.findMany({
      where: { logId: { in: logs.map(l => l.id) } },
    });
    const verdictMap = new Map(verdicts.map(v => [v.logId, v]));

    // screenshotをtimestampで最近傍マッチしてlogに付与
    const logsWithScreenshot = logs.map(log => {
      const logTs = new Date(log.timestamp).getTime();
      // 同じfeatureId(screenName)のscreenshot群から最近傍を探す
      const candidates = screenshots.filter(
        ss => ss.featureId === log.screenName || ss.featureId === 'UNKNOWN'
      );
      const nearest = candidates.reduce((best, ss) => {
        if (!best) return ss;
        const diff = Math.abs(new Date(ss.ts).getTime() - logTs);
        const bestDiff = Math.abs(new Date(best.ts).getTime() - logTs);
        return diff < bestDiff ? ss : best;
      }, null as typeof screenshots[0] | null);

      // 同じseqNoのconsoleLogs群を付与
      const logConsoleLogs = consoleLogs.filter(cl => cl.seqNo != null ? cl.seqNo === log.seqNo : false);
      return {
        ...log,
        screenshotPath: log.screenshotPath || (nearest ? nearest.filePath : null),
        verdict: verdictMap.get(log.id) ?? null,
        consoleLogs: logConsoleLogs,
      };
    });

    return logsWithScreenshot;
  }


  // seqNoを削除してRenumbering（関連パターンも更新）
  async deleteSeqNo(projectId: string, traceId: string, seqNo: number) {
    // 1. 削除対象ログ取得（スクショファイル削除のため）
    const targetLogs = await this.prisma.log.findMany({
      where: { traceId, seqNo },
    });

    // 2. スクショファイルを物理削除
    for (const log of targetLogs) {
      if (log.screenshotPath) {
        try { fs.unlinkSync(log.screenshotPath); } catch (_) { /* ファイルなければ無視 */ }
      }
    }

    // 3. 対象seqNoのLog（cascade → LogVerdict）を削除
    await this.prisma.log.deleteMany({ where: { traceId, seqNo } });

    // 4. 対象seqNoのconsoleLogを削除
    await this.prisma.consoleLog.deleteMany({ where: { traceId, seqNo } });

    // 5. 以降のseqNoを -1 ずつ更新（logs）
    const logsAfter = await this.prisma.log.findMany({
      where: { traceId, seqNo: { gt: seqNo } },
      orderBy: { seqNo: 'asc' },
    });
    for (const log of logsAfter) {
      await this.prisma.log.update({
        where: { id: log.id },
        data: { seqNo: (log.seqNo ?? 0) - 1 },
      });
    }

    // 6. 以降のseqNoを -1 ずつ更新（consoleLogs）
    const clsAfter = await this.prisma.consoleLog.findMany({
      where: { traceId, seqNo: { gt: seqNo } },
    });
    for (const cl of clsAfter) {
      await this.prisma.consoleLog.update({
        where: { id: cl.id },
        data: { seqNo: (cl.seqNo ?? 0) - 1 },
      });
    }

    // 7. 同プロジェクトのパターンのseqDataを更新（削除seqNo除去、以降-1）
    const patterns = await this.prisma.pattern.findMany({
      where: { projectId },
    });
    for (const pattern of patterns) {
      const sd = pattern.seqData as any;
      if (!sd?.seqs || !Array.isArray(sd.seqs)) continue;
      const newSeqs = sd.seqs
        .filter((s: any) => {
          const sno = s.seqNo ?? s.seq ?? 0;
          return sno !== seqNo;
        })
        .map((s: any) => {
          const sno = s.seqNo ?? s.seq ?? 0;
          if (sno > seqNo) {
            return { ...s, seqNo: sno - 1, seq: sno - 1 };
          }
          return s;
        });
      await this.prisma.pattern.update({
        where: { id: pattern.id },
        data: { seqData: { ...sd, seqs: newSeqs } },
      });
    }

    return { ok: true, deletedSeqNo: seqNo, renumbered: logsAfter.length };
  }

  async deleteTrace(projectId: string, traceId: string) {
    const trace = await this.prisma.trace.findFirst({ where: { id: traceId, projectId } });
    if (!trace) throw new (require('@nestjs/common').NotFoundException)('Trace not found');
    // 手動cascade: LogVerdict → Log → Screenshot, ConsoleLog, Issue → Trace
    const logs = await this.prisma.log.findMany({ where: { traceId }, select: { id: true } });
    const logIds = logs.map((l: any) => l.id);
    if (logIds.length > 0) {
      await this.prisma.logVerdict.deleteMany({ where: { logId: { in: logIds } } });
      await this.prisma.log.deleteMany({ where: { id: { in: logIds } } });
    }
    await this.prisma.screenshot.deleteMany({ where: { traceId } });
    await this.prisma.consoleLog.deleteMany({ where: { traceId } });
    await this.prisma.issue.deleteMany({ where: { traceId } });
    return this.prisma.trace.delete({ where: { id: traceId } });
  }

  async updateMetadata(projectId: string, traceId: string, label: string) {
    const trace = await this.prisma.trace.findFirst({ where: { id: traceId, projectId } });
    if (!trace) throw new (require('@nestjs/common').NotFoundException)('Trace not found');
    const meta = (trace.metadata as any) || {};
    return this.prisma.trace.update({
      where: { id: traceId },
      data: { metadata: { ...meta, label } },
    });
  }

  async deletePattern(projectId: string, patternId: string) {
    const p = await this.prisma.pattern.findFirst({ where: { id: patternId, projectId } });
    if (!p) throw new (require('@nestjs/common').NotFoundException)('Pattern not found');
    return this.prisma.pattern.delete({ where: { id: patternId } });
  }

  async upsertVerdict(logId: string, data: {
    verdict: string;
    issueType?: string;
    priority?: string;
    status?: string;
    content?: string;
    memo?: string;
  }) {
    return this.prisma.logVerdict.upsert({
      where: { logId },
      create: { logId, ...data },
      update: { ...data },
    });
  }

  async forceStop(projectId: string, traceId: string) {
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
    });
    if (!trace) throw new Error('Trace not found');
    return this.prisma.trace.update({
      where: { id: traceId },
      data: { status: 'COMPLETED', endedAt: new Date() },
    });
  }
}
