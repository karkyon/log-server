"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ProjectNav } from "@/components/ProjectNav";
import { useTheme } from "@/lib/useTheme";

type Issue = {
  id: string; title: string; type: string; priority: string; status: string;
  featureId: string; traceId?: string; description?: string;
  createdAt: string; updatedAt: string;
};

const STATUS_LIST = ["未対応", "対応中", "解決済", "保留"] as const;
const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  "未対応": { bg: "#fee2e2", text: "#dc2626", dot: "#dc2626" },
  "対応中": { bg: "#fef3c7", text: "#d97706", dot: "#d97706" },
  "解決済": { bg: "#dcfce7", text: "#16a34a", dot: "#16a34a" },
  "保留":   { bg: "#e0e7ff", text: "#4f46e5", dot: "#4f46e5" },
};
const PRI_STYLE: Record<string, { bg: string; text: string }> = {
  "HIGH":   { bg: "#fee2e2", text: "#dc2626" },
  "MEDIUM": { bg: "#fef3c7", text: "#d97706" },
  "LOW":    { bg: "#f1f5f9", text: "#64748b" },
};
const TYPE_LABEL: Record<string, string> = {
  "バグ": "🐛", "改善": "💡", "確認": "❓",
};

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const s = STATUS_STYLE[status] || { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
      padding: small ? "2px 7px" : "3px 9px", borderRadius: 99,
      background: s.bg, color: s.text, fontSize: small ? 10 : 11, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ── チケット詳細モーダル ─────────────────────────────────────────
function IssueDetailModal({ issue, projectId, dark, onClose, onUpdated, onDeleted }: {
  issue: Issue; projectId: string; dark: boolean;
  onClose: () => void; onUpdated: (updated: Issue) => void; onDeleted: (id: string) => void;
}) {
  const [status,      setStatus]      = useState(issue.status);
  const [title,       setTitle]       = useState(issue.title);
  const [description, setDescription] = useState(issue.description || "");
  const [saving,      setSaving]      = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const router = useRouter();

  const bdr = dark ? "1px solid #334155" : "1px solid #e2e8f0";
  const bg  = dark ? "#0f172a" : "#fff";
  const sub = dark ? "#64748b" : "#94a3b8";
  const inputCls = {
    width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 6,
    border: dark ? "1px solid #334155" : "1px solid #e2e8f0",
    background: dark ? "#1e293b" : "#f8fafc",
    color: dark ? "#e2e8f0" : "#1e293b",
    fontFamily: "inherit",
  } as React.CSSProperties;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/api/projects/${projectId}/issues/${issue.id}`,
        { status, title, description });
      onUpdated(res.data);
      setDirty(false);
    } catch (e: any) {
      alert("更新失敗: " + (e?.response?.data?.message || e.message));
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!confirm(`「${issue.title}」を削除しますか？`)) return;
    try {
      await api.delete(`/api/projects/${projectId}/issues/${issue.id}`);
      onDeleted(issue.id);
      onClose();
    } catch (e: any) { alert("削除失敗: " + (e?.response?.data?.message || e.message)); }
  };

  const pri = PRI_STYLE[issue.priority] || PRI_STYLE["LOW"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: bg, border: bdr, borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.28)", overflow: "hidden" }}>

        {/* ヘッダー */}
        <div style={{ padding: "12px 16px", borderBottom: bdr, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{TYPE_LABEL[issue.type] || "🎫"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {issue.title}
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: pri.bg, color: pri.text, fontWeight: 700 }}>
            {issue.priority}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: sub, lineHeight: 1 }}>✕</button>
        </div>

        {/* コンテンツ */}
        <div style={{ overflowY: "auto", flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ステータス */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>ステータス</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUS_LIST.map(s => {
                const st = STATUS_STYLE[s];
                const isActive = status === s;
                return (
                  <button key={s} onClick={() => { setStatus(s); setDirty(true); }}
                    style={{ padding: "5px 14px", borderRadius: 99, border: isActive ? "2px solid " + st.dot : "1.5px solid #e2e8f0",
                      background: isActive ? st.bg : "transparent", color: isActive ? st.text : sub,
                      fontWeight: isActive ? 700 : 400, fontSize: 12, cursor: "pointer", transition: "all 0.1s" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* タイトル */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>タイトル</div>
            <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
              style={inputCls} />
          </div>

          {/* 内容・再現手順 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>内容・再現手順</div>
            <textarea value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }}
              rows={4} placeholder="内容・再現手順・対応メモなど..."
              style={{ ...inputCls, resize: "vertical" }} />
          </div>

          {/* メタ情報 */}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: dark ? "#1e293b" : "#f8fafc", border: bdr, fontSize: 11 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
              {[
                ["種別",    issue.type],
                ["優先度",  issue.priority],
                ["画面ID",  issue.featureId],
                ["作成日",  new Date(issue.createdAt).toLocaleDateString("ja-JP")],
                ["更新日",  new Date(issue.updatedAt).toLocaleDateString("ja-JP")],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: sub, minWidth: 48 }}>{k}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                </div>
              ))}
              {issue.traceId && (
                <div style={{ gridColumn: "1/-1", display: "flex", gap: 6 }}>
                  <span style={{ color: sub, minWidth: 48 }}>Trace</span>
                  <button onClick={() => router.push(`/projects/${projectId}/traces/${issue.traceId}`)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: 11, fontFamily: "monospace", padding: 0, textDecoration: "underline" }}>
                    {issue.traceId.slice(0, 16)}...
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div style={{ padding: "10px 16px", borderTop: bdr, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={del}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #fecaca", background: dark ? "rgba(220,38,38,0.1)" : "#fff5f5", color: "#dc2626", cursor: "pointer" }}>
            削除
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: bdr, background: "transparent", color: sub, cursor: "pointer" }}>
            閉じる
          </button>
          <button onClick={save} disabled={!dirty || saving}
            style={{ fontSize: 12, padding: "5px 16px", borderRadius: 6, border: "none",
              background: dirty ? "#2563eb" : "#94a3b8", color: "#fff", fontWeight: 600,
              cursor: dirty ? "pointer" : "not-allowed", opacity: saving ? 0.7 : 1 }}>
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────────
export default function IssuesPage() {
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();
  const [issues,   setIssues]   = useState<Issue[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("ALL");
  const [selected, setSelected] = useState<Issue | null>(null);

  const bg      = dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900";
  const card    = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const sub     = dark ? "text-slate-400" : "text-slate-500";
  const tabAct  = dark ? "bg-slate-700 text-white" : "bg-white text-slate-900 shadow";
  const tabIn   = dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700";

  const load = useCallback(async () => {
    try { setIssues((await api.get(`/api/projects/${id}/issues`)).data); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "ALL" ? issues : issues.filter(i => i.status === filter);

  const count = (s: string) => s === "ALL" ? issues.length : issues.filter(i => i.status === s).length;

  return (
    <div className={`min-h-screen ${bg}`}>
      <ProjectNav projectId={id} />

      <main className="max-w-3xl mx-auto px-6 py-6">
        {/* ステータスタブ */}
        <div className={`flex gap-1 p-1 rounded-xl mb-5 w-fit ${dark ? "bg-slate-800" : "bg-slate-100"}`}>
          {["ALL", ...STATUS_LIST].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === s ? tabAct : tabIn}`}>
              {s} ({count(s)})
            </button>
          ))}
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className={`text-center py-12 text-sm ${sub}`}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className={`${card} border rounded-xl p-10 text-center text-sm ${sub}`}>チケットがありません</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(issue => {
              const st  = STATUS_STYLE[issue.status] || STATUS_STYLE["保留"];
              const pri = PRI_STYLE[issue.priority]  || PRI_STYLE["LOW"];
              return (
                <button key={issue.id} onClick={() => setSelected(issue)}
                  className={`${card} border rounded-xl text-left w-full transition-all`}
                  style={{ padding: "12px 16px", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#3b82f6")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "")}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {/* 種別アイコン */}
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_LABEL[issue.type] || "🎫"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>
                          {issue.title}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: dark ? "#475569" : "#94a3b8" }}>{issue.featureId}</span>
                        <span style={{ fontSize: 10, color: dark ? "#475569" : "#94a3b8" }}>·</span>
                        <span style={{ fontSize: 10, color: dark ? "#475569" : "#94a3b8" }}>{new Date(issue.createdAt).toLocaleDateString("ja-JP")}</span>
                        {issue.description && (
                          <>
                            <span style={{ fontSize: 10, color: dark ? "#475569" : "#94a3b8" }}>·</span>
                            <span style={{ fontSize: 10, color: dark ? "#64748b" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{issue.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* バッジ群 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      <StatusBadge status={issue.status} small />
                      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: pri.bg, color: pri.text, fontWeight: 600 }}>
                        {issue.priority}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* 詳細モーダル */}
      {selected && (
        <IssueDetailModal
          issue={selected}
          projectId={id}
          dark={dark}
          onClose={() => setSelected(null)}
          onUpdated={updated => {
            setIssues(prev => prev.map(i => i.id === updated.id ? updated : i));
            setSelected(updated);
          }}
          onDeleted={deletedId => {
            setIssues(prev => prev.filter(i => i.id !== deletedId));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
