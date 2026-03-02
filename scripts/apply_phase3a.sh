#!/bin/bash
# ============================================================
# Phase 3A: チケット作成機能 適用スクリプト
# 実行場所: karkyon@omega-dev2
# 実行方法: bash apply_phase3a.sh
# ============================================================
set -e

BASE=~/projects/log-server
API_SRC=$BASE/apps/api/src
CMS_SRC=$BASE/apps/cms/app/projects

echo "=== Phase 3A: チケット作成機能 適用開始 ==="

# ── バックアップ ──────────────────────────────────────────
echo "[1/4] バックアップ作成..."
cp $API_SRC/traces/traces.service.ts    $API_SRC/traces/traces.service.ts.bak
cp $API_SRC/traces/traces.controller.ts $API_SRC/traces/traces.controller.ts.bak
cp $CMS_SRC/'[id]'/issues/page.tsx      $CMS_SRC/'[id]'/issues/page.tsx.bak
echo "  完了: *.bak 作成済み"

# ── ① create-issue.dto.ts（新規）────────────────────────
echo "[2/4] create-issue.dto.ts 作成..."
cat > $API_SRC/traces/create-issue.dto.ts << 'EOF'
import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  featureId: string;

  @IsString()
  title: string;

  @IsIn(['バグ', '改善', '質問', '確認'])
  type: string;

  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  priority: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  traceId?: string;
}
EOF
echo "  完了: create-issue.dto.ts"

# ── ② traces.service.ts（createIssue 追加）──────────────
echo "[3/4] traces.service.ts 更新..."
cat > $API_SRC/traces/traces.service.ts << 'EOF'
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto } from './create-issue.dto';

@Injectable()
export class TracesService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.trace.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { _count: { select: { logs: true } } },
    });
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
}
EOF
echo "  完了: traces.service.ts"

# ── ③ traces.controller.ts（POST issues 追加）───────────
cat > $API_SRC/traces/traces.controller.ts << 'EOF'
import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TracesService } from './traces.service';
import { CreateIssueDto } from './create-issue.dto';

@Controller('api/projects/:id')
@UseGuards(JwtAuthGuard)
export class TracesController {
  constructor(private traces: TracesService) {}

  @Get('traces')
  findAll(@Param('id') id: string) {
    return this.traces.findAll(id);
  }

  @Get('traces/:tid')
  findOne(@Param('id') id: string, @Param('tid') tid: string) {
    return this.traces.findOne(id, tid);
  }

  @Get('issues')
  findIssues(@Param('id') id: string) {
    return this.traces.findIssues(id);
  }

  @Post('issues')
  createIssue(
    @Param('id') id: string,
    @Body() dto: CreateIssueDto,
    @Request() req: any,
  ) {
    return this.traces.createIssue(id, dto, req.user?.userId);
  }

  @Get('patterns')
  findPatterns(@Param('id') id: string) {
    return this.traces.findPatterns(id);
  }
}
EOF
echo "  完了: traces.controller.ts"

# ── ④ CMS issues/page.tsx（モーダル追加）────────────────
echo "[4/4] CMS issues/page.tsx 更新..."
cat > $CMS_SRC/'[id]'/issues/page.tsx << 'CMSEOF'
"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Issue = {
  id: string; title: string; type: string; priority: string;
  status: string; description: string | null; featureId: string;
  traceId: string | null; createdAt: string;
};

type CreateForm = {
  title: string; featureId: string; type: string;
  priority: string; description: string;
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-600",
};
const STATUS_COLOR: Record<string, string> = {
  "未対応": "bg-red-100 text-red-700",
  "対応中": "bg-blue-100 text-blue-700",
  "解決済": "bg-green-100 text-green-700",
  "保留":   "bg-gray-100 text-gray-600",
};

const EMPTY_FORM: CreateForm = {
  title: "", featureId: "", type: "バグ", priority: "MEDIUM", description: "",
};

export default function IssuesPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();

  const [issues,  setIssues]  = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("ALL");
  const [showModal, setShowModal] = useState(false);
  const [form,   setForm]   = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const loadIssues = () => {
    api.get(`/api/projects/${id}/issues`)
      .then(r => setIssues(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    loadIssues();
  }, [id]);

  const handleCreate = async () => {
    if (!form.title.trim())     { setError("タイトルは必須です"); return; }
    if (!form.featureId.trim()) { setError("機能IDは必須です");   return; }
    setSaving(true); setError("");
    try {
      await api.post(`/api/projects/${id}/issues`, form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      setLoading(true);
      loadIssues();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // ── スタイル変数
  const bg        = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg  = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text      = dark ? "text-white"  : "text-gray-900";
  const subtext   = dark ? "text-gray-400" : "text-gray-500";
  const cardBg    = dark ? "bg-gray-900 border-gray-800 hover:border-gray-700" : "bg-white border-gray-200 hover:border-gray-300";
  const tabActive = dark ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow";
  const tabInactive = dark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";
  const modalBg   = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputCls  = dark
    ? "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
    : "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500";

  const filtered = filter === "ALL" ? issues : issues.filter(i => i.status === filter);

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      {/* ── ヘッダー */}
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}/traces`)}
            className={`${subtext} hover:text-blue-500 text-sm transition`}>
            ← トレース一覧
          </button>
          <span className={subtext}>/</span>
          <h1 className="font-bold text-blue-600">チケット管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowModal(true); setError(""); setForm(EMPTY_FORM); }}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
            + チケット作成
          </button>
          <button onClick={toggle}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* ── メイン */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* タブ */}
        <div className={`flex gap-1 p-1 rounded-lg mb-6 w-fit ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {["ALL","未対応","対応中","解決済","保留"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${filter === s ? tabActive : tabInactive}`}>
              {s}
              {s === "ALL"
                ? ` (${issues.length})`
                : ` (${issues.filter(i => i.status === s).length})`}
            </button>
          ))}
        </div>

        {/* チケット一覧 */}
        {loading ? (
          <p className={subtext}>読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
            チケットがありません
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(issue => (
              <div key={issue.id} className={`${cardBg} border rounded-xl p-4 transition`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${text} truncate`}>{issue.title}</h3>
                    <p className={`text-xs ${subtext} mt-1`}>
                      {issue.featureId} · {new Date(issue.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                    {issue.description && (
                      <p className={`text-sm ${subtext} mt-2 line-clamp-2`}>{issue.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[issue.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {issue.status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[issue.priority] ?? "bg-gray-100 text-gray-600"}`}>
                      {issue.priority}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── チケット作成モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className={`${modalBg} border rounded-2xl w-full max-w-md p-6 shadow-2xl`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`font-bold text-lg ${text}`}>チケット作成</h2>
              <button onClick={() => setShowModal(false)}
                className={`${subtext} hover:text-red-500 text-xl leading-none`}>✕</button>
            </div>

            <div className="grid gap-4">
              {/* タイトル */}
              <div>
                <label className={`text-xs font-medium ${subtext} mb-1 block`}>
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="例: ログイン後にエラーが発生する"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className={inputCls} />
              </div>

              {/* 機能ID */}
              <div>
                <label className={`text-xs font-medium ${subtext} mb-1 block`}>
                  機能ID (featureId) <span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="例: MC_PRODUCTS_LIST"
                  value={form.featureId}
                  onChange={e => setForm(f => ({ ...f, featureId: e.target.value }))}
                  className={inputCls} />
              </div>

              {/* 種別 + 優先度（横並び）*/}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-medium ${subtext} mb-1 block`}>
                    種別 <span className="text-red-500">*</span>
                  </label>
                  <select value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className={inputCls}>
                    {["バグ","改善","質問","確認"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`text-xs font-medium ${subtext} mb-1 block`}>
                    優先度 <span className="text-red-500">*</span>
                  </label>
                  <select value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className={inputCls}>
                    <option value="HIGH">HIGH（高）</option>
                    <option value="MEDIUM">MEDIUM（中）</option>
                    <option value="LOW">LOW（低）</option>
                  </select>
                </div>
              </div>

              {/* 説明 */}
              <div>
                <label className={`text-xs font-medium ${subtext} mb-1 block`}>説明（任意）</label>
                <textarea rows={3} placeholder="詳細な説明や再現手順を入力..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>

              {/* エラー */}
              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}
            </div>

            {/* ボタン */}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${dark ? "border-gray-600 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                キャンセル
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition">
                {saving ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
CMSEOF
echo "  完了: CMS issues/page.tsx"

# ── API ビルド & 再起動 ──────────────────────────────────
echo ""
echo "=== API ビルド & pm2 再起動 ==="
cd ~/projects/log-server/apps/api
npm run build && pm2 restart tlog-api
echo ""

# ── 動作確認 ─────────────────────────────────────────────
echo "=== 動作確認: ping ==="
sleep 2
curl -s http://localhost:3099/ping
echo ""

echo ""
echo "✅ Phase 3A 適用完了！"
echo ""
echo "【次の確認手順】"
echo "1. CMS を再起動（npm run dev -- -p 3002）"
echo "2. http://192.168.1.11:3002/projects/<ID>/issues を開く"
echo "3. ヘッダーの「+ チケット作成」ボタンをクリック"
echo "4. フォーム入力 → 「作成する」で POST /api/projects/:id/issues が呼ばれることを確認"
echo ""
echo "【API直接テスト（JWT取得後）】"
echo 'TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"username":"admin","password":"admin1234"}'"'"' | jq -r .access_token)'
echo ''
echo 'curl -s -X POST http://localhost:3099/api/projects/<PROJECT_ID>/issues \'
echo '  -H "Content-Type: application/json" \'
echo '  -H "Authorization: Bearer $TOKEN" \'
echo '  -d '"'"'{"featureId":"MC_PRODUCTS_LIST","title":"テストチケット","type":"バグ","priority":"HIGH","description":"動作確認用"}'"'"' | jq .'
