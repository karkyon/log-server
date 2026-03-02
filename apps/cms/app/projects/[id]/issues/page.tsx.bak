"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Issue = {
  id: string; title: string; type: string; priority: string;
  status: string; description: string | null; featureId: string; createdAt: string;
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700", MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-600",
};
const STATUS_COLOR: Record<string, string> = {
  "未対応": "bg-red-100 text-red-700", "対応中": "bg-blue-100 text-blue-700",
  "解決済": "bg-green-100 text-green-700", "保留": "bg-gray-100 text-gray-600",
};

export default function IssuesPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    api.get(`/api/projects/${id}/issues`)
      .then(r => setIssues(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800 hover:border-gray-700" : "bg-white border-gray-200 hover:border-gray-300";
  const tabActive = dark ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow";
  const tabInactive = dark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";

  const filtered = filter === "ALL" ? issues : issues.filter(i => i.status === filter);

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}/traces`)} className={`${subtext} hover:text-blue-500 text-sm transition`}>← トレース一覧</button>
          <span className={subtext}>/</span>
          <h1 className="font-bold text-blue-600">チケット管理</h1>
        </div>
        <button onClick={toggle} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* タブ */}
        <div className={`flex gap-1 p-1 rounded-lg mb-6 w-fit ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {["ALL","未対応","対応中","解決済","保留"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${filter === s ? tabActive : tabInactive}`}>
              {s}
              {s === "ALL" ? ` (${issues.length})` : ` (${issues.filter(i => i.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? <p className={subtext}>読み込み中...</p> : filtered.length === 0 ? (
          <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>チケットがありません</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(issue => (
              <div key={issue.id} className={`${cardBg} border rounded-xl p-4 transition`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${text} truncate`}>{issue.title}</h3>
                    <p className={`text-xs ${subtext} mt-1`}>{issue.featureId} · {new Date(issue.createdAt).toLocaleDateString("ja-JP")}</p>
                    {issue.description && <p className={`text-sm ${subtext} mt-2 line-clamp-2`}>{issue.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[issue.status] || "bg-gray-100 text-gray-600"}`}>{issue.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[issue.priority] || "bg-gray-100 text-gray-600"}`}>{issue.priority}</span>
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
