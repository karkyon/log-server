#!/bin/bash
set -e
BASE=~/projects/log-server

echo "=== Phase 4B: リフレッシュトークン + データ初期化 適用開始 ==="

# ─────────────────────────────────────────────
# [1] バックアップ
# ─────────────────────────────────────────────
echo "[1/6] バックアップ作成..."
cp $BASE/apps/api/src/auth/auth.service.ts  $BASE/apps/api/src/auth/auth.service.ts.bak4b  2>/dev/null || true
cp $BASE/apps/api/src/auth/auth.controller.ts $BASE/apps/api/src/auth/auth.controller.ts.bak4b 2>/dev/null || true
cp $BASE/apps/cms/lib/api.ts $BASE/apps/cms/lib/api.ts.bak4b 2>/dev/null || true
echo "  完了"

# ─────────────────────────────────────────────
# [2] API: auth.service.ts — refresh token追加
# ─────────────────────────────────────────────
echo "[2/6] auth.service.ts 更新 (refreshToken追加)..."
cat > $BASE/apps/api/src/auth/auth.service.ts << 'TSEOF'
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { createClient } from 'redis';

// Redis クライアント（シングルトン）
let redisClient: ReturnType<typeof createClient> | null = null;
async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redisClient.on('error', (e) => console.error('[Redis]', e));
    await redisClient.connect();
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
    const redis = await getRedis();
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
    const redis = await getRedis();
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
    const redis = await getRedis();
    await redis.set(`rt:${token}`, userId, { EX: RT_TTL_SEC });
    return token;
  }
}
TSEOF
echo "  完了: auth.service.ts"

# ─────────────────────────────────────────────
# [3] API: auth.controller.ts — /refresh /logout追加
# ─────────────────────────────────────────────
echo "[3/6] auth.controller.ts 更新 (refresh/logout追加)..."
cat > $BASE/apps/api/src/auth/auth.controller.ts << 'TSEOF'
import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard }   from './roles.guard';
import { Roles }        from './roles.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body.username, body.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() body: { refreshToken: string }) {
    return this.auth.logout(body.refreshToken);
  }

  @Post('create-user')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createUser(@Body() body: { username: string; password: string; displayName: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.auth.createUser(body.username, body.password, body.displayName, body.role);
  }
}
TSEOF
echo "  完了: auth.controller.ts"

# ─────────────────────────────────────────────
# [4] API: admin reset エンドポイント追加
# ─────────────────────────────────────────────
echo "[4/6] admin reset エンドポイント作成..."
mkdir -p $BASE/apps/api/src/admin

cat > $BASE/apps/api/src/admin/admin.controller.ts << 'TSEOF'
import { Controller, Delete, Query, UseGuards, BadRequestException, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard }   from '../auth/roles.guard';
import { Roles }        from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  /** DELETE /api/admin/reset?project=<slug>  プロジェクトのログデータを全削除 */
  @Delete('reset')
  @HttpCode(200)
  async resetProject(@Query('project') slug: string) {
    if (!slug) throw new BadRequestException('project パラメータが必要です');
    return this.admin.resetProjectData(slug);
  }
}
TSEOF

cat > $BASE/apps/api/src/admin/admin.service.ts << 'TSEOF'
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async resetProjectData(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`プロジェクト "${slug}" が見つかりません`);

    // ログ・パターン・チケット・APIキーをまとめて削除（プロジェクトは残す）
    const [logs, patterns, issues, apiKeys] = await Promise.all([
      this.prisma.log.deleteMany({ where: { projectId: project.id } }),
      this.prisma.pattern.deleteMany({ where: { projectId: project.id } }),
      this.prisma.issue.deleteMany({ where: { projectId: project.id } }),
      this.prisma.apiKey.deleteMany({ where: { projectId: project.id } }),
    ]);

    return {
      message: `プロジェクト "${project.name}" のデータを初期化しました`,
      deleted: {
        logs: logs.count,
        patterns: patterns.count,
        issues: issues.count,
        apiKeys: apiKeys.count,
      },
    };
  }
}
TSEOF

cat > $BASE/apps/api/src/admin/admin.module.ts << 'TSEOF'
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { PrismaModule }    from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
TSEOF
echo "  完了: admin モジュール一式"

# app.module.ts に AdminModule を追加
python3 - << 'PYEOF'
import re, sys
path = "/home/karkyon/projects/log-server/apps/api/src/app.module.ts"
with open(path) as f: src = f.read()

if 'AdminModule' in src:
    print("  AdminModule は既に登録済み")
    sys.exit(0)

# import追加
src = src.replace(
    "import { UsersModule }",
    "import { AdminModule }  from './admin/admin.module';\nimport { UsersModule }"
)
# imports配列に追加
src = re.sub(r'(UsersModule,)', r'\1\n    AdminModule,', src)

with open(path, 'w') as f: f.write(src)
print("  app.module.ts 更新完了")
PYEOF

# ─────────────────────────────────────────────
# [5] CMS: api.ts — refreshToken interceptor
# ─────────────────────────────────────────────
echo "[5/6] CMS api.ts 更新 (refresh interceptor)..."
cat > $BASE/apps/cms/lib/api.ts << 'TSEOF'
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3099';

export const api = axios.create({ baseURL: API_BASE });

// リクエストにアクセストークンを自動付与
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tlog_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → リフレッシュトークンで自動更新、失敗したらログインへ
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function flushQueue(token: string | null, error?: unknown) {
  pendingQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }
    original._retry = true;

    // 既にリフレッシュ中なら待機キューへ
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    isRefreshing = true;
    const rt = typeof window !== 'undefined' ? localStorage.getItem('tlog_refresh') : null;

    if (!rt) {
      isRefreshing = false;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tlog_token');
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    try {
      const res = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken: rt });
      const { accessToken, refreshToken: newRt, user } = res.data;
      localStorage.setItem('tlog_token', accessToken);
      localStorage.setItem('tlog_refresh', newRt);
      if (user) localStorage.setItem('tlog_user', JSON.stringify(user));
      flushQueue(accessToken);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      flushQueue(null, refreshErr);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tlog_token');
        localStorage.removeItem('tlog_refresh');
        localStorage.removeItem('tlog_user');
        window.location.href = '/login';
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login', { username, password }),
  logout: () => {
    const rt = typeof window !== 'undefined' ? localStorage.getItem('tlog_refresh') : null;
    if (rt) api.post('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  },
};
TSEOF
echo "  完了: api.ts"

# login ページの localStorage保存にrefreshToken追加
LOGIN_PAGE=$BASE/apps/cms/app/login/page.tsx
if grep -q "tlog_refresh" "$LOGIN_PAGE" 2>/dev/null; then
  echo "  login/page.tsx は既に refreshToken 対応済み"
else
  python3 - << 'PYEOF'
path = "/home/karkyon/projects/log-server/apps/cms/app/login/page.tsx"
with open(path) as f: src = f.read()
# accessToken/refreshToken/user を保存
old = "localStorage.setItem('tlog_token', res.data.accessToken);"
new = """localStorage.setItem('tlog_token', res.data.accessToken);
      if (res.data.refreshToken) localStorage.setItem('tlog_refresh', res.data.refreshToken);"""
if old in src:
    src = src.replace(old, new)
    with open(path, 'w') as f: f.write(src)
    print("  login/page.tsx 更新完了 (refreshToken保存追加)")
else:
    print("  [WARNING] login/page.tsx の保存コードが見つかりません。手動確認が必要です")
PYEOF
fi

# logout関数にrefreshToken削除追加（projects/page.tsx）
python3 - << 'PYEOF'
path = "/home/karkyon/projects/log-server/apps/cms/app/projects/page.tsx"
with open(path) as f: src = f.read()
old = """  const logout = () => {
    localStorage.removeItem("tlog_token");
    localStorage.removeItem("tlog_user");
    router.push("/login");
  };"""
new = """  const logout = () => {
    const rt = localStorage.getItem("tlog_refresh");
    if (rt) { import("@/lib/api").then(({ authApi }) => authApi.logout()); }
    localStorage.removeItem("tlog_token");
    localStorage.removeItem("tlog_refresh");
    localStorage.removeItem("tlog_user");
    router.push("/login");
  };"""
if "tlog_refresh" in src:
    print("  projects/page.tsx は既に refreshToken 対応済み")
elif old in src:
    src = src.replace(old, new)
    with open(path, 'w') as f: f.write(src)
    print("  projects/page.tsx logout更新完了")
else:
    print("  [WARNING] projects/page.tsx の logout関数が見つかりません")
PYEOF

# ─────────────────────────────────────────────
# [6] CMS: /admin/reset ページ作成
# ─────────────────────────────────────────────
echo "[6/6] CMS /admin/reset ページ作成..."
mkdir -p $BASE/apps/cms/app/admin/reset

cat > $BASE/apps/cms/app/admin/reset/page.tsx << 'TSEOF'
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Project = { id: string; slug: string; name: string };

export default function AdminResetPage() {
  const router = useRouter();
  const { dark } = useTheme();
  const [user, setUser]       = useState<{ displayName: string; role: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [confirm, setConfirm]   = useState("");
  const [step, setStep]         = useState<"select" | "confirm" | "done">("select");
  const [result, setResult]     = useState<{ deleted: Record<string, number>; message: string } | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const bg   = dark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900";
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const sub  = dark ? "text-gray-400" : "text-gray-500";
  const inp  = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"}`;

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = localStorage.getItem("tlog_user");
    if (u) {
      const parsed = JSON.parse(u);
      setUser(parsed);
      if (parsed.role !== "ADMIN") { router.push("/projects"); return; }
    }
    api.get("/api/projects").then(r => setProjects(r.data)).catch(() => {});
  }, []);

  const handleSelect = (p: Project) => {
    setSelected(p);
    setConfirm("");
    setError("");
    setStep("confirm");
  };

  const handleReset = async () => {
    if (!selected || confirm !== selected.slug) {
      setError("プロジェクトのスラッグが一致しません");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.delete(`/api/admin/reset?project=${selected.slug}`);
      setResult(res.data);
      setStep("done");
    } catch (e: any) {
      setError(e.response?.data?.message || "削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${bg}`}>
      {/* ヘッダー */}
      <header className={`${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border-b px-6 py-4 flex items-center gap-4`}>
        <button onClick={() => router.push("/projects")} className={`text-sm ${sub} hover:text-blue-500 transition`}>← プロジェクト一覧</button>
        <h1 className="text-lg font-bold text-red-500">🗑️ データ初期化</h1>
        <span className={`text-xs ml-auto ${sub}`}>{user?.displayName} (ADMIN)</span>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">

        {/* 警告バナー */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-red-700">
          <p className="font-bold text-sm">⚠️ この操作は取り消せません</p>
          <p className="text-xs mt-1">選択したプロジェクトのログ・パターン・チケット・APIキーがすべて削除されます。プロジェクト自体は残ります。</p>
        </div>

        {/* STEP 1: プロジェクト選択 */}
        {step === "select" && (
          <div className={`${card} border rounded-xl p-6`}>
            <h2 className="font-semibold mb-4">初期化するプロジェクトを選択</h2>
            {projects.length === 0 ? (
              <p className={`text-sm ${sub}`}>プロジェクトがありません</p>
            ) : (
              <div className="space-y-2">
                {projects.map(p => (
                  <button key={p.id} onClick={() => handleSelect(p)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition hover:border-red-400 ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-red-50"}`}>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className={`text-xs ${sub}`}>{p.slug}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: スラッグ入力で2重確認 */}
        {step === "confirm" && selected && (
          <div className={`${card} border rounded-xl p-6`}>
            <h2 className="font-semibold mb-2">確認：データを削除します</h2>
            <p className={`text-sm ${sub} mb-5`}>
              <span className="font-bold text-red-500">{selected.name}</span> のデータをすべて削除します。<br />
              続行するには下のフィールドにプロジェクトのスラッグ（<code className="bg-gray-100 text-gray-800 px-1 rounded text-xs">{selected.slug}</code>）を入力してください。
            </p>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={selected.slug}
              className={inp}
            />
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep("select")}
                className={`flex-1 py-2 rounded-lg border text-sm transition ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
                キャンセル
              </button>
              <button onClick={handleReset} disabled={loading || confirm !== selected.slug}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium transition">
                {loading ? "削除中..." : "削除を実行"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 完了 */}
        {step === "done" && result && (
          <div className={`${card} border rounded-xl p-6 text-center`}>
            <p className="text-2xl mb-3">✅</p>
            <p className="font-semibold mb-4">{result.message}</p>
            <div className={`${dark ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-4 text-sm text-left space-y-1 mb-6`}>
              <p>ログ削除数：<span className="font-mono font-bold">{result.deleted.logs}</span></p>
              <p>パターン削除数：<span className="font-mono font-bold">{result.deleted.patterns}</span></p>
              <p>チケット削除数：<span className="font-mono font-bold">{result.deleted.issues}</span></p>
              <p>APIキー削除数：<span className="font-mono font-bold">{result.deleted.apiKeys}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep("select"); setSelected(null); setConfirm(""); setResult(null); }}
                className={`flex-1 py-2 rounded-lg border text-sm ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
                別のプロジェクトを初期化
              </button>
              <button onClick={() => router.push("/projects")}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                プロジェクト一覧へ
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
TSEOF
echo "  完了: /admin/reset/page.tsx"

# ─────────────────────────────────────────────
# API ビルド & 再起動
# ─────────────────────────────────────────────
echo "=== API ビルド & pm2 再起動 ==="
cd $BASE/apps/api
npm run build

pm2 restart tlog-api --update-env
sleep 3

pm2 status
curl -s http://localhost:3099/ping | jq .

echo ""
echo "✅ Phase 4B 適用完了！"
echo ""
echo "【動作確認手順】"
echo "1. ログイン: curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin1234\"}' | jq ."
echo "   → accessToken と refreshToken が両方返ることを確認"
echo "2. CMS ビルド後: http://192.168.1.11:3002/admin/reset にアクセス"
echo "3. データ削除テスト（プロジェクトスラッグ入力 → 実行）"
