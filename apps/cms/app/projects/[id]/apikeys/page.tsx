"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

type ApiKey = {
  id: string; label: string; isActive: boolean;
  lastUsedAt: string | null; createdAt: string;
};

export default function ApiKeysPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark, toggle } = useTheme();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null); // 発行直後のみ表示
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchKeys();
  }, [id]);

  const fetchKeys = () => {
    setLoading(true);
    api.get(`/api/projects/${id}/apikeys`)
      .then(r => setKeys(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleCreate = async () => {
    if (!label.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/projects/${id}/apikeys`, { label: label.trim() });
      setNewKey(res.data.plainKey);
      setLabel("");
      fetchKeys();
    } catch {
      alert("APIキーの発行に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (keyId: string, keyLabel: string) => {
    if (!confirm(`「${keyLabel}」を無効化しますか？`)) return;
    try {
      await api.delete(`/api/projects/${id}/apikeys/${keyId}`);
      fetchKeys();
    } catch {
      alert("無効化に失敗しました");
    }
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const headerBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inputCls = `border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      <header className={`${headerBg} border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}/traces`)} className={`${subtext} hover:text-blue-500 text-sm transition`}>← トレース一覧</button>
          <span className={subtext}>/</span>
          <h1 className="font-bold text-blue-600">APIキー管理</h1>
        </div>
        <button onClick={toggle} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* 発行直後の平文表示（1回限り） */}
        {newKey && (
          <div className="border border-yellow-400 bg-yellow-50 rounded-xl p-4">
            <p className="text-yellow-800 font-semibold text-sm mb-2">⚠️ このキーは今だけ表示されます。必ずコピーしてください。</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-yellow-300 rounded px-3 py-2 text-sm font-mono break-all text-yellow-900">{newKey}</code>
              <button onClick={handleCopy}
                className="shrink-0 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition">
                {copied ? "✓ コピー済" : "コピー"}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-yellow-600 hover:underline">閉じる（二度と表示されません）</button>
          </div>
        )}

        {/* 新規発行フォーム */}
        <div className={`${cardBg} border rounded-xl p-5`}>
          <h2 className="font-semibold mb-4">新しいAPIキーを発行</h2>
          <div className="flex gap-3">
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              className={`${inputCls} flex-1`} placeholder="ラベル（例: TALON本番環境）"
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <button onClick={handleCreate} disabled={submitting || !label.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition shrink-0">
              {submitting ? "発行中..." : "発行"}
            </button>
          </div>
          <p className={`text-xs ${subtext} mt-2`}>発行後、平文キーは1度しか表示されません。安全な場所に保管してください。</p>
        </div>

        {/* キー一覧 */}
        <div className={`${cardBg} border rounded-xl p-5`}>
          <h2 className="font-semibold mb-4">発行済みキー一覧</h2>
          {loading ? <p className={subtext}>読み込み中...</p> : keys.length === 0 ? (
            <p className={`${subtext} text-sm`}>発行済みのAPIキーはありません</p>
          ) : (
            <div className="space-y-3">
              {keys.map(k => (
                <div key={k.id} className={`flex items-center justify-between p-3 rounded-lg border ${dark ? "border-gray-700" : "border-gray-200"}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{k.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${k.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {k.isActive ? "有効" : "無効"}
                      </span>
                    </div>
                    <p className={`text-xs ${subtext} mt-0.5`}>
                      発行: {new Date(k.createdAt).toLocaleDateString('ja-JP')}
                      {k.lastUsedAt && ` ／ 最終利用: ${new Date(k.lastUsedAt).toLocaleDateString('ja-JP')}`}
                    </p>
                  </div>
                  {k.isActive && (
                    <button onClick={() => handleRevoke(k.id, k.label)}
                      className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition shrink-0">
                      無効化
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SDK利用方法 */}
        <div className={`${cardBg} border rounded-xl p-5`}>
          <h2 className="font-semibold mb-3">SDK での利用方法</h2>
          <pre className={`text-xs ${subtext} bg-opacity-50 ${dark ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-3 overflow-x-auto`}>{`// talon_testcase_logger.js の設定
const logger = new TLogClient({
  apiKey: "ak_xxxx...（発行したキー）",
  endpoint: "http://192.168.1.11:3099"
});`}</pre>
        </div>
      </main>
    </div>
  );
}
