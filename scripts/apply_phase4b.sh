#!/bin/bash
set -e
echo "=== Phase 4B: データ一括消去 + 管理者メニュー 適用開始 ==="

API_SRC=~/projects/log-server/apps/api/src
CMS_SRC=~/projects/log-server/apps/cms

# ─── バックアップ ───────────────────────────────────────────
echo "[1/5] バックアップ作成..."
cp $API_SRC/app.module.ts $API_SRC/app.module.ts.bak4b
echo "  完了"

# ─── ① admin.service.ts ────────────────────────────────────
echo "[2/5] admin モジュール作成..."
mkdir -p $API_SRC/admin

cat > $API_SRC/admin/admin.service.ts << 'EOF'
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
EOF

# ─── ② admin.controller.ts ─────────────────────────────────
cat > $API_SRC/admin/admin.controller.ts << 'EOF'
import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard }   from '../auth/roles.guard';
import { Roles }        from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  getStats() {
    return this.admin.getStats();
  }

  @Post('reset')
  reset() {
    return this.admin.resetAllData();
  }
}
EOF

# ─── ③ admin.module.ts ─────────────────────────────────────
cat > $API_SRC/admin/admin.module.ts << 'EOF'
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { PrismaModule }    from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}
EOF
echo "  完了: admin モジュール一式"

# ─── ④ app.module.ts に AdminModule 追加 ───────────────────
echo "[3/5] app.module.ts 更新..."
python3 - << 'PYEOF'
path = '/home/karkyon/projects/log-server/apps/api/src/app.module.ts'
with open(path) as f:
    src = f.read()

if 'AdminModule' not in src:
    src = src.replace(
        "import { UsersModule } from './users/users.module';",
        "import { UsersModule } from './users/users.module';\nimport { AdminModule } from './admin/admin.module';"
    )
    src = src.replace(
        'UsersModule,',
        'UsersModule,\n    AdminModule,'
    )
    with open(path, 'w') as f:
        f.write(src)
    print("app.module.ts 更新完了")
else:
    print("AdminModule 既存")
PYEOF
echo "  完了: app.module.ts"

# ─── ⑤ CMS — 管理者メニュー + データ初期化画面 ────────────
echo "[4/5] CMS 管理者メニュー + データ初期化画面 作成..."
mkdir -p $CMS_SRC/app/admin/reset

cat > $CMS_SRC/app/admin/reset/page.tsx << 'CMSEOF'
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Stats = {
  logs: number; console_logs: number; screenshots: number;
  issues: number; patterns: number; traces: number;
  users: number; projects: number; api_keys: number;
};

export default function AdminResetPage() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0=通常, 1=第1確認, 2=第2確認
  const [confirmInput, setConfirmInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const CONFIRM_WORD = "TLog";

  const bg       = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const cardBg   = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text     = dark ? "text-white" : "text-gray-900";
  const subtext  = dark ? "text-gray-400" : "text-gray-500";
  const modalBg  = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = JSON.parse(localStorage.getItem("tlog_user") || "{}");
    if (u.role !== "ADMIN") { router.push("/projects"); return; }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/stats");
      setStats(res.data);
    } catch {} finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (confirmInput !== CONFIRM_WORD) return;
    setExecuting(true);
    try {
      const res = await api.post("/api/admin/reset");
      setResult(res.data.deleted);
      setStep(0);
      setConfirmInput("");
      fetchStats();
    } catch (e: any) {
      alert(e.response?.data?.message || "削除に失敗しました");
    } finally { setExecuting(false); }
  };

  const statItems = stats ? [
    { label: "UIイベントログ", key: "logs",         value: stats.logs,         color: "text-blue-500" },
    { label: "コンソールログ", key: "console_logs", value: stats.console_logs, color: "text-purple-500" },
    { label: "スクリーンショット", key: "screenshots", value: stats.screenshots, color: "text-green-500" },
    { label: "TraceIDセッション", key: "traces",    value: stats.traces,       color: "text-yellow-500" },
    { label: "チケット",       key: "issues",       value: stats.issues,       color: "text-red-500" },
    { label: "パターン",       key: "patterns",     value: stats.patterns,     color: "text-orange-500" },
  ] : [];

  const totalDeletable = stats
    ? stats.logs + stats.console_logs + stats.screenshots + stats.traces + stats.issues + stats.patterns
    : 0;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      {/* ヘッダー */}
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/projects")} className={`${subtext} hover:text-blue-500 text-sm transition`}>
            ← プロジェクト一覧
          </button>
          <span className={subtext}>/</span>
          <span className="text-red-500 font-bold text-sm">データ初期化</span>
        </div>
        <button onClick={toggle}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">

        {/* 完了メッセージ */}
        {result && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-bold text-green-700 mb-2">✅ データ初期化が完了しました</p>
            <div className="text-sm text-green-600 space-y-1">
              {Object.entries(result).map(([k, v]) => (
                <p key={k}>{k}: {v} 件削除</p>
              ))}
            </div>
          </div>
        )}

        {/* 現在のデータ件数 */}
        <div className={`${cardBg} border rounded-xl p-6 mb-6`}>
          <h2 className="text-lg font-bold mb-4">現在のデータ件数</h2>
          {loading ? (
            <p className={subtext}>読み込み中...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {statItems.map(({ label, value, color }) => (
                  <div key={label} className={`${dark ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-3 flex justify-between items-center`}>
                    <span className={`text-sm ${subtext}`}>{label}</span>
                    <span className={`font-bold text-lg ${color}`}>{value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className={`border-t ${dark ? "border-gray-700" : "border-gray-200"} pt-3 flex justify-between items-center`}>
                <span className="text-sm font-medium">削除対象合計</span>
                <span className="font-bold text-xl text-red-500">{totalDeletable.toLocaleString()} 件</span>
              </div>
              <div className={`mt-2 text-xs ${subtext}`}>
                ※ ユーザー（{stats?.users}名）・プロジェクト（{stats?.projects}件）・APIキー（{stats?.api_keys}件）は削除されません
              </div>
            </>
          )}
        </div>

        {/* 初期化ボタン */}
        <div className={`${cardBg} border border-red-200 rounded-xl p-6`}>
          <h2 className="text-lg font-bold text-red-600 mb-2">⚠️ データ初期化</h2>
          <p className={`text-sm ${subtext} mb-4`}>
            全プロジェクトのログ・スクリーンショット・TraceID・チケット・パターンを完全に削除します。
            この操作は取り消せません。
          </p>
          <button
            onClick={() => { setStep(1); setConfirmInput(""); setResult(null); }}
            disabled={totalDeletable === 0}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition"
          >
            データを初期化する
          </button>
        </div>
      </main>

      {/* Step 1: 第1確認モーダル */}
      {step === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`${modalBg} border border-red-300 rounded-xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-bold text-red-600 mb-2">本当に削除しますか？</h2>
              <p className={`text-sm ${subtext}`}>
                <strong className="text-red-500">{totalDeletable.toLocaleString()} 件</strong>のデータが完全に削除されます。<br />
                この操作は取り消せません。
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={() => setStep(2)}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition">
                続行する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 第2確認モーダル（確認ワード入力） */}
      {step === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`${modalBg} border border-red-300 rounded-xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔐</div>
              <h2 className="text-xl font-bold text-red-600 mb-2">最終確認</h2>
              <p className={`text-sm ${subtext} mb-4`}>
                削除を実行するには、下のテキストボックスに
                <strong className="text-red-500 mx-1">"{CONFIRM_WORD}"</strong>
                と入力してください。
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                className={inputCls}
                placeholder={`"${CONFIRM_WORD}" と入力`}
                autoFocus
              />
              {confirmInput.length > 0 && confirmInput !== CONFIRM_WORD && (
                <p className="text-red-500 text-xs mt-1">"{CONFIRM_WORD}" と正確に入力してください</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep(0); setConfirmInput(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button
                onClick={handleReset}
                disabled={confirmInput !== CONFIRM_WORD || executing}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              >
                {executing ? "削除中..." : "完全に削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
CMSEOF
echo "  完了: CMS admin/reset/page.tsx"

# ─── ⑥ projects/page.tsx ヘッダーに管理者メニュー追加 ────
echo "[5/5] projects/page.tsx に管理者メニュー追加..."
python3 - << 'PYEOF'
import re
path = '/home/karkyon/projects/log-server/apps/cms/app/projects/page.tsx'
with open(path) as f:
    src = f.read()

# バックアップ
with open(path + '.bak4b', 'w') as f:
    f.write(src)

# 管理者メニュードロップダウン用 state 追加
if 'showAdminMenu' not in src:
    src = src.replace(
        "  const [submitting, setSubmitting] = useState(false);",
        "  const [submitting, setSubmitting] = useState(false);\n  const [showAdminMenu, setShowAdminMenu] = useState(false);"
    )

# ヘッダー内の「+ 新規プロジェクト」ボタンの後に管理者メニューを追加
old_btn = '''          {isAdmin && (
            <button onClick={() => { setForm(EMPTY_FORM); setSlugError(""); setShowModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition">
              + 新規プロジェクト
            </button>
          )}'''

new_btn = '''          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setForm(EMPTY_FORM); setSlugError(""); setShowModal(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition">
                + 新規プロジェクト
              </button>
              {/* 管理者メニュー */}
              <div className="relative">
                <button onClick={() => setShowAdminMenu(v => !v)}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium border transition ${dark ? "border-gray-700 hover:bg-gray-800 text-gray-300" : "border-gray-200 hover:bg-gray-50 text-gray-600"}`}>
                  ⚙️ 管理
                </button>
                {showAdminMenu && (
                  <div className={`absolute right-0 top-full mt-1 w-44 rounded-xl shadow-lg border z-20 overflow-hidden ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}
                    onMouseLeave={() => setShowAdminMenu(false)}>
                    <button onClick={() => { setShowAdminMenu(false); router.push("/admin/users"); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${dark ? "hover:bg-gray-800 text-gray-200" : "hover:bg-gray-50 text-gray-700"}`}>
                      👥 ユーザー管理
                    </button>
                    <div className={`border-t ${dark ? "border-gray-700" : "border-gray-100"}`} />
                    <button onClick={() => { setShowAdminMenu(false); router.push("/admin/reset"); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition">
                      🗑️ データ初期化
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}'''

if old_btn in src:
    src = src.replace(old_btn, new_btn)
    print("管理者メニュー追加完了")
else:
    print("WARNING: ボタン箇所が見つからない — 手動確認が必要")

with open(path, 'w') as f:
    f.write(src)
PYEOF

# ─── API ビルド & 再起動 ────────────────────────────────────
echo "=== API ビルド & pm2 再起動 ==="
cd ~/projects/log-server/apps/api
npm run build && pm2 restart tlog-api && sleep 2

# 疎通確認
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin1234"}' | jq -r .accessToken)

echo "=== GET /api/admin/stats ==="
curl -s http://localhost:3099/api/admin/stats \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "✅ Phase 4B 適用完了！"
echo ""
echo "【次の手順】"
echo "1. CMS をビルド: cd ~/projects/log-server/apps/cms && npm run build && pm2 restart tlog-cms"
echo "2. http://192.168.1.11:3002/projects にアクセス"
echo "3. ヘッダーの「⚙️ 管理」ドロップダウンを確認"
echo "4. 「データ初期化」→ 2段階確認フローを確認"
