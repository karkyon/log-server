"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";

type LogEntry = {
  id: string;
  eventType: string;
  screenName: string | null;
  elementId: string | null;
  payload: any;
  screenshotPath: string | null;
  timestamp: string;
};

type Trace = {
  id: string;
  status: "ACTIVE" | "CLOSED" | "TIMEOUT";
  operatorId: string | null;
  startedAt: string;
  endedAt: string | null;
  metadata: any;
};

type Project = { id: string; name: string; slug: string };

const EVENT_ICONS: Record<string, string> = {
  TRACE_START: "▶",
  TRACE_END:   "⏹",
  SCREEN_LOAD: "🖥",
  UI_CLICK:    "👆",
  ERROR:       "⚠️",
  BACKEND:     "⚙️",
  CONSOLE:     "📟",
};

export default function TraceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const traceId = params.traceId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchData();
  }, [traceId]);

  const fetchData = async () => {
    try {
      const [pRes, tRes, lRes] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/traces/${traceId}`),
        api.get(`/api/projects/${projectId}/traces/${traceId}/logs`),
      ]);
      setProject(pRes.data);
      setTrace(tRes.data);
      setLogs(lRes.data);
    } catch (e: any) {
      if (e.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const generateReview = async () => {
    if (!trace || trace.status === "ACTIVE") return;
    setGenerating(true);
    try {
      const res = await api.post(
        `/api/projects/${projectId}/traces/${traceId}/generate-review`,
        {},
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
      window.open(url, "_blank");
    } catch (e: any) {
      alert(`生成失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const formatTs = (ts: string) => new Date(ts).toLocaleTimeString("ja-JP");
  const formatDt = (ts: string) => new Date(ts).toLocaleString("ja-JP");

  const bg = dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900";
  const card = dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
  const sub = dark ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`min-h-screen ${bg}`}>
      {/* ヘッダー */}
      <header className={`border-b ${dark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} px-6 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-blue-500 font-bold">TLog</span>
          <span className={sub}>/</span>
          <button onClick={() => router.push("/projects")} className="hover:text-blue-400">{project?.name || "..."}</button>
          <span className={sub}>/</span>
          <button onClick={() => router.push(`/projects/${projectId}/traces`)} className="hover:text-blue-400">TraceID一覧</button>
          <span className={sub}>/</span>
          <span className="font-mono text-blue-400">{traceId.slice(0, 8)}...</span>
        </div>
        <button onClick={() => toggle()} className={`text-xs px-2 py-1 rounded ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
          {dark ? "☀" : "🌙"}
        </button>
      </header>

      {/* メタ情報バー */}
      {trace && (
        <div className={`border-b px-6 py-3 flex items-center justify-between ${dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-mono text-blue-400">{traceId.slice(0, 16)}...</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              trace.status === "CLOSED" ? "bg-green-900 text-green-300" :
              trace.status === "ACTIVE" ? "bg-blue-900 text-blue-300" :
              "bg-yellow-900 text-yellow-300"
            }`}>{trace.status}</span>
            <span className={sub}>{trace.operatorId || (trace.metadata?.userLabel) || "—"}</span>
            <span className={sub}>{formatDt(trace.startedAt)}</span>
            {trace.endedAt && <span className={sub}>〜{formatDt(trace.endedAt)}</span>}
            <span className={sub}>{logs.length}イベント</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateReview}
              disabled={trace.status === "ACTIVE" || generating}
              title={trace.status === "ACTIVE" ? "ACTIVE状態のTraceは生成できません" : ""}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
            >
              {generating ? "⏳ 生成中..." : "📄 アクションレビュー生成"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">読み込み中...</div>
      ) : (
        <div className="flex h-[calc(100vh-120px)]">
          {/* 左: タイムライン */}
          <div className={`w-1/2 border-r overflow-y-auto ${dark ? "border-slate-800" : "border-slate-200"}`}>
            <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
              操作タイムライン
            </div>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">ログがありません</div>
            ) : (
              <div>
                {logs.map((log, i) => (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors ${
                      selectedLog?.id === log.id
                        ? dark ? "bg-blue-900/40" : "bg-blue-50"
                        : dark ? "border-slate-800 hover:bg-slate-800" : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-base mt-0.5">{EVENT_ICONS[log.eventType] || "•"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${
                          log.eventType === "ERROR" ? "text-red-400" :
                          log.eventType === "SCREEN_LOAD" ? "text-blue-400" :
                          log.eventType === "UI_CLICK" ? "text-green-400" :
                          dark ? "text-slate-300" : "text-slate-700"
                        }`}>{log.eventType}</span>
                        <span className={`text-xs ${sub}`}>{formatTs(log.timestamp)}</span>
                      </div>
                      {log.screenName && (
                        <div className={`text-xs mt-0.5 ${sub} truncate`}>{log.screenName}</div>
                      )}
                      {log.elementId && (
                        <div className="text-xs text-slate-500 truncate">#{log.elementId}</div>
                      )}
                    </div>
                    {log.screenshotPath && <span className="text-xs text-slate-600">📷</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 右: イベント詳細 */}
          <div className="w-1/2 overflow-y-auto">
            <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
              イベント詳細
            </div>
            {!selectedLog ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                タイムラインのイベントをクリックしてください
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* スクリーンショット */}
                {selectedLog.screenshotPath && (
                  <div>
                    <div className={`text-xs font-semibold mb-2 ${sub}`}>📷 スクリーンショット</div>
                    <img
                      src={`http://192.168.1.11:3099/screenshots/${encodeURIComponent(selectedLog.screenshotPath.replace(/.*screenshots\//, ''))}`}
                      alt="screenshot"
                      className="w-full rounded-lg border border-slate-700"
                      onError={e => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                )}

                {/* 基本情報 */}
                <div>
                  <div className={`text-xs font-semibold mb-2 ${sub}`}>基本情報</div>
                  <div className={`rounded-lg overflow-hidden border ${card}`}>
                    {[
                      ["イベント種別", selectedLog.eventType],
                      ["画面ID", selectedLog.screenName || "—"],
                      ["要素ID", selectedLog.elementId || "—"],
                      ["タイムスタンプ", formatDt(selectedLog.timestamp)],
                    ].map(([label, value]) => (
                      <div key={label} className={`flex border-b last:border-0 ${dark ? "border-slate-700" : "border-slate-100"}`}>
                        <div className={`px-3 py-2 text-xs w-28 ${dark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-500"}`}>{label}</div>
                        <div className="px-3 py-2 text-xs font-mono flex-1">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ペイロード */}
                {selectedLog.payload && (
                  <div>
                    <div className={`text-xs font-semibold mb-2 ${sub}`}>ペイロード</div>
                    <pre className={`text-xs p-3 rounded-lg overflow-x-auto ${dark ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"}`}>
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
