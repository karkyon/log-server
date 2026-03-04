"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { ProjectNav } from "@/components/ProjectNav";

type Trace = {
  id: string;
  status: "ACTIVE" | "CLOSED" | "TIMEOUT";
  operatorId: string | null;
  startedAt: string;
  endedAt: string | null;
  canGenerate: boolean;
  metadata: Record<string, any> | null;
};

type Project = { id: string; name: string; slug: string };

export default function TracesPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const { dark, toggle } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
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
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const selectAll = () => {
    const closedIds = traces.filter(t => true).map(t => t.id);
    setSelected(selected.length === closedIds.length ? [] : closedIds);
  };

  const generateReview = async (traceId: string) => {
    setGenerating(traceId);
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
      setGenerating(null);
    }
  };

  const generateBulk = async () => {
    if (!selected.length) return;
    setGenerating("bulk");
    try {
      const res = await api.post(
        `/api/projects/${projectId}/generate-review`,
        { traceIds: selected },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/html" }));
      window.open(url, "_blank");
    } catch (e: any) {
      alert(`生成失敗: ${e.response?.data?.message || e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "継続中";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h${m % 60}m` : `${m}m`;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      CLOSED: "bg-green-900 text-green-300",
      ACTIVE: "bg-blue-900 text-blue-300",
      TIMEOUT: "bg-yellow-900 text-yellow-300",
    };
    return map[status] || "bg-gray-700 text-gray-300";
  };

  const bg = dark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900";
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-slate-200";
  const th = dark ? "bg-gray-900 text-gray-400" : "bg-slate-50 text-slate-500";
  const tr = dark ? "border-slate-700 hover:bg-slate-750" : "border-slate-100 hover:bg-slate-50";

  return (
    <div className={`min-h-screen ${bg}`}>
      <ProjectNav projectId={projectId} projectName={project?.name} />

      <main className="px-6 py-5 max-w-7xl mx-auto">
        {/* ツールバー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">TraceID 一覧</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
              {traces.length}件
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button
                onClick={generateBulk}
                disabled={generating === "bulk"}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                {generating === "bulk" ? "⏳ 生成中..." : `📄 選択してレビュー生成（${selected.length}件）`}
              </button>
            )}
            <button onClick={fetchData} className={`text-xs px-3 py-2 rounded border transition hover:opacity-70 active:scale-95 ${dark ? "border-slate-600 text-slate-400 hover:bg-slate-700" : "border-slate-300 text-slate-500 hover:bg-slate-100"}`}>
              🔄 更新
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">読み込み中...</div>
        ) : traces.length === 0 ? (
          <div className={`text-center py-12 rounded-xl border ${card}`}>
            <p className="text-slate-500 mb-2">TraceIDがありません</p>
            <p className="text-xs text-slate-600">SDK.startTrace() を実行するとここに表示されます</p>
          </div>
        ) : (
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={th}>
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === traces.filter(t => true).length && traces.filter(t => true).length > 0}
                      onChange={selectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left">TraceID</th>
                  <th className="px-3 py-3 text-left">オペレーター</th>
                  <th className="px-3 py-3 text-left">開始日時</th>
                  <th className="px-3 py-3 text-left">継続時間</th>
                  <th className="px-3 py-3 text-left">ステータス</th>
                  <th className="px-3 py-3 text-center">アクション</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr key={trace.id} className={`border-t ${tr}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(trace.id)}
                        onChange={() => toggleSelect(trace.id)}
                        disabled={!trace.canGenerate}
                        className="cursor-pointer disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs text-blue-400">
                        {trace.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {trace.operatorId || (trace.metadata as any)?.userLabel || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {new Date(trace.startedAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {formatDuration(trace.startedAt, trace.endedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(trace.status)}`}>
                        {trace.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => router.push(`/projects/${projectId}/traces/${trace.id}`)}
                          className={`text-xs px-3 py-1.5 rounded border font-medium ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => generateReview(trace.id)}
                          disabled={!trace.canGenerate || generating === trace.id}
                          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded font-semibold"
                        >
                          {generating === trace.id ? "⏳..." : "📄 生成"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
