"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type Stats = {
  logs: number; console_logs: number; screenshots: number;
  issues: number; patterns: number; traces: number;
  users: number; projects: number; api_keys: number;
};

export default function AdminResetPage() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0=通常, 1=第1確認, 2=第2確認
  const [confirmInput, setConfirmInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const CONFIRM_WORD = "TLog";

  const bg       = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const cardBg   = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text     = dark ? "text-white" : "text-gray-900";
  const subtext  = dark ? "text-gray-400" : "text-gray-500";
  const modalBg  = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    const u = JSON.parse(localStorage.getItem("tlog_user") || "{}");
    if (u.role !== "ADMIN") { router.push("/projects"); return; }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/stats");
      setStats(res.data);
    } catch {} finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (confirmInput !== CONFIRM_WORD) return;
    setExecuting(true);
    try {
      const res = await api.post("/api/admin/reset");
      setResult(res.data.deleted);
      setStep(0);
      setConfirmInput("");
      fetchStats();
    } catch (e: any) {
      alert(e.response?.data?.message || "削除に失敗しました");
    } finally { setExecuting(false); }
  };

  const statItems = stats ? [
    { label: "UIイベントログ", key: "logs",         value: stats.logs,         color: "text-blue-500" },
    { label: "コンソールログ", key: "console_logs", value: stats.console_logs, color: "text-purple-500" },
    { label: "スクリーンショット", key: "screenshots", value: stats.screenshots, color: "text-green-500" },
    { label: "TraceIDセッション", key: "traces",    value: stats.traces,       color: "text-yellow-500" },
    { label: "チケット",       key: "issues",       value: stats.issues,       color: "text-red-500" },
    { label: "パターン",       key: "patterns",     value: stats.patterns,     color: "text-orange-500" },
  ] : [];

  const totalDeletable = stats
    ? stats.logs + stats.console_logs + stats.screenshots + stats.traces + stats.issues + stats.patterns
    : 0;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      {/* ヘッダー */}
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/projects")} className={`${subtext} hover:text-blue-500 text-sm transition`}>
            ← プロジェクト一覧
          </button>
          <span className={subtext}>/</span>
          <span className="text-red-500 font-bold text-sm">データ初期化</span>
        </div>
        <button onClick={toggle}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">

        {/* 完了メッセージ */}
        {result && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-bold text-green-700 mb-2">✅ データ初期化が完了しました</p>
            <div className="text-sm text-green-600 space-y-1">
              {Object.entries(result).map(([k, v]) => (
                <p key={k}>{k}: {v} 件削除</p>
              ))}
            </div>
          </div>
        )}

        {/* 現在のデータ件数 */}
        <div className={`${cardBg} border rounded-xl p-6 mb-6`}>
          <h2 className="text-lg font-bold mb-4">現在のデータ件数</h2>
          {loading ? (
            <p className={subtext}>読み込み中...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {statItems.map(({ label, value, color }) => (
                  <div key={label} className={`${dark ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-3 flex justify-between items-center`}>
                    <span className={`text-sm ${subtext}`}>{label}</span>
                    <span className={`font-bold text-lg ${color}`}>{value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className={`border-t ${dark ? "border-gray-700" : "border-gray-200"} pt-3 flex justify-between items-center`}>
                <span className="text-sm font-medium">削除対象合計</span>
                <span className="font-bold text-xl text-red-500">{totalDeletable.toLocaleString()} 件</span>
              </div>
              <div className={`mt-2 text-xs ${subtext}`}>
                ※ ユーザー（{stats?.users}名）・プロジェクト（{stats?.projects}件）・APIキー（{stats?.api_keys}件）は削除されません
              </div>
            </>
          )}
        </div>

        {/* 初期化ボタン */}
        <div className={`${cardBg} border border-red-200 rounded-xl p-6`}>
          <h2 className="text-lg font-bold text-red-600 mb-2">⚠️ データ初期化</h2>
          <p className={`text-sm ${subtext} mb-4`}>
            全プロジェクトのログ・スクリーンショット・TraceID・チケット・パターンを完全に削除します。
            この操作は取り消せません。
          </p>
          <button
            onClick={() => { setStep(1); setConfirmInput(""); setResult(null); }}
            disabled={totalDeletable === 0}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition"
          >
            データを初期化する
          </button>
        </div>
      </main>

      {/* Step 1: 第1確認モーダル */}
      {step === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`${modalBg} border border-red-300 rounded-xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-bold text-red-600 mb-2">本当に削除しますか？</h2>
              <p className={`text-sm ${subtext}`}>
                <strong className="text-red-500">{totalDeletable.toLocaleString()} 件</strong>のデータが完全に削除されます。<br />
                この操作は取り消せません。
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button onClick={() => setStep(2)}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition">
                続行する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 第2確認モーダル（確認ワード入力） */}
      {step === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`${modalBg} border border-red-300 rounded-xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔐</div>
              <h2 className="text-xl font-bold text-red-600 mb-2">最終確認</h2>
              <p className={`text-sm ${subtext} mb-4`}>
                削除を実行するには、下のテキストボックスに
                <strong className="text-red-500 mx-1">"{CONFIRM_WORD}"</strong>
                と入力してください。
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                className={inputCls}
                placeholder={`"${CONFIRM_WORD}" と入力`}
                autoFocus
              />
              {confirmInput.length > 0 && confirmInput !== CONFIRM_WORD && (
                <p className="text-red-500 text-xs mt-1">"{CONFIRM_WORD}" と正確に入力してください</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep(0); setConfirmInput(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${dark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"} transition`}>
                キャンセル
              </button>
              <button
                onClick={handleReset}
                disabled={confirmInput !== CONFIRM_WORD || executing}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              >
                {executing ? "削除中..." : "完全に削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
