"use client";
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

export default function PatternsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { dark } = useTheme();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Pattern | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("tlog_token");
    if (!token) { router.push("/login"); return; }
    fetchPatterns();
  }, [id]);

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

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const text = dark ? "text-white" : "text-gray-900";
  const subtext = dark ? "text-gray-400" : "text-gray-500";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const hoverBg = dark ? "hover:border-blue-600" : "hover:border-blue-400";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`;
  const modalBg = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>
      {/* ヘッダー */}
      <ProjectNav projectId={id} />

      {/* メインコンテンツ */}
      <main className="max-w-5xl mx-auto px-6 py-8 flex gap-6">
        {/* 左: パターン一覧 */}
        <div className="w-1/2">
          <h2 className="font-semibold mb-4">パターン一覧 ({patterns.length})</h2>
          {loading ? <p className={subtext}>読み込み中...</p> : patterns.length === 0 ? (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
              <p>パターンがありません</p>
              <button onClick={() => { setForm(EMPTY_FORM); setJsonError(""); setShowModal(true); }}
                className="mt-3 text-blue-500 text-sm hover:underline">+ 最初のパターンを登録</button>
            </div>
          ) : (
            <div className="grid gap-3">
              {patterns.map(p => (
                <div key={p.id} onClick={() => setSelected(p)}
                  className={`${cardBg} ${hoverBg} border rounded-xl p-4 cursor-pointer transition ${selected?.id === p.id ? "border-blue-500" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className={`font-medium ${text}`}>{p.name}</h3>
                      {p.screenMode && <p className={`text-xs ${subtext} mt-1`}>{p.screenMode}</p>}
                      {p.memo && <p className={`text-xs ${subtext} mt-1 line-clamp-2`}>{p.memo}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${STATUS_COLOR[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 詳細 */}
        <div className="w-1/2">
          <h2 className="font-semibold mb-4">シーケンス詳細</h2>
          {selected ? (
            <div className={`${cardBg} border rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{selected.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] || "bg-gray-100 text-gray-600"}`}>{selected.status}</span>
              </div>
              {selected.screenMode && <p className={`text-xs ${subtext} mb-2`}>画面: {selected.screenMode}</p>}
              {selected.memo && <p className={`text-xs ${subtext} mb-3 p-2 rounded bg-opacity-50 ${dark ? "bg-gray-800" : "bg-gray-50"}`}>{selected.memo}</p>}
              <pre className={`text-xs ${subtext} overflow-auto max-h-96 whitespace-pre-wrap`}>
                {JSON.stringify(selected.seqData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className={`${cardBg} border rounded-xl p-8 text-center ${subtext}`}>
              パターンを選択してください
            </div>
          )}
        </div>
      </main>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${modalBg} border rounded-xl p-6 w-full max-w-lg shadow-xl`}>
            <h2 className={`text-lg font-bold mb-5 ${text}`}>パターン登録</h2>

            <div className="space-y-4">
              {/* パターン名 */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>パターン名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="例: 製品検索→詳細確認フロー" />
              </div>

              {/* 画面モード */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>画面モード（任意）</label>
                <input type="text" value={form.screenMode} onChange={e => setForm(f => ({ ...f, screenMode: e.target.value }))}
                  className={inputCls} placeholder="例: MC_PRODUCTS_LIST" />
              </div>

              {/* seqData */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>シーケンスデータ（JSON）<span className="text-red-500">*</span></label>
                <textarea rows={5} value={form.seqData} onChange={e => handleSeqDataChange(e.target.value)}
                  className={`${inputCls} font-mono resize-none`}
                  placeholder='{"steps": [{"action": "click", "target": "btn_search"}]}' />
                {jsonError && <p className="text-red-500 text-xs mt-1">{jsonError}</p>}
              </div>

              {/* メモ */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${subtext}`}>メモ（任意）</label>
                <textarea rows={2} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  className={`${inputCls} resize-none`} placeholder="このパターンについての補足説明" />
              </div>
            </div>

            {/* ボタン */}
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
    </div>
  );
}
