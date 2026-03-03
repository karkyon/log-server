"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Project = { id: string; slug: string; name: string };

export default function AdminResetPage() {
  const router = useRouter();
  const { dark } = useTheme();
  const [user, setUser]       = useState<{ displayName: string; role: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [confirm, setConfirm]   = useState("");
  const [step, setStep]         = useState<"select" | "confirm" | "done">("select");
  const [result, setResult]     = useState<{ deleted: Record<string, number>; message: string } | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const bg   = dark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900";
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const sub  = dark ? "text-gray-400" : "text-gray-500";
  const inp  = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"}`;

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = localStorage.getItem("tlog_user");
    if (u) {
      const parsed = JSON.parse(u);
      setUser(parsed);
      if (parsed.role !== "ADMIN") { router.push("/projects"); return; }
    }
    api.get("/api/projects").then(r => setProjects(r.data)).catch(() => {});
  }, []);

  const handleSelect = (p: Project) => {
    setSelected(p);
    setConfirm("");
    setError("");
    setStep("confirm");
  };

  const handleReset = async () => {
    if (!selected || confirm !== selected.slug) {
      setError("プロジェクトのスラッグが一致しません");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.delete(`/api/admin/reset?project=${selected.slug}`);
      setResult(res.data);
      setStep("done");
    } catch (e: any) {
      setError(e.response?.data?.message || "削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${bg}`}>
      {/* ヘッダー */}
      <header className={`${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border-b px-6 py-4 flex items-center gap-4`}>
        <button onClick={() => router.push("/projects")} className={`text-sm ${sub} hover:text-blue-500 transition`}>← プロジェクト一覧</button>
        <h1 className="text-lg font-bold text-red-500">🗑️ データ初期化</h1>
        <span className={`text-xs ml-auto ${sub}`}>{user?.displayName} (ADMIN)</span>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">

        {/* 警告バナー */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-red-700">
          <p className="font-bold text-sm">⚠️ この操作は取り消せません</p>
          <p className="text-xs mt-1">選択したプロジェクトのログ・パターン・チケット・APIキーがすべて削除されます。プロジェクト自体は残ります。</p>
        </div>

        {/* STEP 1: プロジェクト選択 */}
        {step === "select" && (
          <div className={`${card} border rounded-xl p-6`}>
            <h2 className="font-semibold mb-4">初期化するプロジェクトを選択</h2>
            {projects.length === 0 ? (
              <p className={`text-sm ${sub}`}>プロジェクトがありません</p>
            ) : (
              <div className="space-y-2">
                {projects.map(p => (
                  <button key={p.id} onClick={() => handleSelect(p)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition hover:border-red-400 ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-red-50"}`}>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className={`text-xs ${sub}`}>{p.slug}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: スラッグ入力で2重確認 */}
        {step === "confirm" && selected && (
          <div className={`${card} border rounded-xl p-6`}>
            <h2 className="font-semibold mb-2">確認：データを削除します</h2>
            <p className={`text-sm ${sub} mb-5`}>
              <span className="font-bold text-red-500">{selected.name}</span> のデータをすべて削除します。<br />
              続行するには下のフィールドにプロジェクトのスラッグ（<code className="bg-gray-100 text-gray-800 px-1 rounded text-xs">{selected.slug}</code>）を入力してください。
            </p>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={selected.slug}
              className={inp}
            />
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep("select")}
                className={`flex-1 py-2 rounded-lg border text-sm transition ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
                キャンセル
              </button>
              <button onClick={handleReset} disabled={loading || confirm !== selected.slug}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium transition">
                {loading ? "削除中..." : "削除を実行"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 完了 */}
        {step === "done" && result && (
          <div className={`${card} border rounded-xl p-6 text-center`}>
            <p className="text-2xl mb-3">✅</p>
            <p className="font-semibold mb-4">{result.message}</p>
            <div className={`${dark ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-4 text-sm text-left space-y-1 mb-6`}>
              <p>ログ削除数：<span className="font-mono font-bold">{result.deleted.logs}</span></p>
              <p>パターン削除数：<span className="font-mono font-bold">{result.deleted.patterns}</span></p>
              <p>チケット削除数：<span className="font-mono font-bold">{result.deleted.issues}</span></p>
              <p>APIキー削除数：<span className="font-mono font-bold">{result.deleted.apiKeys}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep("select"); setSelected(null); setConfirm(""); setResult(null); }}
                className={`flex-1 py-2 rounded-lg border text-sm ${dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
                別のプロジェクトを初期化
              </button>
              <button onClick={() => router.push("/projects")}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                プロジェクト一覧へ
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
