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
