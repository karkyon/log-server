"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { api } from "@/lib/api";
import { ProjectNav } from "@/components/ProjectNav";

type Trace = {
  id: string; status: string; operatorId: string | null;
  startedAt: string; endedAt: string | null; metadata: any;
  _count?: { logs: number };
  screens?: string[];
};
type Project = { id: string; name: string; slug: string };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    "bg-emerald-900/60 text-emerald-300 border border-emerald-700",
  COMPLETED: "bg-slate-700/60 text-slate-300 border border-slate-600",
  CLOSED:    "bg-slate-700/60 text-slate-300 border border-slate-600",
  TIMEOUT:   "bg-orange-900/60 text-orange-300 border border-orange-700",
  ERROR:     "bg-red-900/60 text-red-300 border border-red-700",
};

function formatDuration(start: string, end: string | null) {
  if (!end) return "継続中";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`;
}
function formatTime(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return formatTime(ts);
  if (isYesterday) return `昨日 ${formatTime(ts)}`;
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) + " " + formatTime(ts);
}

export default function TracesPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { dark, toggle } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [filtered, setFiltered] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [forceStoping, setForceStoping] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState("TODAY");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteTraceId, setDeleteTraceId] = useState<string|null>(null);
  const [editLabelId, setEditLabelId] = useState<string|null>(null);
  const [editLabelVal, setEditLabelVal] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [pRes, tRes] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/traces`),
      ]);
      setProject(pRes.data);
      setTraces(tRes.data);
    } catch (e: any) {
      if (e.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchData(false);
  }, [fetchData]);

  // フィルタリング
  useEffect(() => {
    let list = [...traces];
    if (statusFilter !== "ALL") {
      list = list.filter(t =>
        statusFilter === "CLOSED"
          ? (t.status === "COMPLETED" || t.status === "CLOSED")
          : t.status === statusFilter
      );
    }
    if (periodFilter !== "ALL") {
      const now = new Date();
      list = list.filter(t => {
        const d = new Date(t.startedAt);
        if (isNaN(d.getTime())) return false;
        if (periodFilter === "TODAY") {
          return d.toDateString() === now.toDateString();
        }
        if (periodFilter === "WEEK") {
          const week = new Date(now); week.setDate(now.getDate() - 7);
          return d >= week;
        }
        if (periodFilter === "MONTH") {
          const month = new Date(now); month.setMonth(now.getMonth() - 1);
          return d >= month;
        }
        return true;
      });
    }
    setFiltered(list);
    setSelected(s => s.filter(id => list.some(t => t.id === id)));
  }, [traces, statusFilter, periodFilter]);

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };
  const selectAll = () => {
    const allIds = filtered.map(t => t.id);
    setSelected(selected.length === allIds.length ? [] : allIds);
  };

  const generateReview = async (traceId: string) => {
    setGenerating(traceId);
    try {
      const res = await api.post(
        `/api/projects/${projectId}/traces/${traceId}/generate-review`,
        {}, { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
      window.open(url, "_blank");
    } catch (e: any) {
      alert(`生成失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const generateBulk = async () => {
    if (!selected.length) return;
    setGenerating("bulk");
    try {
      const res = await api.post(
        `/api/projects/${projectId}/generate-review`,
        { traceIds: selected }, { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
      window.open(url, "_blank");
    } catch (e: any) {
      alert(`生成失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const forceStop = async (traceId: string) => {
    if (!confirm("このトレースを強制終了しますか？")) return;
    setForceStoping(traceId);
    try {
      await api.post(`/api/projects/${projectId}/traces/${traceId}/force-stop`, {});
      await fetchData(false);
    } catch (e: any) {
      alert(`失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setForceStoping(null);
    }
  };

  const deleteTrace = async (traceId: string) => {
    if (!confirm("このTraceIDと紐づくすべてのログ・判定・スクショを削除します。よろしいですか？")) return;
    try {
      await api.delete(`/api/projects/${projectId}/traces/${traceId}`);
      await fetchData(false);
    } catch (e: any) { alert(`削除失敗: ${e.response?.data?.message || e.message}`); }
  };

  const saveLabel = async (traceId: string) => {
    try {
      await api.patch(`/api/projects/${projectId}/traces/${traceId}/metadata`, { label: editLabelVal });
      setEditLabelId(null);
      await fetchData(false);
    } catch (e: any) { alert(`更新失敗: ${e.response?.data?.message || e.message}`); }
  };

  const deleteProject = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/projects/${projectId}`);
      router.push("/projects");
    } catch (e: any) {
      alert(`削除失敗: ${e.response?.data?.message || e.message}`);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const bg   = dark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900";
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-slate-200";
  const th   = dark ? "bg-gray-900/80 text-gray-400 border-gray-800" : "bg-slate-50 text-slate-500 border-slate-200";
  const tr   = dark ? "border-gray-800 hover:bg-gray-800/50" : "border-slate-100 hover:bg-slate-50";
  const sel  = dark ? "bg-blue-900/30" : "bg-blue-50";
  const sub  = dark ? "text-gray-400" : "text-slate-500";

  if (loading) return (
    <div className={`min-h-screen ${bg} flex items-center justify-center`}>
      <span className={sub}>読み込み中...</span>
    </div>
  );

  return (
    <div className={`min-h-screen ${bg}`}>
      <ProjectNav projectId={projectId} projectName={project?.name} />

      <main className="px-6 py-4 max-w-[1400px] mx-auto">
        {/* ツールバー */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h1 className="text-base font-bold">{project?.name || projectId}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? "bg-gray-800 text-gray-400" : "bg-slate-100 text-slate-500"}`}>
            {filtered.length}件
          </span>
          <div className="flex-1" />

          {/* フィルター */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`text-xs px-2 py-1.5 rounded border ${dark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-white border-slate-300 text-slate-600"}`}
          >
            <option value="ALL">ステータス: すべて</option>
            <option value="CLOSED">COMPLETED のみ</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="TIMEOUT">TIMEOUT</option>
          </select>
          <select
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value)}
            className={`text-xs px-2 py-1.5 rounded border ${dark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-white border-slate-300 text-slate-600"}`}
          >
            <option value="TODAY">期間: 今日</option>
            <option value="WEEK">今週</option>
            <option value="MONTH">今月</option>
            <option value="ALL">すべて</option>
          </select>

          {/* 一括生成ボタン */}
          {selected.length > 0 && (
            <button
              onClick={generateBulk}
              disabled={generating === "bulk"}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded-md font-semibold flex items-center gap-1.5"
            >
              {generating === "bulk" ? "⏳ 生成中..." : `📄 選択してレビュー生成（${selected.length}件）`}
            </button>
          )}

          {/* 更新ボタン */}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1 transition-all active:scale-95 ${
              refreshing ? "opacity-40 cursor-not-allowed" :
              dark ? "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200" : "border-slate-300 text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span className={refreshing ? "animate-spin inline-block" : ""}>🔄</span>
            {refreshing ? "更新中..." : "更新"}
          </button>

          {/* プロジェクト削除ボタン */}
          <button
            onClick={() => setDeleteConfirm(true)}
            className="text-xs px-3 py-1.5 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-all"
          >
            🗑 プロジェクト削除
          </button>
        </div>

        {/* テーブル */}
        {filtered.length === 0 ? (
          <div className={`text-center py-16 rounded-xl border ${card}`}>
            <p className={`${sub} mb-1`}>TraceIDがありません</p>
            <p className="text-xs text-slate-600">SDK.startTrace() を実行するとここに表示されます</p>
          </div>
        ) : (
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={`${th} border-b text-xs font-semibold`}>
                  <th className="px-3 py-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={selectAll}
                      className="cursor-pointer accent-blue-500"
                    />
                  </th>
                  <th className="px-3 py-3 text-left" style={{minWidth:220}}>TraceID</th>
                  <th className="px-3 py-3 text-left">操作ユーザー</th>
                  <th className="px-3 py-3 text-left">開始</th>
                  <th className="px-3 py-3 text-left">終了</th>
                  <th className="px-3 py-3 text-center">時間</th>
                  <th className="px-3 py-3 text-center">ログ数</th>
                  <th className="px-3 py-3 text-left">状態</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const isSel = selected.includes(t.id);
                  const isActive = t.status === "ACTIVE";
                  return (
                    <tr key={t.id} className={`border-b transition-colors ${isSel ? sel : tr}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(t.id)}
                          className="cursor-pointer accent-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => router.push(`/projects/${projectId}/traces/${t.id}`)}
                          className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {/* 1段目: ID + ラベル編集 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-blue-400 font-mono">{t.id.slice(0, 8)}…</span>
                            {editLabelId === t.id ? (
                              <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input autoFocus value={editLabelVal}
                                  onChange={e => setEditLabelVal(e.target.value)}
                                  onKeyDown={e => { if(e.key==="Enter") saveLabel(t.id); if(e.key==="Escape") setEditLabelId(null); }}
                                  className={`text-[11px] px-1.5 py-0.5 rounded border w-28 ${dark?"bg-gray-800 border-gray-600 text-white":"bg-white border-gray-300"}`} />
                                <button onClick={() => saveLabel(t.id)} className="text-[10px] text-blue-400 hover:text-blue-300">✓</button>
                                <button onClick={() => setEditLabelId(null)} className="text-[10px] text-gray-400">✕</button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 group">
                                {t.metadata?.label && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{background:"#3b82f6",color:"white",whiteSpace:"nowrap"}}>
                                    {t.metadata.label}
                                  </span>
                                )}
                                <button onClick={e => { e.stopPropagation(); setEditLabelId(t.id); setEditLabelVal(t.metadata?.label||""); }}
                                  className={`text-[10px] opacity-0 group-hover:opacity-100 transition ${dark?"text-gray-500 hover:text-gray-300":"text-gray-400 hover:text-gray-600"}`}>✏️</button>
                              </span>
                            )}
                          </div>
                          {/* 2段目: 画面遷移1行 */}
                          {t.screens && t.screens.length > 0 && (
                            <div className="text-[10px] mt-0.5 truncate" style={{color: dark ? "#64748b" : "#94a3b8", maxWidth: 280}}>
                              {t.screens.map((s: string) => s.replace("MC_","")).join(" → ")}
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {t.operatorId || t.metadata?.userLabel || <span className={sub}>—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{formatDate(t.startedAt)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {t.endedAt ? formatDate(t.endedAt) : <span className={sub}>—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        {formatDuration(t.startedAt, t.endedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        {t._count?.logs ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status] || STATUS_STYLE.ERROR}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isActive && (
                            <button
                              onClick={() => forceStop(t.id)}
                              disabled={forceStoping === t.id}
                              title="強制終了"
                              className="text-[10px] px-2 py-1 rounded border border-orange-700 text-orange-400 hover:bg-orange-900/40 disabled:opacity-40 transition-all"
                            >
                              {forceStoping === t.id ? "⏳" : "⏹ 終了"}
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/projects/${projectId}/traces/${t.id}`)}
                            className={`text-[10px] px-2 py-1 rounded border transition-all ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-700" : "border-slate-300 text-slate-500 hover:bg-slate-100"}`}
                          >
                            詳細
                          </button>
                          <button
                            onClick={() => generateReview(t.id)}
                            disabled={generating === t.id}
                            className="text-[10px] px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white transition-all flex items-center gap-1"
                          >
                            {generating === t.id ? "⏳" : "📄 生成"}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteTrace(t.id); }}
                            className={`text-[10px] px-2 py-1 rounded border transition-all ${dark ? "border-red-800 text-red-400 hover:bg-red-900/30" : "border-red-300 text-red-500 hover:bg-red-50"}`}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={`px-4 py-2 text-xs border-t ${dark ? "border-gray-800 text-gray-500" : "border-slate-100 text-slate-400"} text-right`}>
              {selected.length > 0 ? `${selected.length}件選択中 | ` : ""}全{traces.length}件
            </div>
          </div>
        )}
      </main>

      {/* プロジェクト削除確認モーダル */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className={`rounded-xl border p-6 w-[420px] shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200"}`}>
            <h2 className="text-base font-bold text-red-400 mb-3">🗑 プロジェクトを削除しますか？</h2>
            <p className={`text-sm mb-4 ${sub}`}>
              <strong className="text-red-400">「{project?.name}」</strong>を削除します。<br />
              プロジェクトのログ・パターン・チケット・APIキーがすべて削除されます。<br />
              この操作は取り消せません。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(false)}
                className={`px-4 py-2 text-sm rounded border ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
              >
                キャンセル
              </button>
              <button
                onClick={deleteProject}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white font-semibold"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
