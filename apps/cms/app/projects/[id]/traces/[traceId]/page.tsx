"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Log = {
  id: string; eventType: string; screenName: string | null;
  elementId: string | null; payload: any; timestamp: string;
};
type Screenshot = { id: string; filePath: string; ts: string; featureId: string };
type TraceDetail = {
  trace: { id: string; status: string; operatorId: string | null; startedAt: string; endedAt: string | null };
  logs: Log[];
  screenshots: Screenshot[];
};

const EVENT_ICON: Record<string, string> = {
  UI_CLICK: "🖱️", SCREEN_LOAD: "📄", FORM_SUBMIT: "📨",
  ERROR: "❌", CONSOLE_ERROR: "⚠️", SCREENSHOT: "📸",
};

export default function TimelinePage() {
  const router = useRouter();
  const { id, traceId } = useParams<{ id: string; traceId: string }>();
  const { dark, toggle } = useTheme();
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [selected, setSelected] = useState<Log | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    api.get(`/api/projects/${id}/traces/${traceId}`)
      .then(r => { setDetail(r.data); if (r.data?.logs?.[0]) setSelected(r.data.logs[0]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, traceId]);

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const selectedBg = dark ? "bg-blue-900 border-blue-600" : "bg-blue-50 border-blue-400";

  const eventColor = (type: string) => {
    if (type === "ERROR" || type === "CONSOLE_ERROR") return "text-red-500";
    if (type === "SCREEN_LOAD") return "text-green-600";
    if (type === "UI_CLICK") return "text-blue-500";
    return dark ? "text-gray-300" : "text-gray-600";
  };

  if (loading) return <div className={`min-h-screen ${bg} flex items-center justify-center ${subtext}`}>読み込み中...</div>;
  if (!detail) return <div className={`min-h-screen ${bg} flex items-center justify-center ${subtext}`}>データが見つかりません</div>;

  const { trace, logs } = detail;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors flex flex-col`}>
      {/* ヘッダー */}
      <header className={`${headerBg} border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}/traces`)} className={`${subtext} hover:text-blue-500 text-sm transition`}>← 一覧</button>
          <span className={subtext}>/</span>
          <span className="font-mono text-sm font-medium">{traceId.slice(0, 16)}...</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${trace.status === "ACTIVE" ? "bg-green-100 text-green-700" : trace.status === "ERROR" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
            {trace.status}
          </span>
        </div>
        <button onClick={toggle} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      {/* メタ情報バー */}
      <div className={`${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border-b px-6 py-2 flex gap-6 text-sm ${subtext}`}>
        <span>🕐 {new Date(trace.startedAt).toLocaleString("ja-JP")}</span>
        {trace.operatorId && <span>👤 {trace.operatorId}</span>}
        <span>📋 {logs.length} ログ</span>
      </div>

      {/* 2カラムレイアウト */}
      <div className="flex flex-1 overflow-hidden" style={{height: "calc(100vh - 105px)"}}>
        {/* 左: タイムライン */}
        <div className="w-1/2 overflow-y-auto border-r border-gray-200 dark:border-gray-800">
          {logs.map((log, i) => (
            <div
              key={log.id}
              onClick={() => setSelected(log)}
              className={`px-4 py-3 border-b cursor-pointer transition ${
                selected?.id === log.id
                  ? selectedBg + " border-l-4"
                  : dark ? "border-gray-800 hover:bg-gray-800" : "border-gray-100 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-base mt-0.5">{EVENT_ICON[log.eventType] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${eventColor(log.eventType)}`}>{log.eventType}</span>
                    {log.screenName && <span className={`text-xs ${subtext}`}>{log.screenName}</span>}
                  </div>
                  {log.elementId && <p className={`text-xs ${subtext} mt-0.5 truncate`}>{log.elementId}</p>}
                  <p className={`text-xs ${subtext} mt-0.5`}>{new Date(log.timestamp).toLocaleTimeString("ja-JP")}</p>
                </div>
                <span className={`text-xs ${subtext}`}>#{i + 1}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 右: 詳細パネル */}
        <div className="w-1/2 overflow-y-auto p-5">
          {selected ? (
            <div className="space-y-4">
              <div className={`${cardBg} border rounded-xl p-4`}>
                <h3 className="font-semibold mb-3">イベント詳細</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2"><span className={subtext}>タイプ:</span><span className={`font-mono font-semibold ${eventColor(selected.eventType)}`}>{selected.eventType}</span></div>
                  {selected.screenName && <div className="flex gap-2"><span className={subtext}>画面:</span><span>{selected.screenName}</span></div>}
                  {selected.elementId && <div className="flex gap-2"><span className={subtext}>要素:</span><span className="font-mono text-xs">{selected.elementId}</span></div>}
                  <div className="flex gap-2"><span className={subtext}>時刻:</span><span>{new Date(selected.timestamp).toLocaleString("ja-JP")}</span></div>
                </div>
              </div>
              {selected.payload && (
                <div className={`${cardBg} border rounded-xl p-4`}>
                  <h3 className="font-semibold mb-3">ペイロード</h3>
                  <pre className={`text-xs ${subtext} overflow-auto max-h-64 whitespace-pre-wrap`}>
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className={`flex items-center justify-center h-full ${subtext}`}>ログを選択してください</div>
          )}
        </div>
      </div>
    </div>
  );
}
