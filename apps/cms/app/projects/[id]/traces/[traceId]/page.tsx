"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";

type LogEntry = {
  id: string; eventType: string; screenName: string | null;
  elementId: string | null; payload: any; screenshotPath: string | null; timestamp: string;
};
type Trace = {
  id: string; status: string; operatorId: string | null;
  startedAt: string; endedAt: string | null; metadata: any;
};
type Project = { id: string; name: string; slug: string };

const EVENT_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  TRACE_START:  { icon: "▶",  color: "text-emerald-400", bg: "bg-emerald-900/60" },
  TRACE_END:    { icon: "⏹",  color: "text-slate-400",   bg: "bg-slate-700/60" },
  SCREEN_LOAD:  { icon: "🖥",  color: "text-blue-400",    bg: "bg-blue-900/60" },
  UI_CLICK:     { icon: "👆", color: "text-purple-400",  bg: "bg-purple-900/60" },
  UI_CHANGE:    { icon: "✏️", color: "text-zinc-400",    bg: "bg-zinc-800/60" },
  ERROR:        { icon: "⚠️", color: "text-red-400",     bg: "bg-red-900/60" },
  BACKEND:      { icon: "⚙️", color: "text-yellow-400",  bg: "bg-yellow-900/60" },
  CONSOLE:      { icon: "📟", color: "text-cyan-400",    bg: "bg-cyan-900/60" },
  TEST:         { icon: "🧪", color: "text-pink-400",    bg: "bg-pink-900/60" },
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
  COMPLETED: "bg-slate-700/60 text-slate-300 border border-slate-600",
  CLOSED:    "bg-slate-700/60 text-slate-300 border border-slate-600",
  TIMEOUT:   "bg-orange-900/60 text-orange-300 border border-orange-700",
  ERROR:     "bg-red-900/60 text-red-300 border border-red-700",
};

function formatDt(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("ja-JP");
}
function formatTs(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("ja-JP");
}
function formatDuration(start: string, end: string | null) {
  if (!end) return "継続中";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`;
}

export default function TraceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const traceId = params.traceId as string;
  const { dark, toggle } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateScope, setGenerateScope] = useState<"single" | "bulk">("single");
  const [generateMode, setGenerateMode] = useState<"browser" | "download">("browser");
  const [generating2, setGenerating2] = useState(false);
  const [genProgress, setGenProgress] = useState<string[]>([]);
  const [genDone, setGenDone] = useState(false);
  const [genResult, setGenResult] = useState<{ url: string; size: number; events: number } | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSaving, setTicketSaving] = useState(false);
  const [forceStoping, setForceStoping] = useState(false);

  const fetchData = useCallback(async () => {
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
  }, [projectId, traceId, router]);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchData();
  }, [fetchData]);

  const openGenerateModal = () => {
    setGenProgress([]); setGenDone(false); setGenResult(null);
    setShowGenerateModal(true);
  };

  const executeGenerate = async () => {
    setGenerating2(true);
    setGenProgress(["DBからログデータ取得..."]);
    try {
      await new Promise(r => setTimeout(r, 300));
      setGenProgress(p => [...p, "JSONL形式に変換..."]);
      await new Promise(r => setTimeout(r, 400));
      setGenProgress(p => [...p, "generate-review.js 実行中..."]);

      const res = await api.post(
        `/api/projects/${projectId}/traces/${traceId}/generate-review`,
        {}, { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      setGenProgress(p => [...p, "HTMLレスポンス取得完了"]);
      setGenResult({ url, size: Math.round(blob.size / 1024), events: logs.length });
      setGenDone(true);
    } catch (e: any) {
      setGenProgress(p => [...p, `❌ エラー: ${e.response?.data?.message || e.message}`]);
    } finally {
      setGenerating2(false);
    }
  };

  const openResult = () => {
    if (!genResult) return;
    if (generateMode === "browser") {
      window.open(genResult.url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = genResult.url;
      a.download = `review-${traceId.slice(0, 8)}.html`;
      a.click();
    }
  };

  const saveTicket = async () => {
    if (!ticketTitle.trim()) return;
    setTicketSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/issues`, {
        title: ticketTitle,
        description: ticketDesc,
        traceId,
      });
      setShowTicketModal(false);
      setTicketTitle(""); setTicketDesc("");
      alert("✅ チケットを発行しました");
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setTicketSaving(false);
    }
  };

  const forceStop = async () => {
    if (!confirm("このトレースを強制終了しますか？")) return;
    setForceStoping(true);
    try {
      await api.post(`/api/projects/${projectId}/traces/${traceId}/force-stop`, {});
      await fetchData();
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setForceStoping(false);
    }
  };

  const addPattern = async () => {
    const label = prompt("パターン名を入力してください:");
    if (!label) return;
    try {
      await api.post(`/api/projects/${projectId}/patterns`, {
        label, traceId, description: `TraceID: ${traceId} から追加`,
      });
      alert("✅ パターンに追加しました");
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    }
  };

  const clickCount = logs.filter(l => l.eventType === "UI_CLICK" || l.eventType === "CLICK").length;
  const errorCount = logs.filter(l => l.eventType === "ERROR").length;
  const screenSet = new Set(logs.filter(l => l.eventType === "SCREEN_LOAD").map(l => l.screenName));
  const screenCount = screenSet.size;

  const bg   = dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900";
  const hdr  = dark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200";
  const meta = dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200";
  const card = dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
  const sub  = dark ? "text-slate-400" : "text-slate-500";
  const tl   = dark ? "border-slate-800 hover:bg-slate-800/60" : "border-slate-100 hover:bg-slate-50";
  const tlA  = dark ? "bg-blue-900/30 border-l-2 border-l-blue-500" : "bg-blue-50 border-l-2 border-l-blue-500";

  if (loading) return (
    <div className={`min-h-screen ${bg} flex items-center justify-center`}>
      <span className={sub}>読み込み中...</span>
    </div>
  );

  return (
    <div className={`min-h-screen ${bg} flex flex-col`}>
      {/* ヘッダー */}
      <header className={`border-b ${hdr} px-6 py-2.5 flex items-center justify-between flex-shrink-0`}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-blue-500 font-bold text-xs">TLog</span>
          <span className={`${sub} text-xs`}>/</span>
          <button onClick={() => router.push("/projects")} className="hover:text-blue-400 text-xs">{project?.name || "..."}</button>
          <span className={`${sub} text-xs`}>/</span>
          <button onClick={() => router.push(`/projects/${projectId}/traces`)} className="hover:text-blue-400 text-xs">トレース一覧</button>
          <span className={`${sub} text-xs`}>/</span>
          <span className="font-mono text-blue-400 text-xs">{traceId.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center gap-3">
          {/* サブナビ */}
          <div className="flex gap-1 text-xs">
            {[
              { label: "📋 トレース一覧", path: "traces", active: true },
              { label: "🎫 チケット", path: "issues" },
              { label: "🎯 パターン", path: "patterns" },
              { label: "🔑 APIキー", path: "apikeys" },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => router.push(`/projects/${projectId}/${item.path}`)}
                className={`px-3 py-1 rounded transition-colors ${
                  item.active
                    ? "bg-blue-600 text-white"
                    : dark ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button onClick={() => toggle()} className={`text-xs px-2 py-1 rounded ${dark ? "bg-slate-700 hover:bg-slate-600" : "bg-slate-100 hover:bg-slate-200"}`}>
            {dark ? "☀" : "🌙"}
          </button>
        </div>
      </header>

      {/* TraceIDメタバー */}
      {trace && (
        <div className={`border-b ${meta} px-6 py-2.5 flex items-center gap-5 flex-wrap flex-shrink-0`}>
          <div>
            <div className={`text-[10px] ${sub} mb-0.5`}>TraceID</div>
            <span className="font-mono text-xs text-blue-400">{traceId.slice(0, 16)}...</span>
          </div>
          <div>
            <div className={`text-[10px] ${sub} mb-0.5`}>操作ユーザー</div>
            <span className="text-xs">{trace.operatorId || trace.metadata?.userLabel || "—"}</span>
          </div>
          <div>
            <div className={`text-[10px] ${sub} mb-0.5`}>セッション</div>
            <span className="text-xs">{formatDt(trace.startedAt)} 〜 {trace.endedAt ? formatDt(trace.endedAt) : "継続中"} ({formatDuration(trace.startedAt, trace.endedAt)})</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>画面 <strong>{screenCount}</strong></span>
            <span>クリック <strong>{clickCount}</strong></span>
            <span className={errorCount > 0 ? "text-red-400" : ""}>エラー <strong>{errorCount}</strong></span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[trace.status] || STATUS_STYLE.ERROR}`}>
            {trace.status}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {trace.status === "ACTIVE" && (
              <button
                onClick={forceStop}
                disabled={forceStoping}
                className="text-xs px-3 py-1.5 rounded border border-orange-700 text-orange-400 hover:bg-orange-900/40 disabled:opacity-40 transition-all"
              >
                {forceStoping ? "⏳" : "⏹ 強制終了"}
              </button>
            )}
            <button
              onClick={openGenerateModal}
              className="bg-green-700 hover:bg-green-600 text-white text-xs px-4 py-1.5 rounded-md font-semibold"
            >
              📄 アクションレビュー生成
            </button>
            <button
              onClick={() => setShowTicketModal(true)}
              className={`text-xs px-3 py-1.5 rounded border transition-all ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
            >
              🎫 チケット発行
            </button>
          </div>
        </div>
      )}

      {/* 2カラム */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左: タイムライン */}
        <div className={`w-1/2 border-r overflow-y-auto ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 z-10 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
            操作タイムライン — {logs.length} イベント
          </div>
          {logs.length === 0 ? (
            <div className={`text-center py-12 text-sm ${sub}`}>ログがありません</div>
          ) : (
            <div>
              {logs.map(log => {
                const style = EVENT_STYLE[log.eventType] || { icon: "•", color: "text-slate-400", bg: "bg-slate-700/60" };
                const isActive = selectedLog?.id === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors ${isActive ? tlA : tl}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5 ${style.bg}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${style.color}`}>{log.eventType}</span>
                        <span className={`text-[10px] ${sub}`}>{formatTs(log.timestamp)}</span>
                      </div>
                      {log.screenName && <div className={`text-xs mt-0.5 truncate ${sub}`}>{log.screenName}</div>}
                      {log.elementId && <div className="text-[10px] text-slate-500 truncate">#{log.elementId}</div>}
                    </div>
                    {log.screenshotPath && <span className="text-[10px] text-slate-600 flex-shrink-0">📷</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 右: イベント詳細 */}
        <div className="w-1/2 overflow-y-auto">
          <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 z-10 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
            選択イベント詳細
          </div>
          {!selectedLog ? (
            <div className={`text-center py-16 text-sm ${sub}`}>タイムラインのイベントをクリックしてください</div>
          ) : (
            <div className="p-4 space-y-4">
              {selectedLog.screenshotPath && (
                <div>
                  <div className={`text-[10px] font-semibold mb-2 ${sub}`}>📷 スクリーンショット</div>
                  <div className={`rounded-lg border flex items-center justify-center h-36 ${dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                    <img
                      src={`http://192.168.1.11:3099/screenshots/${encodeURIComponent(selectedLog.screenshotPath.replace(/.*screenshots\//, ""))}`}
                      alt="スクリーンショット"
                      className="rounded max-w-full max-h-32 object-contain"
                      onError={e => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                </div>
              )}
              <div>
                <div className={`text-[10px] font-semibold mb-2 ${sub}`}>基本情報</div>
                <div className={`rounded-lg border overflow-hidden ${card}`}>
                  {([
                    ["イベント種別", selectedLog.eventType],
                    ["画面ID", selectedLog.screenName || "—"],
                    ["要素ID", selectedLog.elementId || "—"],
                    ["タイムスタンプ", formatDt(selectedLog.timestamp)],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className={`flex border-b last:border-0 ${dark ? "border-slate-700" : "border-slate-100"}`}>
                      <div className={`px-3 py-2 text-[10px] w-24 flex-shrink-0 ${dark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-500"}`}>{label}</div>
                      <div className="px-3 py-2 text-xs font-mono flex-1 break-all">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedLog.payload && Object.keys(selectedLog.payload).length > 0 && (
                <div>
                  <div className={`text-[10px] font-semibold mb-2 ${sub}`}>ペイロード</div>
                  <pre className={`text-[10px] p-3 rounded-lg overflow-x-auto ${dark ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"}`}>
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 下部アクションバー */}
      <div className={`border-t ${dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"} px-6 py-2.5 flex items-center gap-3 flex-shrink-0`}>
        <span className={`text-xs ${sub}`}>このTraceIDに対して：</span>
        <button
          onClick={openGenerateModal}
          className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded font-semibold"
        >
          📄 アクションレビュー生成
        </button>
        <button
          onClick={() => setShowTicketModal(true)}
          className={`text-xs px-3 py-1.5 rounded border transition-all ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
        >
          🎫 チケット発行
        </button>
        <button
          onClick={addPattern}
          className={`text-xs px-3 py-1.5 rounded border transition-all ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
        >
          🎯 パターンに追加
        </button>
      </div>

      {/* レビュー生成モーダル */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className={`rounded-xl border p-6 w-[460px] shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"}`}>
            <h2 className="text-sm font-bold mb-1">📄 アクションレビュー生成</h2>
            <p className={`text-xs mb-4 ${sub}`}>
              対象：<strong className={dark ? "text-white" : "text-slate-800"}>{traceId.slice(0, 8)}...</strong>
              （{trace?.operatorId || "—"} / {formatDuration(trace?.startedAt || "", trace?.endedAt || null)} / {logs.length}イベント）
            </p>

            {!genDone && genProgress.length === 0 && (
              <>
                <div className="mb-3">
                  <div className={`text-[10px] font-semibold mb-2 ${sub}`}>出力形式</div>
                  <div className="flex gap-2">
                    {[
                      { id: "browser", label: "🌐 ブラウザで開く", desc: "新規タブで即時プレビュー" },
                      { id: "download", label: "⬇ HTMLダウンロード", desc: "ファイル保存" },
                    ].map(o => (
                      <button
                        key={o.id}
                        onClick={() => setGenerateMode(o.id as any)}
                        className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                          generateMode === o.id
                            ? "border-blue-500 bg-blue-900/30"
                            : dark ? "border-gray-700 hover:border-gray-500" : "border-slate-300 hover:border-slate-400"
                        }`}
                      >
                        <div className="text-xs font-semibold">{o.label}</div>
                        <div className={`text-[10px] mt-0.5 ${sub}`}>{o.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-4">
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    className={`px-4 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={executeGenerate}
                    className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-semibold"
                  >
                    ⚡ 生成開始
                  </button>
                </div>
              </>
            )}

            {genProgress.length > 0 && !genDone && (
              <div className="space-y-2">
                {genProgress.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400">✓</span>
                    <span>{step}</span>
                    {i === genProgress.length - 1 && <span className={`text-[10px] ${sub} ml-auto animate-pulse`}>処理中...</span>}
                  </div>
                ))}
              </div>
            )}

            {genDone && genResult && (
              <div>
                <div className="text-center mb-4">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="text-sm font-bold">生成完了</div>
                </div>
                <div className={`rounded-lg p-3 text-xs space-y-1.5 mb-4 ${dark ? "bg-slate-800" : "bg-slate-50"}`}>
                  <div className="flex justify-between"><span className={sub}>対象TraceID</span><span className="font-mono text-blue-400">{traceId.slice(0, 8)}...</span></div>
                  <div className="flex justify-between"><span className={sub}>収録イベント数</span><span>{genResult.events}件</span></div>
                  <div className="flex justify-between"><span className={sub}>ファイルサイズ</span><span>{genResult.size} KB</span></div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    className={`flex-1 px-3 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
                  >
                    閉じる
                  </button>
                  <button
                    onClick={openResult}
                    className="flex-1 px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                  >
                    {generateMode === "browser" ? "🌐 ブラウザで開く" : "⬇ ダウンロード"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* チケット発行モーダル */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className={`rounded-xl border p-6 w-[440px] shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"}`}>
            <h2 className="text-sm font-bold mb-4">🎫 チケット発行</h2>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] font-semibold ${sub} block mb-1`}>タイトル *</label>
                <input
                  value={ticketTitle}
                  onChange={e => setTicketTitle(e.target.value)}
                  placeholder="チケットのタイトル"
                  className={`w-full px-3 py-2 text-sm rounded border outline-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500" : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"}`}
                />
              </div>
              <div>
                <label className={`text-[10px] font-semibold ${sub} block mb-1`}>説明</label>
                <textarea
                  value={ticketDesc}
                  onChange={e => setTicketDesc(e.target.value)}
                  placeholder="問題の詳細（任意）"
                  rows={3}
                  className={`w-full px-3 py-2 text-sm rounded border outline-none resize-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500" : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"}`}
                />
              </div>
              <p className={`text-[10px] ${sub}`}>TraceID: {traceId.slice(0, 16)}... に関連付けて保存されます</p>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowTicketModal(false)}
                className={`px-4 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
              >
                キャンセル
              </button>
              <button
                onClick={saveTicket}
                disabled={ticketSaving || !ticketTitle.trim()}
                className="px-4 py-2 text-sm rounded bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white font-semibold"
              >
                {ticketSaving ? "発行中..." : "🎫 発行する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
