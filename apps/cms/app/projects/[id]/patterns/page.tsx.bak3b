"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Pattern = {
  id: string; name: string; screenMode: string | null;
  status: string; memo: string | null; createdAt: string;
  seqData: any;
};

const STATUS_COLOR: Record<string, string> = {
  "未評価": "bg-gray-100 text-gray-600",
  "正常": "bg-green-100 text-green-700",
  "要確認": "bg-yellow-100 text-yellow-700",
  "NG": "bg-red-100 text-red-700",
};

export default function PatternsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Pattern | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    api.get(`/api/projects/${id}/patterns`)
      .then(r => setPatterns(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const hoverBg = dark ? "hover:border-blue-600" : "hover:border-blue-400";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}/traces`)} className={`${subtext} hover:text-blue-500 text-sm transition`}>← トレース一覧</button>
          <span className={subtext}>/</span>
          <h1 className="font-bold text-blue-600">作業パターン</h1>
        </div>
        <button onClick={toggle} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 flex gap-6">
        {/* 左: パターン一覧 */}
        <div className="w-1/2">
          <h2 className="font-semibold mb-4">パターン一覧 ({patterns.length})</h2>
          {loading ? <p className={subtext}>読み込み中...</p> : patterns.length === 0 ? (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>パターンがありません</div>
          ) : (
            <div className="grid gap-3">
              {patterns.map(p => (
                <div key={p.id} onClick={() => setSelected(p)}
                  className={`${cardBg} ${hoverBg} border rounded-xl p-4 cursor-pointer transition ${selected?.id === p.id ? "border-blue-500" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className={`font-medium ${text}`}>{p.name}</h3>
                      {p.screenMode && <p className={`text-xs ${subtext} mt-1`}>{p.screenMode}</p>}
                      {p.memo && <p className={`text-xs ${subtext} mt-1 line-clamp-2`}>{p.memo}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${STATUS_COLOR[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 詳細 */}
        <div className="w-1/2">
          <h2 className="font-semibold mb-4">シーケンス詳細</h2>
          {selected ? (
            <div className={`${cardBg} border rounded-xl p-4`}>
              <h3 className="font-medium mb-3">{selected.name}</h3>
              <pre className={`text-xs ${subtext} overflow-auto max-h-96 whitespace-pre-wrap`}>
                {JSON.stringify(selected.seqData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
              パターンを選択してください
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
