import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const LOG_SERVER_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const FEATURES_DIR = path.join(LOG_SERVER_ROOT, 'logs', 'features');
const CONSOLE_DIR  = path.join(LOG_SERVER_ROOT, 'logs', 'features');
const DOCS_DIR     = path.join(LOG_SERVER_ROOT, 'docs', 'review');
const SCRIPT_PATH  = path.join(LOG_SERVER_ROOT, 'scripts', 'generate-review.js');

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  async generateForTrace(projectId: string, traceId: string): Promise<string> {
    // 1. trace 存在確認
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
    });
    if (!trace) throw new NotFoundException(`TraceID ${traceId} が見つかりません`);
    if (trace.status === 'ACTIVE') {
      throw new InternalServerErrorException('ACTIVE状態のTraceはレビュー生成できません。stopTrace()後に実行してください');
    }

    // 2. ログを全件取得
    const logs = await this.prisma.log.findMany({
      where: { traceId },
      orderBy: { timestamp: 'asc' },
    });
    if (!logs.length) {
      throw new NotFoundException(`TraceID ${traceId} にログがありません`);
    }

    // 3. screenName ごとに JSONL ファイルへ書き出し
    fs.mkdirSync(FEATURES_DIR, { recursive: true });
    fs.mkdirSync(DOCS_DIR, { recursive: true });

    const byScreen: Record<string, any[]> = {};
    for (const log of logs) {
      const screenId = (log.screenName as string) || 'UNKNOWN';
      if (screenId === 'UNKNOWN') continue;
      if (!byScreen[screenId]) byScreen[screenId] = [];

      // payload から各フィールドを展開し、generate-review.js が期待する形式に変換
      const payload = (log.payload as any) || {};
      const entry = {
        traceId:   traceId,
        type:      log.eventType,
        featureId: screenId,
        screenId:  screenId,
        ts:        log.timestamp.toISOString(),
        elementId: log.elementId,
        screenshot: log.screenshotPath ? path.basename(log.screenshotPath) : null,
        // payload の全フィールドをマージ（label, inputValues, message, seqNo 等）
        ...payload,
      };
      byScreen[screenId].push(entry);
    }

    // 既存の JSONL をバックアップして書き出し（上書き方式）
    const writtenFiles: string[] = [];
    for (const [screenId, entries] of Object.entries(byScreen)) {
      const filePath = path.join(FEATURES_DIR, `${screenId}.jsonl`);
      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(filePath, lines, 'utf8');
      writtenFiles.push(filePath);
    }

    // 4. generate-review.js を実行
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      TRACE_ID_FILTER: traceId, // 追加フィルター（将来の拡張用）
    };
    try {
      execSync(`node ${SCRIPT_PATH}`, {
        cwd: LOG_SERVER_ROOT,
        env,
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      const stderr = err.stderr?.toString() || '';
      throw new InternalServerErrorException(`generate-review.js 実行エラー: ${stderr.slice(0, 500)}`);
    }

    // 5. 生成された HTML を読み込んで返却
    const outFile = path.join(DOCS_DIR, 'index.html');
    if (!fs.existsSync(outFile)) {
      throw new InternalServerErrorException('review HTML の生成に失敗しました');
    }
    return fs.readFileSync(outFile, 'utf8');
  }

  async generateForProject(projectId: string, traceIds?: string[]): Promise<string> {
    let whereClause: any = { projectId };
    if (traceIds && traceIds.length > 0) {
      whereClause.id = { in: traceIds };
    } else {
      whereClause.status = 'CLOSED';
    }

    const traces = await this.prisma.trace.findMany({
      where: whereClause,
      select: { id: true },
    });
    if (!traces.length) throw new NotFoundException('対象のTraceが見つかりません');

    // 最初のtraceで生成（複数対応は将来拡張）
    return this.generateForTrace(projectId, traces[0].id);
  }

  // TraceID一覧取得（CLOSED のみ生成可能フラグ付き）
  async listTraces(projectId: string) {
    const traces = await this.prisma.trace.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
    });

    return traces.map((t: any) => ({
      id: t.id,
      status: t.status,
      operatorId: t.operatorId,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      canGenerate: t.status === 'CLOSED',
      metadata: t.metadata,
    }));
  }
}
