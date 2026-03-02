"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Trace = {
  id: string; status: string; operatorId: string | null;
  startedAt: string; endedAt: string | null;
  _count?: { logs: number };
};

export default function TracesPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = localStorage.getItem("tlog_user");
    if (u) setUser(JSON.parse(u));
    api.get(`/api/projects/${id}/traces`).then(r => setTraces(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const statusColor = (s: string) => {
    if (s === "ACTIVE")    return "bg-green-100 text-green-700";
    if (s === "COMPLETED") return "bg-blue-100 text-blue-700";
    if (s === "ERROR")     return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800 hover:border-blue-600" : "bg-white border-gray-200 hover:border-blue-500";
  const navBtn = dark ? "bg-gray-800 hover:bg-gray-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/projects")} className={`${subtext} hover:text-blue-500 text-sm transition`}>← プロジェクト一覧</button>
          <span className={subtext}>/</span>
          <h1 className="text-base font-bold text-blue-600">TraceID 一覧</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggle} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
            {dark ? "☀️" : "🌙"}
          </button>
          <span className={`text-sm ${subtext}`}>{user?.displayName}</span>
        </div>
      </header>

      {/* サブナビ */}
      <div className={`${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border-b px-6 py-2 flex gap-2`}>
        <button onClick={() => router.push(`/projects/${id}/traces`)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${dark ? "bg-blue-900 text-blue-300" : "bg-blue-50 text-blue-700"}`}>📋 トレース</button>
        <button onClick={() => router.push(`/projects/${id}/issues`)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${navBtn}`}>🎫 チケット</button>
        <button onClick={() => router.push(`/projects/${id}/patterns`)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${navBtn}`}>📊 パターン</button>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">セッション一覧 ({traces.length})</h2>
        {loading ? <p className={subtext}>読み込み中...</p> : traces.length === 0 ? (
          <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>トレースデータがありません</div>
        ) : (
          <div className="grid gap-3">
            {traces.map((t) => (
              <div key={t.id} onClick={() => router.push(`/projects/${id}/traces/${t.id}`)}
                className={`${cardBg} border rounded-xl p-4 cursor-pointer transition`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium">{t.id}</p>
                    <p className={`${subtext} text-xs mt-1`}>
                      {new Date(t.startedAt).toLocaleString("ja-JP")}
                      {t.operatorId && ` · ${t.operatorId}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {t._count && <span className={`text-xs ${subtext}`}>{t._count.logs} ログ</span>}
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColor(t.status)}`}>{t.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
