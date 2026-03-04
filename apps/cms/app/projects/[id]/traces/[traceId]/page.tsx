"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";

type LogEntry = {
  id: string; eventType: string; screenName: string | null;
  elementId: string | null; payload: any; screenshotPath: string | null; timestamp: string;
};
type Trace = { id: string; status: string; operatorId: string | null; startedAt: string; endedAt: string | null; metadata: any; };
type Project = { id: string; name: string; slug: string };
type TLItem = { idx: number; globalSeqNo: number; featureId: string; summary: string; ts: string; hasNg: boolean; imgPath: string | null; eventType: string; log: LogEntry; };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
  COMPLETED: "bg-slate-700/60 text-slate-300 border border-slate-600",
  CLOSED: "bg-slate-700/60 text-slate-300 border border-slate-600",
  TIMEOUT: "bg-orange-900/60 text-orange-300 border border-orange-700",
  ERROR: "bg-red-900/60 text-red-300 border border-red-700",
};
const EVENT_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  TRACE_START: { icon: "▶", color: "text-emerald-400", bg: "bg-emerald-900/60" },
  TRACE_END:   { icon: "⏹", color: "text-slate-400",   bg: "bg-slate-700/60" },
  SCREEN_LOAD: { icon: "🖥", color: "text-blue-400",    bg: "bg-blue-900/60" },
  UI_CLICK:    { icon: "👆", color: "text-purple-400",  bg: "bg-purple-900/60" },
  UI_CHANGE:   { icon: "✏️", color: "text-zinc-400",    bg: "bg-zinc-800/60" },
  ERROR:       { icon: "⚠️", color: "text-red-400",     bg: "bg-red-900/60" },
  BACKEND:     { icon: "⚙️", color: "text-yellow-400",  bg: "bg-yellow-900/60" },
  CONSOLE:     { icon: "📟", color: "text-cyan-400",    bg: "bg-cyan-900/60" },
  TEST:        { icon: "🧪", color: "text-pink-400",    bg: "bg-pink-900/60" },
};
const PALETTE = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16","#f97316","#6366f1"];

function fmtTJ(ts: string) {
  try { return new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts || ""; }
}
function formatDt(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("ja-JP");
}
function formatDuration(start: string, end: string | null) {
  if (!end) return "継続中";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000); const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`;
}

// ─────────────── タイムライン コンポーネント ───────────────
function TimelineView({ items, projectId, traceId, dark }: {
  items: TLItem[]; projectId: string; traceId: string; dark: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(8);
  const [visible, setVisible] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastIdx, setLastIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [patternName, setPatternName] = useState("");
  const [showModal, setShowModal] = useState(false);

  // featureId ごとの色
  const fids = Array.from(new Set(items.map(i => i.featureId)));
  const colorMap: Record<string, string> = {};
  fids.forEach((f, i) => { colorMap[f] = PALETTE[i % PALETTE.length]; });

  const visItems = visible ? items.filter(i => i.featureId === visible) : items;

  // コンテナ幅でカラム数を計算
  useEffect(() => {
    const calc = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth - 40;
        setCols(Math.max(2, Math.floor(w / 180)));
      }
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleClick = (evt: React.MouseEvent, gseq: number, idx: number) => {
    if (evt.shiftKey && lastIdx >= 0) {
      const fr = Math.min(lastIdx, idx), to = Math.max(lastIdx, idx);
      const toAdd: number[] = [];
      for (let i = fr; i <= to; i++) { const g = visItems[i]?.globalSeqNo; if (g != null && !selected.includes(g)) toAdd.push(g); }
      setSelected(s => [...s, ...toAdd]);
    } else if (evt.ctrlKey || evt.metaKey) {
      setSelected(s => s.includes(gseq) ? s.filter(x => x !== gseq) : [...s, gseq]);
      setLastIdx(idx);
    } else {
      setSelected([gseq]);
      setLastIdx(idx);
    }
  };
  const clearSel = () => { setSelected([]); setLastIdx(-1); };

  const openPatternModal = () => { setPatternName(""); setShowModal(true); };
  const savePattern = async () => {
    if (!patternName.trim()) return;
    setSaving(true);
    try {
      const selItems = items.filter(i => selected.includes(i.globalSeqNo)).sort((a, b) => a.globalSeqNo - b.globalSeqNo);
      await api.post(`/api/projects/${projectId}/patterns`, {
        name: patternName,
        screenMode: Array.from(new Set(selItems.map(i => i.featureId))).join(","),
        seqData: {
          traceId,
          seqs: selItems.map(i => ({ seq: i.globalSeqNo, featureId: i.featureId, summary: i.summary, ts: i.ts })),
        },
        memo: `TraceID: ${traceId.slice(0, 8)} から登録（${selItems.length} seq）`,
      });
      setShowModal(false);
      clearSel();
      alert("✅ 作業パターンとして登録しました");
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    } finally { setSaving(false); }
  };

  // 蛇行レイアウト描画
  const rows: TLItem[][] = [];
  for (let r = 0; r * cols < visItems.length; r++) {
    rows.push(visItems.slice(r * cols, (r + 1) * cols));
  }

  const selItems = items.filter(i => selected.includes(i.globalSeqNo)).sort((a, b) => a.globalSeqNo - b.globalSeqNo);
  const selFids = Array.from(new Set(selItems.map(i => i.featureId)));

  return (
    <div style={{ fontFamily: "system-ui,sans-serif" }}>
      {/* フィルターバー */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>画面フィルター:</span>
          <button onClick={() => setVisible(null)}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${visible === null ? "#3b82f6" : "#cbd5e1"}`, background: visible === null ? "#eff6ff" : "white", color: visible === null ? "#1d4ed8" : "#64748b", cursor: "pointer" }}>
            すべて表示
          </button>
          {fids.map(fid => (
            <button key={fid} onClick={() => setVisible(v => v === fid ? null : fid)}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${colorMap[fid]}`, background: visible === fid ? colorMap[fid] + "22" : "white", color: colorMap[fid], cursor: "pointer" }}>
              {fid.replace("MC_", "")}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>{visItems.length} seq</span>
        </div>
      </div>

      {/* 蛇行タイムライン */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div ref={containerRef} style={{ padding: 20, background: "#f8fafc" }}>
          {rows.map((row, ri) => {
            const isRtl = ri % 2 === 1;
            const isLast = (ri + 1) * cols >= visItems.length;
            const orderedRow = isRtl ? [...row].reverse() : row;
            return (
              <div key={ri}>
                {/* カード行 */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0, flexWrap: "nowrap", flexDirection: isRtl ? "row-reverse" : "row" }}>
                  {orderedRow.map((item, ci) => {
                    const col = colorMap[item.featureId] || "#94a3b8";
                    const isSel = selected.includes(item.globalSeqNo);
                    const realCi = isRtl ? orderedRow.length - 1 - ci : ci;
                    const visIdx = visItems.findIndex(v => v.globalSeqNo === item.globalSeqNo);
                    const isLastInRow = realCi === row.length - 1;
                    return (
                      <div key={item.globalSeqNo} style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
                        {/* カードボックス */}
                        <div
                          onClick={(e) => handleClick(e, item.globalSeqNo, visIdx)}
                          style={{
                            width: 150, minHeight: 100, border: `2px solid ${isSel ? "#1d4ed8" : col}`,
                            borderRadius: 8, background: isSel ? "#dbeafe" : "white",
                            padding: "6px 8px", cursor: "pointer", position: "relative",
                            boxShadow: isSel ? "0 0 0 2px #93c5fd" : "0 1px 3px rgba(0,0,0,.08)",
                            transition: "all .15s", userSelect: "none", flexShrink: 0,
                          }}
                        >
                          {/* ヘッダー */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: col }}>seq {item.globalSeqNo}</span>
                            <span style={{ fontSize: 9, background: col, color: "white", borderRadius: 3, padding: "1px 4px", maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.featureId.replace("MC_", "")}
                            </span>
                          </div>
                          {/* サムネイル or No img */}
                          <div style={{ width: "100%", height: 52, background: "#f1f5f9", borderRadius: 4, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {item.imgPath ? (
                              <img src={`http://192.168.1.11:3099/screenshots/${encodeURIComponent(item.imgPath.replace(/.*screenshots\//, ""))}`}
                                alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={e => { (e.currentTarget.parentElement!).innerHTML = '<span style="font-size:9px;color:#94a3b8;">No img</span>'; }} />
                            ) : (
                              <span style={{ fontSize: 9, color: "#94a3b8" }}>No img</span>
                            )}
                          </div>
                          {/* サマリー */}
                          <div style={{ fontSize: 10, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.summary}</div>
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>{fmtTJ(item.ts)}</div>
                          {item.hasNg && <div style={{ fontSize: 9, fontWeight: 700, color: "#dc2626", marginTop: 2 }}>✕ NG</div>}
                        </div>
                        {/* 横矢印（最後以外） */}
                        {!isLastInRow && (
                          <div style={{ display: "flex", alignItems: "center", width: 30, flexShrink: 0 }}>
                            <div style={{ flex: 1, height: 2, background: "#475569" }} />
                            <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: "6px solid #475569" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* 折り返し矢印 */}
                {!isLast && (
                  <div style={{ display: "flex", justifyContent: isRtl ? "flex-start" : "flex-end", paddingLeft: isRtl ? 75 : 0, paddingRight: isRtl ? 0 : 75, height: 32, alignItems: "flex-end" }}>
                    <div style={{ width: 36, height: 28, border: "2px solid #475569", borderTop: "none", borderRight: isRtl ? "none" : undefined, borderLeft: isRtl ? undefined : "none", borderRadius: isRtl ? "0 0 0 10px" : "0 0 10px 0" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 選択パネル */}
      {selected.length > 0 && (
        <div style={{ marginTop: 14, border: "2px solid #3b82f6", borderRadius: 10, background: "#eff6ff", padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>📌 選択中: {selected.length} seq</div>
            <div style={{ fontSize: 12, color: "#475569", flex: 1 }}>
              seq {selItems[0]?.globalSeqNo} ～ {selItems[selItems.length - 1]?.globalSeqNo} | {selFids.map(f => f.replace("MC_", "")).join(", ")}
            </div>
            <button onClick={clearSel}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #94a3b8", background: "white", cursor: "pointer" }}>
              選択解除
            </button>
            <button onClick={openPatternModal}
              style={{ fontSize: 12, fontWeight: 700, padding: "6px 16px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", cursor: "pointer" }}>
              📌 作業パターンとして登録
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {selItems.map(s => (
              <div key={s.globalSeqNo} style={{ background: "white", border: `1px solid ${colorMap[s.featureId] || "#94a3b8"}`, borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
                <span style={{ color: colorMap[s.featureId] || "#94a3b8", fontWeight: 700 }}>seq {s.globalSeqNo}</span>{" "}
                {s.featureId.replace("MC_", "")} — {s.summary.slice(0, 20)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* パターン登録モーダル */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📌 作業パターンとして登録</h3>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
              {selItems.length} seq を選択中 ({selFids.map(f => f.replace("MC_", "")).join(", ")})
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>パターン名 *</label>
            <input
              value={patternName}
              onChange={e => setPatternName(e.target.value)}
              placeholder="例: 部品一覧検索フロー"
              autoFocus
              style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, outline: "none", boxSizing: "border-box" }}
              onKeyDown={e => { if (e.key === "Enter") savePattern(); if (e.key === "Escape") setShowModal(false); }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "1px solid #cbd5e1", background: "white", cursor: "pointer" }}>キャンセル</button>
              <button onClick={savePattern} disabled={saving || !patternName.trim()}
                style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "none", background: saving || !patternName.trim() ? "#94a3b8" : "#3b82f6", color: "white", fontWeight: 700, cursor: saving || !patternName.trim() ? "not-allowed" : "pointer" }}>
                {saving ? "登録中..." : "📌 登録する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── メインページ ───────────────
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
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMode, setGenerateMode] = useState<"browser" | "download">("browser");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<string[]>([]);
  const [genDone, setGenDone] = useState(false);
  const [genResult, setGenResult] = useState<{ url: string; size: number; events: number } | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketFeatureId, setTicketFeatureId] = useState("");
  const [ticketType, setTicketType] = useState("バグ");
  const [ticketPriority, setTicketPriority] = useState("MEDIUM");
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
    } finally { setLoading(false); }
  }, [projectId, traceId, router]);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchData();
  }, [fetchData]);

  // logs → TL_DATA 変換
  const tlItems: TLItem[] = logs.map((log, i) => ({
    idx: i, globalSeqNo: i + 1,
    featureId: log.screenName || "UNKNOWN",
    summary: log.elementId || log.eventType,
    ts: log.timestamp,
    hasNg: log.eventType === "ERROR" || log.payload?.result === "NG",
    imgPath: log.screenshotPath,
    eventType: log.eventType,
    log,
  }));

  const openGenerateModal = () => {
    setGenProgress([]); setGenDone(false); setGenResult(null); setShowGenerateModal(true);
  };
  const executeGenerate = async () => {
    setGenerating(true);
    setGenProgress(["DBからログデータ取得..."]);
    try {
      await new Promise(r => setTimeout(r, 300));
      setGenProgress(p => [...p, "JSONL形式に変換..."]);
      await new Promise(r => setTimeout(r, 400));
      setGenProgress(p => [...p, "generate-review.js 実行中..."]);
      const res = await api.post(`/api/projects/${projectId}/traces/${traceId}/generate-review`, {}, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      setGenProgress(p => [...p, "HTMLレスポンス取得完了"]);
      setGenResult({ url, size: Math.round(blob.size / 1024), events: logs.length });
      setGenDone(true);
    } catch (e: any) {
      setGenProgress(p => [...p, `❌ エラー: ${e.response?.data?.message || e.message}`]);
    } finally { setGenerating(false); }
  };
  const openResult = () => {
    if (!genResult) return;
    if (generateMode === "browser") window.open(genResult.url, "_blank");
    else { const a = document.createElement("a"); a.href = genResult.url; a.download = `review-${traceId.slice(0,8)}.html`; a.click(); }
  };

  const saveTicket = async () => {
    if (!ticketTitle.trim()) return;
    setTicketSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/issues`, { title: ticketTitle, description: ticketDesc, featureId: ticketFeatureId || "UNKNOWN", type: ticketType, priority: ticketPriority, traceId });
      setShowTicketModal(false); setTicketTitle(""); setTicketDesc(""); setTicketFeatureId("");
      alert("✅ チケットを発行しました");
    } catch (e: any) { alert(`失敗: ${e.response?.data?.message || e.message}`); }
    finally { setTicketSaving(false); }
  };

  const forceStop = async () => {
    if (!confirm("強制終了しますか？")) return;
    setForceStoping(true);
    try { await api.post(`/api/projects/${projectId}/traces/${traceId}/force-stop`, {}); await fetchData(); }
    catch (e: any) { alert(`失敗: ${e.response?.data?.message || e.message}`); }
    finally { setForceStoping(false); }
  };

  const addPattern = async () => {
    const name = prompt("パターン名を入力してください:");
    if (!name) return;
    try {
      await api.post(`/api/projects/${projectId}/patterns`, { name, screenMode: "", seqData: { traceId }, memo: `TraceID: ${traceId} から追加` });
      alert("✅ パターンに追加しました");
    } catch (e: any) { alert(`失敗: ${e.response?.data?.message || e.message}`); }
  };

  const clickCount = logs.filter(l => l.eventType === "UI_CLICK" || l.eventType === "CLICK").length;
  const errorCount = logs.filter(l => l.eventType === "ERROR").length;
  const screenCount = new Set(logs.filter(l => l.eventType === "SCREEN_LOAD").map(l => l.screenName)).size;

  const bg   = dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900";
  const hdr  = dark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200";
  const meta = dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200";
  const sub  = dark ? "text-slate-400" : "text-slate-500";
  const tl   = dark ? "border-slate-800 hover:bg-slate-800/60" : "border-slate-100 hover:bg-slate-50";
  const tlA  = dark ? "bg-blue-900/30 border-l-2 border-l-blue-500" : "bg-blue-50 border-l-2 border-l-blue-500";
  const card = dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";

  if (loading) return <div className={`min-h-screen ${bg} flex items-center justify-center`}><span className={sub}>読み込み中...</span></div>;

  return (
    <div className={`min-h-screen ${bg} flex flex-col`}>
      {/* ヘッダー */}
      <header className={`border-b ${hdr} px-6 py-2.5 flex items-center justify-between flex-shrink-0`}>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-blue-500 font-bold">TLog</span>
          <span className={sub}>/</span>
          <button onClick={() => router.push("/projects")} className="hover:text-blue-400">{project?.name || "..."}</button>
          <span className={sub}>/</span>
          <button onClick={() => router.push(`/projects/${projectId}/traces`)} className="hover:text-blue-400">トレース一覧</button>
          <span className={sub}>/</span>
          <span className="font-mono text-blue-400">{traceId.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 text-xs">
            {[{ label: "📋 トレース一覧", path: "traces", active: true },{ label: "🎫 チケット", path: "issues" },{ label: "🎯 パターン", path: "patterns" },{ label: "🔑 APIキー", path: "apikeys" }].map(item => (
              <button key={item.path} onClick={() => router.push(`/projects/${projectId}/${item.path}`)}
                className={`px-3 py-1 rounded transition-colors ${item.active ? "bg-blue-600 text-white" : dark ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <button onClick={() => toggle()} className={`text-xs px-2 py-1 rounded ${dark ? "bg-slate-700" : "bg-slate-100"}`}>{dark ? "☀" : "🌙"}</button>
        </div>
      </header>

      {/* メタバー */}
      {trace && (
        <div className={`border-b ${meta} px-6 py-2.5 flex items-center gap-4 flex-wrap flex-shrink-0 text-xs`}>
          <div><div className={`text-[10px] ${sub}`}>TraceID</div><span className="font-mono text-blue-400">{traceId.slice(0, 16)}...</span></div>
          <div><div className={`text-[10px] ${sub}`}>操作ユーザー</div><span>{trace.operatorId || trace.metadata?.userLabel || "—"}</span></div>
          <div><div className={`text-[10px] ${sub}`}>セッション</div><span>{formatDt(trace.startedAt)} 〜 {trace.endedAt ? formatDt(trace.endedAt) : "継続中"} ({formatDuration(trace.startedAt, trace.endedAt)})</span></div>
          <div className="flex items-center gap-3">
            <span>画面 <strong>{screenCount}</strong></span>
            <span>クリック <strong>{clickCount}</strong></span>
            <span className={errorCount > 0 ? "text-red-400" : ""}>エラー <strong>{errorCount}</strong></span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[trace.status] || STATUS_STYLE.ERROR}`}>{trace.status}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {trace.status === "ACTIVE" && (
              <button onClick={forceStop} disabled={forceStoping} className="px-3 py-1.5 rounded border border-orange-700 text-orange-400 hover:bg-orange-900/40 disabled:opacity-40">
                {forceStoping ? "⏳" : "⏹ 強制終了"}
              </button>
            )}
            <button onClick={openGenerateModal} className="bg-green-700 hover:bg-green-600 text-white px-4 py-1.5 rounded-md font-semibold">📄 アクションレビュー生成</button>
            <button onClick={() => setShowTicketModal(true)} className={`px-3 py-1.5 rounded border ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>🎫 チケット発行</button>
          </div>
        </div>
      )}

      {/* ビュー切り替えタブ */}
      <div className={`border-b ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"} px-6 flex items-center gap-0 flex-shrink-0`}>
        {[{ id: "list", label: "📋 リスト" }, { id: "timeline", label: "📊 タイムライン" }].map(tab => (
          <button key={tab.id} onClick={() => setViewMode(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${viewMode === tab.id ? "border-blue-500 text-blue-500" : `border-transparent ${sub} hover:text-blue-500`}`}>
            {tab.label}
          </button>
        ))}
        <span className={`ml-auto text-xs ${sub} pb-2.5`}>{logs.length} イベント</span>
      </div>

      {/* コンテンツ */}
      {viewMode === "list" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* 左: タイムラインリスト */}
          <div className={`w-1/2 border-r overflow-y-auto ${dark ? "border-slate-800" : "border-slate-200"}`}>
            {logs.length === 0 ? (
              <div className={`text-center py-12 text-sm ${sub}`}>ログがありません</div>
            ) : (
              logs.map(log => {
                const style = EVENT_STYLE[log.eventType] || { icon: "•", color: "text-slate-400", bg: "bg-slate-700/60" };
                const isActive = selectedLog?.id === log.id;
                return (
                  <button key={log.id} onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors ${isActive ? tlA : tl}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5 ${style.bg}`}>{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${style.color}`}>{log.eventType}</span>
                        <span className={`text-[10px] ${sub}`}>{fmtTJ(log.timestamp)}</span>
                      </div>
                      {log.screenName && <div className={`text-xs mt-0.5 truncate ${sub}`}>{log.screenName}</div>}
                      {log.elementId && <div className="text-[10px] text-slate-500 truncate">#{log.elementId}</div>}
                    </div>
                    {log.screenshotPath && <span className="text-[10px] text-slate-600">📷</span>}
                  </button>
                );
              })
            )}
          </div>
          {/* 右: 詳細 */}
          <div className="w-1/2 overflow-y-auto">
            <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 z-10 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>選択イベント詳細</div>
            {!selectedLog ? (
              <div className={`text-center py-16 text-sm ${sub}`}>タイムラインのイベントをクリックしてください</div>
            ) : (
              <div className="p-4 space-y-4">
                {selectedLog.screenshotPath && (
                  <div>
                    <div className={`text-[10px] font-semibold mb-2 ${sub}`}>📷 スクリーンショット</div>
                    <div className={`rounded-lg border flex items-center justify-center h-36 ${dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                      <img src={`http://192.168.1.11:3099/screenshots/${encodeURIComponent(selectedLog.screenshotPath.replace(/.*screenshots\//, ""))}`} alt="" className="rounded max-w-full max-h-32 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                    </div>
                  </div>
                )}
                <div>
                  <div className={`text-[10px] font-semibold mb-2 ${sub}`}>基本情報</div>
                  <div className={`rounded-lg border overflow-hidden ${card}`}>
                    {([["イベント種別", selectedLog.eventType], ["画面ID", selectedLog.screenName || "—"], ["要素ID", selectedLog.elementId || "—"], ["タイムスタンプ", formatDt(selectedLog.timestamp)]] as [string, string][]).map(([label, value]) => (
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
                    <pre className={`text-[10px] p-3 rounded-lg overflow-x-auto ${dark ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"}`}>{JSON.stringify(selectedLog.payload, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <TimelineView items={tlItems} projectId={projectId} traceId={traceId} dark={dark} />
        </div>
      )}

      {/* 下部アクションバー */}
      <div className={`border-t ${dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"} px-6 py-2.5 flex items-center gap-3 flex-shrink-0 text-xs`}>
        <span className={sub}>このTraceIDに対して：</span>
        <button onClick={openGenerateModal} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded font-semibold">📄 アクションレビュー生成</button>
        <button onClick={() => setShowTicketModal(true)} className={`px-3 py-1.5 rounded border ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>🎫 チケット発行</button>
        <button onClick={addPattern} className={`px-3 py-1.5 rounded border ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>🎯 パターンに追加</button>
      </div>

      {/* レビュー生成モーダル */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className={`rounded-xl border p-6 w-[460px] shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"}`}>
            <h2 className="text-sm font-bold mb-1">📄 アクションレビュー生成</h2>
            <p className={`text-xs mb-4 ${sub}`}>対象：<strong>{traceId.slice(0, 8)}...</strong>（{logs.length}イベント）</p>
            {!genDone && genProgress.length === 0 && (
              <>
                <div className="mb-3">
                  <div className={`text-[10px] font-semibold mb-2 ${sub}`}>出力形式</div>
                  <div className="flex gap-2">
                    {[{ id: "browser", label: "🌐 ブラウザで開く", desc: "新規タブで即時プレビュー" }, { id: "download", label: "⬇ HTMLダウンロード", desc: "ファイル保存" }].map(o => (
                      <button key={o.id} onClick={() => setGenerateMode(o.id as any)}
                        className={`flex-1 p-3 rounded-lg border text-left ${generateMode === o.id ? "border-blue-500 bg-blue-900/30" : dark ? "border-gray-700" : "border-slate-300"}`}>
                        <div className="text-xs font-semibold">{o.label}</div>
                        <div className={`text-[10px] mt-0.5 ${sub}`}>{o.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-4">
                  <button onClick={() => setShowGenerateModal(false)} className={`px-4 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>キャンセル</button>
                  <button onClick={executeGenerate} className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-semibold">⚡ 生成開始</button>
                </div>
              </>
            )}
            {genProgress.length > 0 && !genDone && (
              <div className="space-y-2">
                {genProgress.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400">✓</span><span>{step}</span>
                    {i === genProgress.length - 1 && <span className={`text-[10px] ${sub} ml-auto animate-pulse`}>処理中...</span>}
                  </div>
                ))}
              </div>
            )}
            {genDone && genResult && (
              <div>
                <div className="text-center mb-4"><div className="text-2xl mb-2">✅</div><div className="text-sm font-bold">生成完了</div></div>
                <div className={`rounded-lg p-3 text-xs space-y-1.5 mb-4 ${dark ? "bg-slate-800" : "bg-slate-50"}`}>
                  <div className="flex justify-between"><span className={sub}>収録イベント数</span><span>{genResult.events}件</span></div>
                  <div className="flex justify-between"><span className={sub}>ファイルサイズ</span><span>{genResult.size} KB</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGenerateModal(false)} className={`flex-1 px-3 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>閉じる</button>
                  <button onClick={openResult} className="flex-1 px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold">{generateMode === "browser" ? "🌐 ブラウザで開く" : "⬇ ダウンロード"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* チケット発行モーダル */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className={`rounded-xl border p-6 w-[460px] shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"}`}>
            <h2 className="text-sm font-bold mb-4">🎫 チケット発行</h2>
            <div className="space-y-3">
              <div><label className={`text-[10px] font-semibold ${sub} block mb-1`}>タイトル *</label>
                <input value={ticketTitle} onChange={e => setTicketTitle(e.target.value)} placeholder="チケットのタイトル"
                  className={`w-full px-3 py-2 text-sm rounded border outline-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500" : "bg-white border-slate-300 focus:border-blue-500"}`} /></div>
              <div className="flex gap-2">
                <div className="flex-1"><label className={`text-[10px] font-semibold ${sub} block mb-1`}>機能ID</label>
                  <input value={ticketFeatureId} onChange={e => setTicketFeatureId(e.target.value)} placeholder="例: MC_PRODUCTS_LIST"
                    className={`w-full px-3 py-2 text-sm rounded border outline-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500" : "bg-white border-slate-300 focus:border-blue-500"}`} /></div>
                <div><label className={`text-[10px] font-semibold ${sub} block mb-1`}>種別</label>
                  <select value={ticketType} onChange={e => setTicketType(e.target.value)}
                    className={`px-2 py-2 text-sm rounded border outline-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300"}`}>
                    {["バグ","改善","質問","確認"].map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div><label className={`text-[10px] font-semibold ${sub} block mb-1`}>優先度</label>
                  <select value={ticketPriority} onChange={e => setTicketPriority(e.target.value)}
                    className={`px-2 py-2 text-sm rounded border outline-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300"}`}>
                    <option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option>
                  </select></div>
              </div>
              <div><label className={`text-[10px] font-semibold ${sub} block mb-1`}>説明</label>
                <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)} placeholder="問題の詳細（任意）" rows={3}
                  className={`w-full px-3 py-2 text-sm rounded border outline-none resize-none ${dark ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500" : "bg-white border-slate-300 focus:border-blue-500"}`} /></div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowTicketModal(false)} className={`px-4 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>キャンセル</button>
              <button onClick={saveTicket} disabled={ticketSaving || !ticketTitle.trim()} className="px-4 py-2 text-sm rounded bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white font-semibold">
                {ticketSaving ? "発行中..." : "🎫 発行する"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
