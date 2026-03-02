import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async resetAllData(): Promise<{ deleted: Record<string, number> }> {
    const deleted: Record<string, number> = {};

    // ① logs
    const logs = await this.prisma.log.deleteMany({});
    deleted.logs = logs.count;

    // ② console_logs
    const consoleLogs = await this.prisma.consoleLog.deleteMany({});
    deleted.console_logs = consoleLogs.count;

    // ③ screenshots — ファイル削除 → DB削除
    const screenshots = await this.prisma.screenshot.findMany({
      select: { filePath: true },
    });
    let fileDeleted = 0;
    for (const s of screenshots) {
      if (s.filePath) {
        try {
          fs.unlinkSync(s.filePath);
          fileDeleted++;
        } catch { /* ファイルが既にない場合はスキップ */ }
      }
    }
    const screenshotDb = await this.prisma.screenshot.deleteMany({});
    deleted.screenshots = screenshotDb.count;
    deleted.screenshot_files = fileDeleted;

    // ④ issues
    const issues = await this.prisma.issue.deleteMany({});
    deleted.issues = issues.count;

    // ⑤ patterns
    const patterns = await this.prisma.pattern.deleteMany({});
    deleted.patterns = patterns.count;

    // ⑥ traces（最後：他テーブルが依存）
    const traces = await this.prisma.trace.deleteMany({});
    deleted.traces = traces.count;

    return { deleted };
  }

  async getStats() {
    const [logs, consoleLogs, screenshots, issues, patterns, traces, users, projects, apiKeys] =
      await Promise.all([
        this.prisma.log.count(),
        this.prisma.consoleLog.count(),
        this.prisma.screenshot.count(),
        this.prisma.issue.count(),
        this.prisma.pattern.count(),
        this.prisma.trace.count(),
        this.prisma.user.count(),
        this.prisma.project.count(),
        this.prisma.apiKey.count({ where: { isActive: true } }),
      ]);
    return { logs, console_logs: consoleLogs, screenshots, issues, patterns, traces, users, projects, api_keys: apiKeys };
  }
}
