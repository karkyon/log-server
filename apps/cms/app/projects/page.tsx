"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Project = {
  id: string; slug: string; name: string;
  description: string | null; isActive: boolean; createdAt: string;
};

const EMPTY_FORM = { name: "", slug: "", description: "" };

export default function ProjectsPage() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ displayName: string; role: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = localStorage.getItem("tlog_user");
    if (u) setUser(JSON.parse(u));
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get("/api/projects");
      setProjects(res.data);
    } catch {} finally { setLoading(false); }
  };

  // name から slug を自動生成
  const handleNameChange = (val: string) => {
    setForm(f => ({
      ...f, name: val,
      slug: f.slug || val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    }));
  };

  const handleSlugChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm(f => ({ ...f, slug: clean }));
    setSlugError(clean.length < 2 ? "2文字以上の英小文字・数字・ハイフンで入力してください" : "");
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/projects", {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || undefined,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchProjects();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      if (msg?.includes('slug')) setSlugError(msg);
      else alert("プロジェクト作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("tlog_token");
    localStorage.removeItem("tlog_user");
    router.push("/login");
  };

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800 hover:border-blue-600" : "bg-white border-gray-200 hover:border-blue-500";
  const modalBg = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <h1 className="text-lg font-bold text-blue-600">TLog NEXT</h1>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <button onClick={() => { setForm(EMPTY_FORM); setSlugError(""); setShowModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition">
              + 新規プロジェクト
            </button>
          )}
          <button onClick={toggle}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition ${dark ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}>
            {dark ? "☀️" : "🌙"}
          </button>
          <span className={`text-sm ${subtext}`}>{user?.displayName}</span>
          <button onClick={logout} className={`text-sm ${subtext} hover:text-red-500 transition`}>ログアウト</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">プロジェクト一覧</h2>
        {loading ? (
          <p className={subtext}>読み込み中...</p>
        ) : projects.length === 0 ? (
          <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
            プロジェクトがありません
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => (
              <div key={p.id} onClick={() => router.push(`/projects/${p.id}/traces`)}
                className={`${cardBg} border rounded-xl p-5 cursor-pointer transition`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-medium ${text}`}>{p.name}</h3>
                    <p className={`${subtext} text-sm mt-1`}>{p.slug}</p>
                    {p.description && <p className={`${subtext} text-sm mt-1`}>{p.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                    {p.isActive ? "稼働中" : "停止"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${modalBg} border rounded-xl p-6 w-full max-w-md shadow-xl`}>
            <h2 className={`text-lg font-bold mb-5 ${text}`}>新規プロジェクト作成</h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>プロジェクト名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => handleNameChange(e.target.value)}
                  className={inputCls} placeholder="例: マシニング管理システム" />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>スラッグ（URL用ID）<span className="text-red-500">*</span></label>
                <input type="text" value={form.slug} onChange={e => handleSlugChange(e.target.value)}
                  className={inputCls} placeholder="例: machining-sys" />
                {slugError && <p className="text-red-500 text-xs mt-1">{slugError}</p>}
                <p className={`text-xs ${subtext} mt-1`}>英小文字・数字・ハイフンのみ。後から変更不可。</p>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>説明（任意）</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`} placeholder="プロジェクトの概要" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className={`px-4 py-2 rounded-lg text-sm ${dark ? "bg-gray-700 hover:bg-gray-600 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={submitting || !form.name.trim() || !form.slug.trim() || !!slugError}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {submitting ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
