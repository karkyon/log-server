#!/usr/bin/env python3
"""
patterns/page.tsx を正しい内容で直接書き込む
"""
from pathlib import Path
import shutil

TARGET = Path.home() / "projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"
shutil.copy(TARGET, TARGET.with_suffix(".tsx.bak_write"))

content = r'''"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { ProjectNav } from "@/components/ProjectNav";
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

const EMPTY_FORM = { name: "", screenMode: "", seqData: "{}", memo: "" };

// ─────────────── PatternSerpentine ───────────────
function PatternSerpentine({ ptSeqs, patternLogs, patternSelectedLog, setPatternSelectedLog, setPatternViewMode, dark, subtext }: {
  ptSeqs: any[];
  patternLogs: any[];
  patternSelectedLog: any;
  setPatternSelectedLog: (v: any) => void;
  setPatternViewMode: (v: "list" | "timeline" | "seq") => void;
  dark: boolean;
  subtext: string;
}) {
  const contRef = React.useRef<HTMLDivElement>(null);
  const [cols, setCols] = React.useState(4);
  const [containerW, setContainerW] = React.useState(800);

  React.useEffect(() => {
    const calc = () => {
      if (contRef.current) {
        const w = contRef.current.offsetWidth;
        setContainerW(w);
        const g = 12;
        setCols(Math.max(2, Math.floor((w + g) / (130 + g))));
      }
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (contRef.current) ro.observe(contRef.current);
    return () => ro.disconnect();
  }, []);

  if (ptSeqs.length === 0) {
    return <div className={`text-center py-8 text-sm ${subtext}`}>seqデータなし</div>;
  }

  const GAP = 12;
  const boxW = Math.max(80, Math.floor((containerW - GAP * (cols - 1)) / cols));
  const ptRows: any[][] = [];
  for (let r = 0; r * cols < ptSeqs.length; r++) {
    ptRows.push(ptSeqs.slice(r * cols, (r + 1) * cols));
  }

  return (
    <div ref={contRef} style={{ width: "100%" }}>
      {ptRows.map((ptRow, pr) => {
        const ptRtl = pr % 2 === 1;
        const ptLast = pr === ptRows.length - 1;
        const lineX = ptRtl
          ? Math.floor(boxW / 2)
          : (cols - 1) * (boxW + GAP) + Math.floor(boxW / 2);
        return (
          <div key={pr}>
            <div style={{ display: "flex", flexDirection: ptRtl ? "row-reverse" : "row", alignItems: "stretch" }}>
              {ptRow.map((seq: any, pc: number) => {
                const pidx = pr * cols + pc;
                const plog = patternLogs[pidx];
                const ptLIR = pc === ptRow.length - 1;
                const pcol = (seq.featureId||"").includes("MACHINING") ? "#8b5cf6"
                  : (seq.featureId||"").includes("PRODUCTS") ? "#3b82f6" : "#64748b";
                const psp: string | null = plog?.screenshotPath ?? null;
                const pimg = (() => {
                  if (!psp) return null;
                  const pmOld = psp.match(/logs[/\\]screenshots[/\\](.+)/);
                  if (pmOld) return "http://192.168.1.11:3099/logs-screenshots/" + pmOld[1].replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
                  const pmNew = psp.match(/screenshots[/\\]([^/\\]+\.(?:png|jpg|jpeg))/i);
                  if (pmNew) return "http://192.168.1.11:3099/screenshots/" + encodeURIComponent(pmNew[1]);
                  const pmFile = psp.match(/([^/\\]+\.(?:png|jpg|jpeg))$/i);
                  if (pmFile) return "http://192.168.1.11:3099/screenshots/" + encodeURIComponent(pmFile[1]);
                  return null;
                })();
                const pAct = patternSelectedLog?.id === plog?.id;
                return (
                  <React.Fragment key={pidx}>
                    <div
                      onClick={() => { setPatternSelectedLog(plog || null); setPatternViewMode("list"); }}
                      className="cursor-pointer rounded-lg overflow-hidden"
                      style={{
                        width: boxW, flexShrink: 0,
                        border: `2px solid ${pAct ? "#3b82f6" : pcol}`,
                        boxShadow: pAct ? "0 0 0 3px #3b82f680" : "0 1px 4px rgba(0,0,0,.1)"
                      }}>
                      <div style={{ background: pcol, padding: "3px 7px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "white", fontWeight: 700, fontSize: 10 }}>{(seq.featureId||"").replace("MC_","")}</span>
                        <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 10 }}>seq {seq.seqNo||seq.seq||pidx+1}</span>
                      </div>
                      <div style={{ height: 70, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {pimg
                          ? <img src={pimg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={e => { (e.currentTarget.parentNode as HTMLElement).innerHTML = '<span style="font-size:10px;color:#94a3b8">No img</span>'; }} />
                          : <span style={{ fontSize: 10, color: "#94a3b8" }}>No img</span>}
                      </div>
                      <div style={{ padding: "4px 7px", background: "white" }}>
                        <div style={{ fontSize: 10, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {seq.summary?.slice(0, 20) || "—"}
                        </div>
                      </div>
                    </div>
                    {!ptLIR && (
                      <div style={{ width: GAP, flexShrink: 0, alignSelf: "center", position: "relative" }}>
                        <div style={{ height: 2, background: "#475569", position: "relative" }}>
                          <div style={{
                            position: "absolute", top: "50%", transform: "translateY(-50%)",
                            width: 0, height: 0,
                            borderTop: "4px solid transparent",
                            borderBottom: "4px solid transparent",
                            ...(ptRtl ? { left: -1, borderRight: "6px solid #475569" } : { right: -1, borderLeft: "6px solid #475569" })
                          }} />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {!ptLast && (
              <div style={{ position: "relative", height: 36, overflow: "visible" }}>
                <div style={{ position: "absolute", left: lineX - 1.5, top: 0, width: 3, height: 36, background: "#475569" }} />
                <div style={{ position: "absolute", left: lineX - 6, top: 28, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "9px solid #475569" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────── PatternIssueModal ───────────────
function PatternIssueModal({ pattern, projectId, dark, onClose }: {
  pattern: Pattern; projectId: string; dark: boolean; onClose: () => void;
}) {
  const [issueForm, setIssueForm] = useState({
    title: `パターン「${pattern.name}」に関する課題`,
    type: "バグ", priority: "MEDIUM", description: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const bdr = dark ? "1px solid #334155" : "1px solid #e2e8f0";
  const bg  = dark ? "#0f172a" : "#fff";
  const sub = dark ? "#64748b" : "#94a3b8";

  const submit = async () => {
    if (!issueForm.title.trim()) { alert("タイトルを入力してください"); return; }
    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/issues`, {
        featureId:   pattern.screenMode || pattern.name,
        title:       issueForm.title.trim(),
        type:        issueForm.type,
        priority:    issueForm.priority,
        status:      "未対応",
        description: issueForm.description.trim(),
      });
      onClose();
      alert("✅ チケットを発行しました");
    } catch (e: any) {
      alert("発行失敗: " + (e?.response?.data?.message || e.message));
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: bg, border: bdr, borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.28)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: bdr, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>🎫 チケット発行</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>
            パターン: {pattern.name}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: sub }}>✕</button>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6 }}>種別</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([["バグ","#dc2626"],["改善","#2563eb"],["確認","#7c3aed"]] as [string,string][]).map(([t,c]) => (
                <button key={t} onClick={() => setIssueForm(f => ({...f, type: t}))}
                  style={{ padding: "3px 10px", borderRadius: 99, border: "none", fontSize: 11, cursor: "pointer",
                    background: issueForm.type === t ? c : (dark ? "#1e293b" : "#f1f5f9"),
                    color: issueForm.type === t ? "#fff" : sub, fontWeight: issueForm.type === t ? 700 : 400 }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4 }}>タイトル</div>
            <input value={issueForm.title} onChange={e => setIssueForm(f => ({...f, title: e.target.value}))}
              style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 6, border: bdr,
                background: dark ? "#1e293b" : "#f8fafc", color: dark ? "#e2e8f0" : "#1e293b", fontFamily: "inherit" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4 }}>優先度</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([["HIGH","#dc2626"],["MEDIUM","#d97706"],["LOW","#64748b"]] as [string,string][]).map(([p,c]) => (
                <button key={p} onClick={() => setIssueForm(f => ({...f, priority: p}))}
                  style={{ padding: "3px 10px", borderRadius: 99, border: "none", fontSize: 11, cursor: "pointer",
                    background: issueForm.priority === p ? c : (dark ? "#1e293b" : "#f1f5f9"),
                    color: issueForm.priority === p ? "#fff" : sub, fontWeight: issueForm.priority === p ? 700 : 400 }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4 }}>内容</div>
            <textarea value={issueForm.description} onChange={e => setIssueForm(f => ({...f, description: e.target.value}))}
              rows={3} placeholder="課題の詳細..."
              style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 6, border: bdr,
                background: dark ? "#1e293b" : "#f8fafc", color: dark ? "#e2e8f0" : "#1e293b",
                fontFamily: "inherit", resize: "vertical" }} />
          </div>
        </div>
        <div style={{ padding: "10px 16px", borderTop: bdr, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}
            style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: bdr,
              background: "transparent", color: sub, cursor: "pointer" }}>
            キャンセル
          </button>
          <button onClick={submit} disabled={submitting}
            style={{ fontSize: 12, padding: "5px 16px", borderRadius: 6, border: "none",
              background: submitting ? "#94a3b8" : "#2563eb", color: "#fff",
              fontWeight: 600, cursor: submitting ? "wait" : "pointer" }}>
            {submitting ? "発行中..." : "発行する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── PatternsPage ───────────────
export default function PatternsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark } = useTheme();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Pattern | null>(null);
  const [patternLogs, setPatternLogs] = useState<any[]>([]);
  const [patternTrace, setPatternTrace] = useState<any>(null);
  const [patternSelectedLog, setPatternSelectedLog] = useState<any>(null);
  const [patternViewMode, setPatternViewMode] = useState<"list" | "timeline" | "seq">("list");
  const [patternListOpen, setPatternListOpen] = useState(true);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternIssueModal, setPatternIssueModal] = useState<Pattern | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchPatterns();
  }, [id]);

  const loadPatternLogs = async (pattern: Pattern) => {
    const seqs: any[] = pattern.seqData?.seqs ?? [];
    const traceId = seqs[0]?.traceId ?? pattern.seqData?.traceId ?? null;
    if (!traceId) { setPatternLogs([]); setPatternTrace(null); return; }
    setPatternLoading(true);
    try {
      const [logsRes, traceRes] = await Promise.all([
        api.get(`/api/projects/${id}/traces/${traceId}/logs`),
        api.get(`/api/projects/${id}/traces/${traceId}`),
      ]);
      const seqNos = new Set(seqs.map((s: any) => s.seqNo ?? s.seq));
      const allLogs: any[] = logsRes.data;
      setPatternLogs(seqNos.size > 0 ? allLogs.filter((_: any, i: number) => seqNos.has(i + 1)) : allLogs);
      setPatternTrace(traceRes.data);
      setPatternSelectedLog(null);
    } catch { setPatternLogs([]); }
    finally { setPatternLoading(false); }
  };

  const deletePattern = async (patternId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このパターンを削除しますか？")) return;
    try {
      await api.delete(`/api/projects/${id}/patterns/${patternId}`);
      if (selected?.id === patternId) { setSelected(null); setPatternLogs([]); }
      fetchPatterns();
    } catch (e: any) { alert(`削除失敗: ${(e as any).response?.data?.message || (e as any).message}`); }
  };

  const fetchPatterns = () => {
    setLoading(true);
    api.get(`/api/projects/${id}/patterns`)
      .then(r => setPatterns(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleSeqDataChange = (val: string) => {
    setForm(f => ({ ...f, seqData: val }));
    try { JSON.parse(val); setJsonError(""); }
    catch { setJsonError("JSON形式が正しくありません"); }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    if (jsonError) return;
    let parsedSeq: any;
    try { parsedSeq = JSON.parse(form.seqData); }
    catch { setJsonError("JSON形式が正しくありません"); return; }
    setSubmitting(true);
    try {
      await api.post(`/api/projects/${id}/patterns`, {
        name:       form.name.trim(),
        screenMode: form.screenMode.trim() || undefined,
        seqData:    parsedSeq,
        memo:       form.memo.trim() || undefined,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchPatterns();
    } catch {
      alert("パターン登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const bg       = dark ? "bg-gray-950" : "bg-gray-50";
  const text     = dark ? "text-white" : "text-gray-900";
  const subtext  = dark ? "text-gray-400" : "text-gray-500";
  const cardBg   = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const hoverBg  = dark ? "hover:border-blue-600" : "hover:border-blue-400";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;
  const modalBg  = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <ProjectNav projectId={id} />

      <main className="px-6 py-6 flex gap-4" style={{ height: "calc(100vh - 90px)", overflow: "hidden" }}>
        {/* 左: パターン一覧 */}
        <div style={{ width: patternListOpen ? 360 : 44, minWidth: patternListOpen ? 360 : 44, maxWidth: patternListOpen ? 360 : 44, flexShrink: 0, transition: "width 0.2s", overflowX: "hidden", overflowY: "auto" }}>
          <div className="flex items-center justify-between mb-3">
            {patternListOpen && <h2 className="font-semibold text-sm">パターン一覧 ({patterns.length})</h2>}
            <button onClick={() => setPatternListOpen(v => !v)}
              className={`ml-auto text-xs px-2 py-1 rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
              title={patternListOpen ? "折りたたむ" : "開く"}>
              {patternListOpen ? "◀" : "▶"}
            </button>
          </div>

          {loading ? <p className={subtext}>読み込み中...</p> : patterns.length === 0 ? (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
              <p>パターンがありません</p>
              <button onClick={() => { setForm(EMPTY_FORM); setJsonError(""); setShowModal(true); }}
                className="mt-3 text-blue-500 text-sm hover:underline">+ 最初のパターンを登録</button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ width: "100%", minWidth: 0 }}>
              {patterns.map(p => (
                <div key={p.id} onClick={() => { setSelected(p); loadPatternLogs(p); }}
                  className={`${cardBg} ${hoverBg} border rounded-xl p-4 cursor-pointer transition ${selected?.id === p.id ? "border-blue-500" : ""}`}
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", minWidth: 0 }}>
                  <div style={{ position: "relative", paddingRight: 60 }}>
                    <h3 style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className={text}>{p.name}</h3>
                    {p.screenMode && <p className={`text-xs ${subtext} mt-1`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.screenMode}</p>}
                    {p.memo && <p className={`text-xs ${subtext} mt-1`} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.memo}</p>}
                    <button
                      onClick={e => { e.stopPropagation(); setPatternIssueModal(p); }}
                      title="チケット発行"
                      style={{ position: "absolute", top: 0, right: 28, background: "#1d4ed8", color: "white", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer", lineHeight: 1 }}>
                      🎫
                    </button>
                    <button
                      onClick={e => deletePattern(p.id, e)}
                      title="削除"
                      style={{ position: "absolute", top: 0, right: 0, background: "#b91c1c", color: "white", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer", lineHeight: 1 }}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: パターン詳細 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selected ? (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext} flex-1`}>パターンを選択してください</div>
          ) : (
            <>
              <div className={`flex items-center gap-3 mb-3 pb-3 border-b ${dark ? "border-gray-800" : "border-gray-200"}`}>
                <h3 className="font-semibold">{selected.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] || "bg-gray-100 text-gray-600"}`}>{selected.status}</span>
                {selected.screenMode && <span className={`text-xs ${subtext}`}>{selected.screenMode.split(",").map((s: string) => s.replace("MC_","")).join(" / ")}</span>}
              </div>

              <div className={`flex gap-0 border-b mb-3 ${dark ? "border-gray-800" : "border-gray-200"}`}>
                {([{id:"list",label:"📋 リスト"},{id:"timeline",label:"📊 タイムライン"},{id:"seq",label:"📄 JSON"}] as {id:"list"|"timeline"|"seq", label:string}[]).map(tab => (
                  <button key={tab.id} onClick={() => setPatternViewMode(tab.id)}
                    className={`px-4 py-2 text-xs font-medium border-b-2 transition ${patternViewMode === tab.id ? "border-blue-500 text-blue-500" : `border-transparent ${subtext}`}`}>
                    {tab.label}
                  </button>
                ))}
                <span className={`ml-auto text-xs ${subtext} pb-2`}>{(selected.seqData?.seqs ?? []).length} seq</span>
              </div>

              {patternLoading ? (
                <div className={`text-center py-8 text-sm ${subtext}`}>読み込み中...</div>
              ) : patternViewMode === "seq" ? (
                <div className="flex-1 overflow-auto">
                  <pre className={`text-xs ${subtext} whitespace-pre-wrap p-4 border rounded-xl ${cardBg}`}>{JSON.stringify(selected.seqData, null, 2)}</pre>
                </div>
              ) : patternViewMode === "list" ? (
                <div className="flex flex-1 overflow-hidden gap-3">
                  <div className={`w-1/2 border rounded-xl overflow-y-auto ${dark ? "border-gray-800" : "border-gray-200"}`}>
                    {patternLogs.length === 0 ? (
                      <div className={`text-center py-8 text-sm ${subtext}`}>ログデータなし（traceId未設定）</div>
                    ) : patternLogs.map((log: any, i: number) => {
                      const isAct = patternSelectedLog?.id === log.id;
                      const isNg  = log.verdict?.verdict === "NG" || log.eventType === "ERROR";
                      const evColor = log.eventType === "ERROR" ? "text-red-400" : log.eventType === "SCREEN_LOAD" ? "text-blue-400" : "text-purple-400";
                      return (
                        <button key={log.id} onClick={() => setPatternSelectedLog(log)}
                          className={`w-full text-left px-3 py-2 border-b text-xs transition ${dark ? "border-gray-800 hover:bg-gray-800" : "border-gray-100 hover:bg-gray-50"}`}
                          style={{
                            background: isAct ? (dark ? "#1e3a5f" : "#eff6ff") : isNg ? (dark ? "rgba(153,27,27,0.15)" : "#fff5f5") : "",
                            borderLeft: isAct ? "3px solid #3b82f6" : "3px solid transparent",
                          }}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold ${dark ? "text-gray-500" : "text-gray-400"}`}>{i+1}</span>
                            <span className={`text-[10px] font-bold ${evColor}`}>{log.eventType}</span>
                            <span className={`text-[10px] ${subtext}`}>{new Date(log.timestamp).toLocaleTimeString("ja-JP")}</span>
                          </div>
                          {log.screenName && (
                            <div className={`text-xs mt-0.5 ${dark ? "text-gray-300" : "text-gray-700"}`}>
                              {log.screenName}{log.elementId ? <span className={subtext}> #{log.elementId}</span> : null}
                            </div>
                          )}
                          {log.verdict?.verdict === "NG" && (
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {log.verdict.issueType && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: "#dc2626", color: "white", fontWeight: 700 }}>{log.verdict.issueType}</span>}
                              {log.verdict.content && <span className={`text-[10px] ${dark ? "text-red-300" : "text-red-600"}`}>{log.verdict.content.slice(0,30)}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className={`w-1/2 border rounded-xl overflow-y-auto ${dark ? "border-gray-800" : "border-gray-200"}`}>
                    <div className={`px-3 py-2 text-xs font-semibold border-b sticky top-0 ${dark ? "bg-gray-900 border-gray-800 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-500"}`}>選択イベント詳細</div>
                    {!patternSelectedLog ? (
                      <div className={`text-center py-12 text-sm ${subtext}`}>← イベントを選択</div>
                    ) : (
                      <div className="p-3 text-xs space-y-2">
                        <div className="flex gap-2 items-baseline">
                          <span className={`text-lg font-bold ${dark ? "text-white" : "text-gray-900"}`}>{patternLogs.indexOf(patternSelectedLog)+1}</span>
                          <span className={`font-semibold ${dark ? "text-gray-200" : "text-gray-800"}`}>
                            {patternSelectedLog.screenName}{patternSelectedLog.elementId ? ` — ${patternSelectedLog.elementId}` : ""}
                          </span>
                        </div>
                        <div className={`text-[10px] font-mono ${subtext}`}>{new Date(patternSelectedLog.timestamp).toLocaleString("ja-JP")}</div>
                        {patternSelectedLog.screenshotPath && (() => {
                          const sp: string = patternSelectedLog.screenshotPath;
                          const m = sp.match(/logs[/\\]screenshots[/\\](.+)/);
                          const url = m ? "http://192.168.1.11:3099/logs-screenshots/" + m[1].replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/") : null;
                          return url ? <img src={url} alt="" className="w-full rounded border" style={{ maxHeight: 180, objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null;
                        })()}
                        <div className={`space-y-1 pt-2 border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>
                          <div className="flex gap-2"><span className={`${subtext} w-20 flex-shrink-0`}>イベント</span><span className={`font-bold ${patternSelectedLog.eventType === "ERROR" ? "text-red-400" : "text-blue-400"}`}>{patternSelectedLog.eventType}</span></div>
                          <div className="flex gap-2"><span className={`${subtext} w-20 flex-shrink-0`}>画面</span><span>{patternSelectedLog.screenName || "—"}</span></div>
                          {patternSelectedLog.elementId && <div className="flex gap-2"><span className={`${subtext} w-20 flex-shrink-0`}>要素</span><span>#{patternSelectedLog.elementId}</span></div>}
                          {patternSelectedLog.verdict?.verdict === "NG" && (
                            <div className={`p-2 rounded mt-1 ${dark ? "bg-red-900/20" : "bg-red-50"}`}>
                              <div className="font-bold text-red-400 mb-1">❌ NG判定</div>
                              {patternSelectedLog.verdict.issueType && <div>{patternSelectedLog.verdict.issueType} / {patternSelectedLog.verdict.priority} / {patternSelectedLog.verdict.status}</div>}
                              {patternSelectedLog.verdict.content && <div className="mt-0.5">{patternSelectedLog.verdict.content}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-2">
                  <PatternSerpentine
                    ptSeqs={selected.seqData?.seqs ?? []}
                    patternLogs={patternLogs}
                    patternSelectedLog={patternSelectedLog}
                    setPatternSelectedLog={setPatternSelectedLog}
                    setPatternViewMode={setPatternViewMode}
                    dark={dark}
                    subtext={subtext}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* パターン登録モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${modalBg} border rounded-xl p-6 w-full max-w-lg shadow-xl`}>
            <h2 className={`text-lg font-bold mb-5 ${text}`}>パターン登録</h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>パターン名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="例: 製品検索→詳細確認フロー" />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>画面モード（任意）</label>
                <input type="text" value={form.screenMode} onChange={e => setForm(f => ({ ...f, screenMode: e.target.value }))}
                  className={inputCls} placeholder="例: MC_PRODUCTS_LIST" />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>シーケンスデータ（JSON）<span className="text-red-500">*</span></label>
                <textarea rows={5} value={form.seqData} onChange={e => handleSeqDataChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const s = ta.selectionStart, end = ta.selectionEnd;
                      ta.value = ta.value.substring(0, s) + "  " + ta.value.substring(end);
                      ta.selectionStart = ta.selectionEnd = s + 2;
                      handleSeqDataChange(ta.value);
                    }
                  }}
                  className={`${inputCls} font-mono resize-none`}
                  placeholder='{"steps": [{"action": "click", "target": "btn_search"}]}' />
                {jsonError && <p className="text-red-500 text-xs mt-1">{jsonError}</p>}
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>メモ（任意）</label>
                <textarea rows={2} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  className={`${inputCls} resize-none`} placeholder="このパターンについての補足説明" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className={`px-4 py-2 rounded-lg text-sm ${dark ? "bg-gray-700 hover:bg-gray-600 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={submitting || !form.name.trim() || !!jsonError}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {submitting ? "登録中..." : "登録する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* チケット発行モーダル */}
      {patternIssueModal && (
        <PatternIssueModal
          pattern={patternIssueModal}
          projectId={id}
          dark={dark}
          onClose={() => setPatternIssueModal(null)}
        />
      )}
    </div>
  );
}
'''

TARGET.write_text(content)
print(f"✅ {TARGET} に書き込み完了 ({len(content.splitlines())} 行)")
