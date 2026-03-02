#!/bin/bash
set -e
echo "=== Phase 4A: ユーザー管理・権限分離 適用開始 ==="

API_SRC=~/projects/log-server/apps/api/src
CMS_SRC=~/projects/log-server/apps/cms

# ─── バックアップ ───────────────────────────────────────────
echo "[1/7] バックアップ作成..."
cp $API_SRC/auth/auth.controller.ts $API_SRC/auth/auth.controller.ts.bak4a
cp $API_SRC/app.module.ts            $API_SRC/app.module.ts.bak4a
echo "  完了: *.bak4a 作成済み"

# ─── ① roles.decorator.ts ──────────────────────────────────
echo "[2/7] roles.decorator.ts 作成..."
cat > $API_SRC/auth/roles.decorator.ts << 'EOF'
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
EOF
echo "  完了: roles.decorator.ts"

# ─── ② roles.guard.ts ──────────────────────────────────────
echo "[3/7] roles.guard.ts 作成..."
cat > $API_SRC/auth/roles.guard.ts << 'EOF'
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('認証が必要です');
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('この操作には管理者権限が必要です');
    }
    return true;
  }
}
EOF
echo "  完了: roles.guard.ts"

# ─── ③ users ディレクトリ + ファイル群 ─────────────────────
echo "[4/7] users モジュール作成..."
mkdir -p $API_SRC/users

cat > $API_SRC/users/users.service.ts << 'EOF'
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, displayName: true,
        role: true, isActive: true, createdAt: true,
      },
    });
  }

  async create(username: string, password: string, displayName: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException(`ユーザー名 "${username}" は既に使用されています`);
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { username, passwordHash, displayName, role },
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
  }

  async update(id: string, data: { displayName?: string; role?: 'ADMIN' | 'MEMBER'; isActive?: boolean; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.role        !== undefined) updateData.role = data.role;
    if (data.isActive    !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 10);

    return this.prisma.user.update({
      where: { id },
      data:  updateData,
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
  }
}
EOF

cat > $API_SRC/users/users.controller.ts << 'EOF'
import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard }   from '../auth/roles.guard';
import { Roles }        from '../auth/roles.decorator';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: { username: string; password: string; displayName: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.users.create(body.username, body.password, body.displayName, body.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { displayName?: string; role?: 'ADMIN' | 'MEMBER'; isActive?: boolean; password?: string },
    @Request() req: any,
  ) {
    // 自分自身のロール変更を禁止
    if (id === req.user.sub && body.role !== undefined) {
      body = { ...body, role: undefined };
    }
    return this.users.update(id, body);
  }
}
EOF

cat > $API_SRC/users/users.module.ts << 'EOF'
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService }    from './users.service';
import { PrismaModule }    from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [UsersController],
  providers:   [UsersService],
})
export class UsersModule {}
EOF
echo "  完了: users モジュール一式"

# ─── ④ auth.controller.ts — create-user を ADMIN限定に ────
echo "[5/7] auth.controller.ts 更新 (create-user → ADMIN専用)..."
cat > $API_SRC/auth/auth.controller.ts << 'EOF'
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

  // ユーザー作成は ADMIN のみ（旧エンドポイント互換維持）
  @Post('create-user')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createUser(@Body() body: { username: string; password: string; displayName: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.auth.createUser(body.username, body.password, body.displayName, body.role);
  }
}
EOF
echo "  完了: auth.controller.ts"

# ─── ⑤ app.module.ts に UsersModule 追加 ───────────────────
echo "[6/7] app.module.ts 更新..."
python3 - << 'PYEOF'
path = '/home/karkyon/projects/log-server/apps/api/src/app.module.ts'
with open(path) as f:
    src = f.read()

if 'UsersModule' not in src:
    # import 追加
    src = src.replace(
        "import { ApiKeysModule } from './apikeys/apikeys.module';",
        "import { ApiKeysModule } from './apikeys/apikeys.module';\nimport { UsersModule } from './users/users.module';"
    )
    # imports 配列に追加
    src = src.replace(
        'ApiKeysModule,',
        'ApiKeysModule,\n    UsersModule,'
    )
    with open(path, 'w') as f:
        f.write(src)
    print("app.module.ts 更新完了")
else:
    print("app.module.ts: UsersModule 既存")
PYEOF
echo "  完了: app.module.ts"

# ─── ⑥ CMS — /admin/users 画面 ────────────────────────────
echo "[7/7] CMS admin/users 画面作成..."
mkdir -p $CMS_SRC/app/admin/users

cat > $CMS_SRC/app/admin/users/page.tsx << 'CMSEOF'
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type User = {
  id: string; username: string; displayName: string;
  role: "ADMIN" | "MEMBER"; isActive: boolean; createdAt: string;
};
const EMPTY_FORM = { username: "", displayName: "", password: "", role: "MEMBER" as "ADMIN" | "MEMBER" };

export default function AdminUsersPage() {
  const router  = useRouter();
  const { dark, toggle } = useTheme();
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [myId, setMyId]           = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm]   = useState<{ displayName: string; role: "ADMIN" | "MEMBER"; isActive: boolean; password: string }>({ displayName: "", role: "MEMBER", isActive: true, password: "" });

  const bg        = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg  = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const cardBg    = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text      = dark ? "text-white" : "text-gray-900";
  const subtext   = dark ? "text-gray-400" : "text-gray-500";
  const modalBg   = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputCls  = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = JSON.parse(localStorage.getItem("tlog_user") || "{}");
    if (u.role !== "ADMIN") { router.push("/projects"); return; }
    setMyId(u.id || "");
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/users");
      setUsers(res.data);
    } catch { router.push("/projects"); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.username.trim() || !form.displayName.trim() || !form.password.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/users", form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.message || "作成に失敗しました");
    } finally { setSubmitting(false); }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({ displayName: u.displayName, role: u.role, isActive: u.isActive, password: "" });
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const payload: any = {
        displayName: editForm.displayName,
        isActive: editForm.isActive,
      };
      if (editTarget.id !== myId) payload.role = editForm.role;
      if (editForm.password.trim()) payload.password = editForm.password;
      await api.patch(`/api/users/${editTarget.id}`, payload);
      setEditTarget(null);
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.message || "更新に失敗しました");
    } finally { setSubmitting(false); }
  };

  const roleBadge = (role: string) => role === "ADMIN"
    ? "bg-red-100 text-red-700 border border-red-200"
    : "bg-blue-100 text-blue-700 border border-blue-200";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      {/* ヘッダー */}
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/projects")} className={`${subtext} hover:text-blue-500 text-sm transition`}>
            ← プロジェクト一覧
          </button>
          <span className={subtext}>/</span>
          <span className="text-blue-600 font-bold text-sm">ユーザー管理</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggle}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
            {dark ? "☀️" : "🌙"}
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition">
            + ユーザー追加
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">ユーザー一覧</h2>

        {loading ? (
          <p className={subtext}>読み込み中...</p>
        ) : (
          <div className={`${cardBg} border rounded-xl overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={dark ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-600"}>
                  <th className="px-4 py-3 text-left font-medium">ユーザー名</th>
                  <th className="px-4 py-3 text-left font-medium">表示名</th>
                  <th className="px-4 py-3 text-left font-medium">ロール</th>
                  <th className="px-4 py-3 text-left font-medium">状態</th>
                  <th className="px-4 py-3 text-left font-medium">作成日</th>
                  <th className="px-4 py-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map(u => (
                  <tr key={u.id} className={dark ? "hover:bg-gray-800" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3">
                      {u.displayName}
                      {u.id === myId && <span className="ml-2 text-xs text-blue-500">（自分）</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                        {u.isActive ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${subtext} text-xs`}>
                      {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(u)}
                        className="text-xs text-blue-500 hover:text-blue-700 transition">
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ユーザー作成モーダル */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${modalBg} border rounded-xl p-6 w-full max-w-md shadow-xl`}>
            <h2 className={`text-lg font-bold mb-5 ${text}`}>ユーザー追加</h2>
            <div className="space-y-4">
              {[
                { label: "ユーザー名", key: "username", type: "text", placeholder: "例: yamada" },
                { label: "表示名",   key: "displayName", type: "text", placeholder: "例: 山田 太郎" },
                { label: "パスワード", key: "password", type: "password", placeholder: "8文字以上推奨" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className={`block text-sm font-medium mb-1 ${subtext}`}>{label} <span className="text-red-500">*</span></label>
                  <input type={type} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className={inputCls} placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>ロール</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
                  className={inputCls}>
                  <option value="MEMBER">MEMBER（一般）</option>
                  <option value="ADMIN">ADMIN（管理者）</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)}
                className={`px-4 py-2 rounded-lg text-sm ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={handleCreate}
                disabled={submitting || !form.username.trim() || !form.displayName.trim() || !form.password.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {submitting ? "追加中..." : "追加する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ユーザー編集モーダル */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${modalBg} border rounded-xl p-6 w-full max-w-md shadow-xl`}>
            <h2 className={`text-lg font-bold mb-1 ${text}`}>ユーザー編集</h2>
            <p className={`${subtext} text-sm mb-5`}>@{editTarget.username}</p>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>表示名</label>
                <input type="text" value={editForm.displayName}
                  onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                  className={inputCls} />
              </div>
              {editTarget.id !== myId && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${subtext}`}>ロール</label>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as any }))}
                    className={inputCls}>
                    <option value="MEMBER">MEMBER（一般）</option>
                    <option value="ADMIN">ADMIN（管理者）</option>
                  </select>
                </div>
              )}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>状態</label>
                <select value={editForm.isActive ? "true" : "false"}
                  onChange={e => setEditForm(f => ({ ...f, isActive: e.target.value === "true" }))}
                  className={inputCls}>
                  <option value="true">有効</option>
                  <option value="false">無効（ログイン不可）</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>新しいパスワード（変更する場合のみ）</label>
                <input type="password" value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                  className={inputCls} placeholder="空欄なら変更しない" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditTarget(null)}
                className={`px-4 py-2 rounded-lg text-sm ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={handleUpdate} disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {submitting ? "更新中..." : "更新する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
CMSEOF
echo "  完了: CMS admin/users/page.tsx"

# ─── API ビルド & 再起動 ────────────────────────────────────
echo "=== API ビルド & pm2 再起動 ==="
cd ~/projects/log-server/apps/api
npm run build && pm2 restart tlog-api && sleep 2
curl -s http://localhost:3099/ping | jq .
echo ""
echo "✅ Phase 4A 適用完了！"
echo ""
echo "【動作確認手順】"
echo "1. API: 認証なし create-user → 401 確認"
echo "2. API: ADMIN で GET /api/users → ユーザー一覧取得"
echo "3. API: ADMIN で POST /api/users → ユーザー作成"
echo "4. CMS: http://192.168.1.11:3002/admin/users にアクセス"
