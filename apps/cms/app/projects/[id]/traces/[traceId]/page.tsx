"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";

type LogEntry = {
  id: string; eventType: string; screenName: string | null;
  elementId: string | null; payload: any; screenshotPath: string | null; timestamp: string;
  verdict?: { verdict: string; issueType?: string; priority?: string; status?: string; content?: string; memo?: string; } | null;
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
  try { return new Date(ts).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts || ""; }
}
function formatDt(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
function formatDuration(start: string, end: string | null) {
  if (!end) return "継続中";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000); const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`;
}

// ─────────────── ActionReviewDetail ───────────────
function ActionReviewDetail({ log, seqNo, dark, traceId, projectId, onVerdictSaved }: {
  log: LogEntry; seqNo: number; dark: boolean; traceId: string; projectId: string;
  onVerdictSaved?: (logId: string, verdict: LogEntry["verdict"]) => void
}) {
  const calcInitVerdict = (l: typeof log) =>
    l.verdict?.verdict === "NG" || l.payload?.result === "NG" || l.eventType === "ERROR" ? "NG" : "OK";
  const [verdict, setVerdict] = useState<"OK" | "NG">(calcInitVerdict(log));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [issueType, setIssueType] = useState("不具合");
  const [issuePriority, setIssuePriority] = useState("高");
  const [issueStatus, setIssueStatus] = useState("未対応");
  const [issueContent, setIssueContent] = useState("");
  const [issueMemo, setIssueMemo] = useState("");

  useEffect(() => {
    const v = calcInitVerdict(log);
    setVerdict(v);
    setIssueType(log.verdict?.issueType ?? "不具合");
    setIssuePriority(log.verdict?.priority ?? "高");
    setIssueStatus(log.verdict?.status ?? "未対応");
    setIssueContent(log.verdict?.content ?? "");
    setIssueMemo(log.verdict?.memo ?? "");
    setSaved(false);
    setDirty(false);
  }, [log.id]);

  const saveVerdict = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/api/projects/${projectId}/traces/${traceId}/logs/${log.id}/verdict`, {
        verdict, issueType, priority: issuePriority, status: issueStatus, content: issueContent, memo: issueMemo
      });
      setSaved(true); setDirty(false);
      setTimeout(() => setSaved(false), 3000);
      onVerdictSaved?.(log.id, res.data);
    } catch (e: any) {
      console.error("[saveVerdict] ERROR", e?.response?.status, e?.message);
    } finally { setSaving(false); }
  };

  const sub = dark ? "text-slate-400" : "text-slate-500";
  const rowCls = `flex border-b last:border-0 ${dark ? "border-slate-700" : "border-slate-200"}`;
  const labelCls = `px-4 py-2.5 text-xs font-medium w-24 flex-shrink-0 ${dark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-500"}`;
  const valCls = `px-4 py-2.5 text-xs flex-1`;
  const borderCls = dark ? "border-slate-700" : "border-slate-200";

  const p = log.payload || {};
  const inputValue = p.value ?? p.inputValue ?? p.text ?? null;
  const consoleOutput = p.console ?? p.consoleLog ?? p.log ?? null;
  const issues = p.issues ?? p.problems ?? p.remarks ?? null;

  const summary = (() => {
    if (log.screenName && log.elementId) return `${log.screenName} — ${log.elementId}`;
    if (log.screenName) return `${log.screenName} — ${log.eventType}`;
    return log.eventType;
  })();

  const screenshotUrl = (() => {
    if (!log.screenshotPath) return null;
    const sp = log.screenshotPath;
    const mLogs = sp.match(/logs[/\\]screenshots[/\\](.+)/);
    if (mLogs) {
      const parts = mLogs[1].replace(/\\/g, "/").split("/");
      return "http://192.168.1.11:3099/logs-screenshots/" + parts.map(encodeURIComponent).join("/");
    }
    const mSs = sp.match(/screenshots[/\\](.+)/);
    if (mSs) {
      const parts = mSs[1].replace(/\\/g, "/").split("/");
      return "http://192.168.1.11:3099/screenshots/" + parts.map(encodeURIComponent).join("/");
    }
    return "http://192.168.1.11:3099/logs-screenshots/" + encodeURIComponent(sp.replace(/.*[/\\]/, ""));
  })();

  return (
    <div className="p-0">
      <div className={`flex items-baseline gap-6 px-5 py-3 border-b ${dark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
        <div>
          <span className={`text-[10px] font-bold ${sub} mr-2`}>SEQNO</span>
          <span className="text-lg font-bold">{seqNo}</span>
        </div>
        <div className="text-sm font-semibold flex-1">{summary}</div>
        <div className={`text-[10px] font-mono ${sub}`}>{new Date(log.timestamp).toLocaleString("ja-JP")}</div>
      </div>
      <div className={`flex items-center gap-4 px-5 py-2 text-[10px] font-mono border-b ${dark ? "border-slate-800 bg-slate-950 text-slate-500" : "border-slate-100 bg-white text-slate-400"}`}>
        <span>TRACEID <span className="text-blue-400">{traceId.slice(0, 24)}...</span></span>
        {log.screenName && <span>screenId <span className={dark ? "text-slate-300" : "text-slate-700"}>{log.screenName}</span></span>}
      </div>
      <div className={`px-5 py-3 border-b ${dark ? "border-slate-800" : "border-slate-200"}`}>
        <div className={`text-[10px] font-semibold mb-2 flex items-center gap-1 ${sub}`}>📷 スクリーンショット</div>
        <div className={`rounded border overflow-hidden ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
          <div className={`px-3 py-1.5 text-[10px] font-mono border-b ${dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
            {log.screenshotPath ? log.screenshotPath.replace(/.*[\/]/, "") : "スクリーンショットなし"}
          </div>
          {screenshotUrl ? (
            <div className="relative">
              <img src={screenshotUrl} alt="スクリーンショット" className="w-full object-contain" style={{ maxHeight: 280, minHeight: 60, border: "2px solid #64748b", borderRadius: 4, display: "block" }}
                onError={e => {
                  e.currentTarget.style.display = "none";
                  const fb = e.currentTarget.nextSibling as HTMLElement;
                  if (fb) fb.style.display = "flex";
                }} />
              <div style={{ display: "none" }} className={`p-4 text-xs text-center ${sub} flex items-center justify-center`}>
                画像を読み込めませんでした<br/><span className="font-mono text-[10px] mt-1">{screenshotUrl}</span>
              </div>
            </div>
          ) : (
            <div className={`p-4 text-xs text-center ${sub}`}>スクリーンショットなし</div>
          )}
        </div>
      </div>
      <div className={`border-b ${borderCls} overflow-hidden`}>
        <div className={rowCls}><div className={labelCls}>操作内容</div><div className={valCls}>{summary}</div></div>
        <div className={rowCls}>
          <div className={labelCls}>イベント種別</div>
          <div className={valCls}>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
              log.eventType === "ERROR" ? "bg-red-100 text-red-700" :
              log.eventType === "UI_CLICK" ? "bg-purple-100 text-purple-700" :
              log.eventType === "SCREEN_LOAD" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
            }`}>{log.eventType}</span>
          </div>
        </div>
        <div className={rowCls}><div className={labelCls}>対象要素</div><div className={`${valCls} font-mono`}>{log.elementId || "—"}</div></div>
        <div className={rowCls}><div className={labelCls}>入力値</div><div className={`${valCls} font-mono`}>{inputValue !== null ? String(inputValue) : "—"}</div></div>
        <div className={rowCls}>
          <div className={labelCls}>Console</div>
          <div className={`${valCls} ${sub}`}>
            {consoleOutput
              ? <pre className="text-[10px] whitespace-pre-wrap">{typeof consoleOutput === "string" ? consoleOutput : JSON.stringify(consoleOutput, null, 2)}</pre>
              : <span className="italic">このseqでのコンソール出力なし</span>}
          </div>
        </div>
        <div className={rowCls}>
          <div className={labelCls}>判定</div>
          <div className={`${valCls} flex items-center gap-3`}>
            <button onClick={() => { setVerdict(v => v === "OK" ? "NG" : "OK"); setDirty(true); }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${verdict === "OK" ? "bg-green-500" : "bg-red-500"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${verdict === "OK" ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className={`text-sm font-bold ${verdict === "OK" ? "text-green-600" : "text-red-600"}`}>{verdict}</span>
            <button onClick={saveVerdict} disabled={saving || !dirty}
              className={`ml-auto px-3 py-1 rounded text-xs font-bold transition-colors ${
                saved ? "bg-green-600 text-white" :
                saving ? "bg-zinc-600 text-zinc-400 cursor-wait" :
                dirty ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer" :
                "bg-zinc-200 text-zinc-400 cursor-not-allowed"}`}>
              {saved ? "✅ 保存済" : saving ? "保存中..." : "更新する"}
            </button>
            <span className={`text-[10px] ${sub}`}>クリックで切替</span>
          </div>
        </div>
        {log.payload && Object.keys(log.payload).length > 0 && (
          <div className={rowCls}>
            <div className={labelCls}>ペイロード</div>
            <div className={valCls}>
              <pre className={`text-[10px] p-2 rounded overflow-x-auto ${dark ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"}`}>
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
      <div className={`border-b ${dark ? "border-slate-700" : "border-slate-200"}`}>
        <div className={rowCls} style={{ borderBottom: "none" }}>
          <div className={labelCls}>問題点課題</div>
          <div className={valCls}>
            {issues ? (
              <div className={`rounded border px-3 py-2 text-xs mb-2 ${dark ? "border-orange-800 bg-orange-900/20 text-orange-300" : "border-orange-200 bg-orange-50 text-orange-800"}`}>
                <div className="font-semibold mb-1">📌 {typeof issues === "string" ? issues : (issues as any).rule || "問題あり"}</div>
                {(issues as any).suggestion && <div className={`text-[10px] mt-1 ${sub}`}>提案: {(issues as any).suggestion}</div>}
              </div>
            ) : null}
            {verdict === "NG" && (
              <div className={`rounded border px-3 py-3 space-y-2 ${dark ? "border-red-800 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className={`text-[10px] font-semibold w-8 ${sub}`}>種別</label>
                  <select value={issueType} onChange={e => { setIssueType(e.target.value); setDirty(true); }}
                    className={`text-xs px-2 py-1 rounded border ${dark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-300"}`}>
                    {["不具合","仕様違い","改善提案","確認"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <label className={`text-[10px] font-semibold w-8 ${sub}`}>優先度</label>
                  <select value={issuePriority} onChange={e => { setIssuePriority(e.target.value); setDirty(true); }}
                    className={`text-xs px-2 py-1 rounded border ${dark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-300"}`}>
                    {["高","中","低"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <label className={`text-[10px] font-semibold w-10 ${sub}`}>対応状態</label>
                  <select value={issueStatus} onChange={e => { setIssueStatus(e.target.value); setDirty(true); }}
                    className={`text-xs px-2 py-1 rounded border ${dark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-300"}`}>
                    {["未対応","対応中","解決済","保留"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 items-start">
                  <label className={`text-[10px] font-semibold w-8 mt-1.5 flex-shrink-0 ${sub}`}>内容</label>
                  <textarea value={issueContent} onChange={e => { setIssueContent(e.target.value); setDirty(true); }}
                    placeholder="課題・問題点..." rows={2}
                    className={`flex-1 text-xs px-2 py-1 rounded border resize-none ${dark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500" : "bg-white border-slate-300 placeholder:text-slate-400"}`} />
                </div>
                <div className="flex gap-2 items-start">
                  <label className={`text-[10px] font-semibold w-8 mt-1.5 flex-shrink-0 ${sub}`}>備考</label>
                  <input value={issueMemo} onChange={e => { setIssueMemo(e.target.value); setDirty(true); }}
                    placeholder="担当者・期限など"
                    className={`flex-1 text-xs px-2 py-1 rounded border ${dark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500" : "bg-white border-slate-300 placeholder:text-slate-400"}`} />
                </div>
              </div>
            )}
            {verdict === "OK" && !issues && <span className={`text-xs italic ${sub}`}>なし</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────── TimelineView ───────────────
function TimelineView({ items, projectId, traceId, dark }: {
  items: TLItem[]; projectId: string; traceId: string; dark: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(5);
  const [containerW, setContainerW] = useState(800);
  const [visible, setVisible] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastIdx, setLastIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [patternName, setPatternName] = useState("");
  const [patternMemo, setPatternMemo] = useState("");
  const [showModal, setShowModal] = useState(false);

  const fids = Array.from(new Set(items.map(i => i.featureId)));
  const colorMap: Record<string, string> = {};
  fids.forEach((f, i) => { colorMap[f] = PALETTE[i % PALETTE.length]; });

  const visItems = visible ? items.filter(i => i.featureId === visible) : items;

  useEffect(() => {
    const calc = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setContainerW(w);
        const g = 16;
        setCols(Math.max(2, Math.floor((w + g) / (120 + g))));
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
  const openPatternModal = () => { setPatternName(""); setPatternMemo(""); setShowModal(true); };

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
        memo: patternMemo || `TraceID: ${traceId.slice(0, 8)} から登録（${selItems.length} seq）`,
      });
      setShowModal(false);
      clearSel();
      alert("✅ 作業パターンとして登録しました");
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    } finally { setSaving(false); }
  };

  const GAP = 16;
  const boxW = Math.max(80, Math.floor((containerW - GAP * (cols - 1)) / cols));

  const rows: TLItem[][] = [];
  for (let r = 0; r * cols < visItems.length; r++) {
    rows.push(visItems.slice(r * cols, (r + 1) * cols));
  }

  const selItems = items.filter(i => selected.includes(i.globalSeqNo)).sort((a, b) => a.globalSeqNo - b.globalSeqNo);
  const selFids = Array.from(new Set(selItems.map(i => i.featureId)));

  return (
    <div ref={containerRef} style={{ fontFamily: "system-ui,sans-serif" }}>
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
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>{visItems.length} seq</span>
        </div>
      </div>

      {/* 蛇行レイアウト */}
      <div>
        {rows.map((row, r) => {
          const isRtl = r % 2 === 1;
          const isLastRow = r === rows.length - 1;
          return (
            <div key={r}>
              <div style={{ display: "flex", flexDirection: isRtl ? "row-reverse" : "row", alignItems: "center", padding: "0 4px" }}>
                {row.map((item, c) => {
                  const isSelected = selected.includes(item.globalSeqNo);
                  const color = colorMap[item.featureId] || "#94a3b8";
                  const isLastInRow = c === row.length - 1;
                  return (
                    <>
                      <div key={item.globalSeqNo}
                        onClick={e => handleClick(e as any, item.globalSeqNo, r * cols + c)}
                        style={{
                          width: boxW, flexShrink: 0, borderRadius: 8,
                          border: `2px solid ${isSelected ? "#3b82f6" : color}`,
                          background: "white",
                          cursor: "pointer", fontSize: 11, userSelect: "none", overflow: "hidden",
                          boxShadow: isSelected ? "0 0 0 3px #3b82f680" : "0 1px 4px rgba(0,0,0,.10)",
                        }}>
                        {/* ヘッダー: 機能名 + seq */}
                        <div style={{ background: color, padding: "3px 7px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ color: "white", fontWeight: 700, fontSize: 10, letterSpacing: "0.3px" }}>{item.featureId.replace("MC_", "")}</span>
                          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 600 }}>seq {item.globalSeqNo}</span>
                        </div>
                        {/* スクショ */}
                        <div style={{ height: 90, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {item.imgPath
                            ? <img src={item.imgPath} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#e2e8f0", border: "1px solid #94a3b8", borderRadius: 2 }} onError={e => { (e.currentTarget.parentNode as HTMLElement).innerHTML='<span style="font-size:11px;color:#94a3b8;">No img</span>'; }} />
                            : <span style={{ fontSize: 11, color: "#94a3b8" }}>No img</span>}
                        </div>
                        {/* テキスト部 */}
                        <div style={{ padding: "4px 7px", background: item.hasNg ? "#fff5f5" : "white" }}>
                          <div style={{ color: "#334155", fontSize: 10, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.summary.replace(/^.*? — /, "").slice(0, 20)}</div>
                          <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 1 }}>{new Date(item.ts).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
                          {item.hasNg && <div style={{ color: "#dc2626", fontSize: 10, fontWeight: 700 }}>❌ NG</div>}
                        </div>
                      </div>
                      {!isLastInRow && (
                        <div style={{ width: GAP, flexShrink: 0, alignSelf: "center", position: "relative" }}>
                          <div style={{ height: 2, background: "#475569", position: "relative" }}>
                            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", ...(isRtl ? { left: -1, borderRight: "7px solid #475569" } : { right: -1, borderLeft: "7px solid #475569" }) }} />
                          </div>
                        </div>
                      )}
                    </>
                  );
                })}
              </div>
              {!isLastRow && (() => {
                // BOX均等幅: LTR末端=右端BOX中央, RTL末端=左端BOX中央
                const lineX = isRtl
                  ? Math.floor(boxW / 2)
                  : (cols - 1) * (boxW + GAP) + Math.floor(boxW / 2);
                return (
                  <div style={{ position: "relative", height: 36, overflow: "visible" }}>
                    <div style={{
                      position: "absolute",
                      left: lineX - 1.5,
                      top: 0, width: 3, height: 36,
                      background: "#475569"
                    }} />
                    <div style={{
                      position: "absolute",
                      left: lineX - 6,
                      top: 30,
                      width: 0, height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: "9px solid #475569"
                    }} />
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* 選択パネル */}
      {selected.length > 0 && (
        <div style={{ marginTop: 14, border: "2px solid #3b82f6", borderRadius: 10, background: "#eff6ff", padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>📌 選択中: {selected.length} seq</div>
            <div style={{ fontSize: 12, color: "#475569", flex: 1 }}>
              seq {selItems[0]?.globalSeqNo} ～ {selItems[selItems.length - 1]?.globalSeqNo} | {selFids.map(f => f.replace("MC_", "")).join(", ")}
            </div>
            <button onClick={clearSel} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #94a3b8", background: "white", cursor: "pointer" }}>選択解除</button>
            <button onClick={openPatternModal} style={{ fontSize: 12, fontWeight: 700, padding: "6px 16px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", cursor: "pointer" }}>
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
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>{selItems.length} seq を登録します</div>
            <input value={patternName} onChange={e => setPatternName(e.target.value)} placeholder="パターン名 *"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
            <textarea value={patternMemo} onChange={e => setPatternMemo(e.target.value)} placeholder="説明・メモ（任意）" rows={2}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, boxSizing: "border-box", marginBottom: 10, resize: "none" }} />
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 700 }}>対象画面</div>
            <div style={{ background: "#f1f5f9", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 10, color: "#334155" }}>
              {[...new Set(selItems.map(i => i.featureId))].join(", ")}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 700 }}>選択Seq</div>
            <div style={{ background: "#f1f5f9", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 12, color: "#334155", maxHeight: 80, overflowY: "auto" }}>
              {selItems.map(i => "#" + i.globalSeqNo + " " + i.summary.slice(0, 20)).join(" → ")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontSize: 13 }}>キャンセル</button>
              <button onClick={savePattern} disabled={saving || !patternName.trim()}
                style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: saving ? "#94a3b8" : "#3b82f6", color: "white", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13 }}>
                {saving ? "登録中..." : "登録する"}
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
  const { id: projectId, traceId } = useParams<{ id: string; traceId: string }>();
  const { dark, toggle } = useTheme();

  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [forceStoping, setForceStoping] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genProgress, setGenProgress] = useState<string[]>([]);
  const [genDone, setGenDone] = useState(false);
  const [genResult, setGenResult] = useState<{ events: number; size: number; url?: string } | null>(null);
  const [generateMode, setGenerateMode] = useState<"browser" | "download">("browser");
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketFeatureId, setTicketFeatureId] = useState("");
  const [ticketType, setTicketType] = useState("バグ");
  const [ticketPriority, setTicketPriority] = useState("HIGH");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSaving, setTicketSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const load = async () => {
      try {
        const [traceRes, logsRes] = await Promise.all([
          api.get(`/api/projects/${projectId}/traces/${traceId}`),
          api.get(`/api/projects/${projectId}/traces/${traceId}/logs`),
        ]);
        setTrace(traceRes.data);
        setLogs(logsRes.data);
        try { const pr = await api.get(`/api/projects/${projectId}`); setProject(pr.data); } catch {}
      } catch { router.push("/login"); }
      finally { setLoading(false); }
    };
    load();
  }, [projectId, traceId]);

  const forceStop = async () => {
    setForceStoping(true);
    try {
      await api.post(`/api/projects/${projectId}/traces/${traceId}/stop`);
      const res = await api.get(`/api/projects/${projectId}/traces/${traceId}`);
      setTrace(res.data);
    } catch (e: any) { alert(`失敗: ${e.response?.data?.message || e.message}`); }
    finally { setForceStoping(false); }
  };

  const openGenerateModal = () => { setGenProgress([]); setGenDone(false); setGenResult(null); setShowGenerateModal(true); };

  const executeGenerate = async () => {
    setGenProgress(["ログデータを取得中..."]);
    try {
      setGenProgress(p => [...p, "HTMLレビューを生成中..."]);
      const res = await api.post(`/api/projects/${projectId}/traces/${traceId}/generate-review`, {}, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      setGenProgress(p => [...p, "生成完了"]);
      setGenResult({ events: logs.length, size: Math.round(blob.size / 1024), url });
      setGenDone(true);
    } catch (e: any) {
      alert(`生成失敗: ${e.response?.data?.message || e.message}`);
      setGenProgress([]);
    }
  };

  const openResult = () => {
    if (!genResult?.url) return;
    if (generateMode === "browser") { window.open(genResult.url, "_blank"); }
    else { const a = document.createElement("a"); a.href = genResult.url; a.download = `review_${traceId.slice(0, 8)}.html`; a.click(); }
  };

  const saveTicket = async () => {
    if (!ticketTitle.trim()) return;
    setTicketSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/issues`, {
        title: ticketTitle, type: ticketType, priority: ticketPriority,
        description: ticketDesc, featureId: ticketFeatureId || undefined,
      });
      setShowTicketModal(false); setTicketTitle(""); setTicketFeatureId(""); setTicketDesc("");
      alert("✅ チケットを発行しました");
    } catch (e: any) { alert(`失敗: ${e.response?.data?.message || e.message}`); }
    finally { setTicketSaving(false); }
  };

  const tlItems: TLItem[] = logs.map((log, idx) => ({
    idx, globalSeqNo: idx + 1,
    featureId: log.screenName || "UNKNOWN",
    summary: log.elementId ? `${log.screenName} — ${log.elementId}` : (log.screenName || log.eventType),
    ts: log.timestamp,
    hasNg: log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && (log.eventType === "ERROR" || log.payload?.result === "NG")),
    imgPath: (() => {
      const sp = log.screenshotPath;
      if (!sp) return null;
      const mLogs = sp.match(/logs[\/\\]screenshots[\/\\](.+)/);
      if (mLogs) return "http://192.168.1.11:3099/logs-screenshots/" + mLogs[1].replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/");
      const mSs = sp.match(/screenshots[\/\\](.+)/);
      if (mSs) return "http://192.168.1.11:3099/screenshots/" + mSs[1].replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/");
      return null;
    })(), eventType: log.eventType, log,
  }));

  const bg   = dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900";
  const hdr  = dark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200";
  const meta = dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200";
  const sub  = dark ? "text-slate-400" : "text-slate-500";
  const tl   = dark ? "border-slate-800 hover:bg-slate-800/60" : "border-slate-100 hover:bg-slate-50";
  const tlA  = dark ? "bg-blue-900/30 border-l-2 border-l-blue-500" : "bg-blue-50 border-l-2 border-l-blue-500";

  const screenCount = logs.filter(l => l.eventType === "SCREEN_LOAD").length;
  const clickCount  = logs.filter(l => l.eventType === "UI_CLICK").length;
  const errorCount  = logs.filter(l => l.eventType === "ERROR").length;

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
            {[
              { label: "📋 トレース一覧", path: "traces", active: true },
              { label: "📊 パターン", path: "patterns" },
              { label: "🎫 チケット", path: "issues" },
              { label: "🔑 APIキー", path: "apikeys" },
            ].map(item => (
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
          <div className={`w-1/2 border-r overflow-y-auto ${dark ? "border-slate-800" : "border-slate-200"}`}>
            {logs.length === 0 ? (
              <div className={`text-center py-12 text-sm ${sub}`}>ログがありません</div>
            ) : (
              logs.map(log => {
                const style = EVENT_STYLE[log.eventType] || { icon: "•", color: "text-slate-400", bg: "bg-slate-700/60" };
                const isActive = selectedLog?.id === log.id;
                return (
                  <button key={log.id} onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors ${tl}`}
                    style={{
                      background: isActive ? (dark ? "#1e3a5f" : "#eff6ff") : (log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && log.eventType === "ERROR")) ? (dark ? "rgba(153,27,27,0.15)" : "#fff5f5") : "",
                      boxShadow: isActive ? `inset 0 0 0 2px #3b82f6` : "",
                      borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                    }}>
                    {/* seqNo */}
                    <div className="flex-shrink-0 w-6 text-center">
                      <div className={`text-[10px] font-bold rounded ${dark ? "text-slate-500" : "text-slate-400"}`}>{logs.indexOf(log) + 1}</div>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5 ${style.bg}`}>{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${style.color}`}>{log.eventType}</span>
                        <span className={`text-[10px] ${sub}`}>{fmtTJ(log.timestamp)}</span>
                        {log.screenshotPath && <span className="text-[10px] text-slate-500">📷</span>}
                      </div>
                      {log.screenName && <div className={`text-xs mt-0.5 truncate font-medium ${dark ? "text-slate-300" : "text-slate-700"}`}>{log.screenName}{log.elementId ? <span className={`font-normal ${sub}`}> #{log.elementId}</span> : null}</div>}
                      {/* NG内容インライン表示 */}
                      {log.verdict?.verdict === "NG" && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {log.verdict.issueType && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{background:"#dc2626",color:"white",fontWeight:700}}>{log.verdict.issueType}</span>}
                          {log.verdict.priority && <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-400 text-red-400">{log.verdict.priority}</span>}
                          {log.verdict.status && <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{borderColor:"#64748b",color:dark?"#94a3b8":"#64748b"}}>{log.verdict.status}</span>}
                          <span className={`text-[10px] ${dark ? "text-red-300" : "text-red-600"}`}>{(log.verdict.content || "").slice(0, 30)}{(log.verdict.content || "").length > 30 ? "…" : ""}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="w-1/2 overflow-y-auto">
            <div className={`px-4 py-2 text-xs font-semibold border-b sticky top-0 z-10 ${dark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>選択イベント詳細</div>
            {!selectedLog ? (
              <div className={`text-center py-16 text-sm ${sub}`}>← イベントをクリックしてください</div>
            ) : (
              <ActionReviewDetail
                log={selectedLog}
                seqNo={logs.indexOf(selectedLog) + 1}
                dark={dark}
                traceId={traceId}
                projectId={projectId}
                onVerdictSaved={(logId, verdictData) => {
                  setLogs(prev => prev.map(l => l.id === logId ? { ...l, verdict: verdictData } : l));
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <TimelineView items={tlItems} projectId={projectId} traceId={traceId} dark={dark} />
        </div>
      )}

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