import { useState } from "react";

const issues = [
  {
    id: "I-01",
    category: "タイムライン",
    title: "スクリーン幅に合わせてTL_COLSを動的計算",
    detail: "TL_COLS=6固定のため広い画面で右側が空きすぎる。container.offsetWidth から自動計算 + window resize で再描画が必要。",
    file: "generate-review.js",
    func: "renderTlCards()",
    fix: "Math.floor(containerW / 150) で動的計算、window.addEventListener('resize', ...) 追加",
    priority: "高",
    status: "未対応",
  },
  {
    id: "I-02",
    category: "作業パターン",
    title: "編集・削除ボタン反応なし",
    detail: "renderPatternList() が生成するHTMLのonclick属性内でダブルクォートのエスケープが壊れている可能性。deployed版で確認要。",
    file: "generate-review.js",
    func: "renderPatternList() in renderScript()",
    fix: 'onclick="openPatternModal(\\\'"+p.id+"\\\')" のエスケープを data-id 属性 + addEventListener に変更',
    priority: "高",
    status: "未対応",
  },
  {
    id: "I-03",
    category: "画面フィルター",
    title: "フィルターボタンエラー",
    detail: "tlFilterFid() 呼び出し時の引数文字列にダブルクォートが混入して SyntaxError が発生している。",
    file: "generate-review.js",
    func: "renderTlFilterBtns() in renderScript()",
    fix: 'onclick="tlFilterFid(\'"+fid+"\')" → data-fid 属性 + delegated event listener に変更',
    priority: "高",
    status: "未対応",
  },
  {
    id: "I-04",
    category: "コンソールログ",
    title: "JSエラー・警告が.jsonlに記録されない",
    detail: "window.onerror / window.addEventListener('error', ..., true) が未設定。adjustFixedList4onLoadImage ReferenceError などが未捕捉のまま。",
    file: "talon_testcase_logger.js",
    func: "init()",
    fix: "window.onerror + window.addEventListener('error') + window.addEventListener('unhandledrejection') を追加",
    priority: "中",
    status: "未対応",
  },
  {
    id: "I-05",
    category: "コンソールログ",
    title: "html2canvas 404エラーが記録されない",
    detail: "リソース読み込みエラー(Network Error)は console.error オーバーライドでは捕捉できない。",
    file: "talon_testcase_logger.js",
    func: "init()",
    fix: "window.addEventListener('error', fn, true) でリソースエラーを捕捉してサーバーへ送信",
    priority: "中",
    status: "未対応",
  },
  {
    id: "I-06",
    category: "課題一覧",
    title: "課題一覧から各課題の編集ができない",
    detail: "renderIssueTable() が生成するHTML内に編集ボタン・モーダルが存在しない。閲覧のみ。",
    file: "generate-review.js",
    func: "renderIssueTable() in renderScript()",
    fix: "各行に ✏️ 編集ボタン追加 + 課題編集モーダル(HTML + JS)を実装",
    priority: "低",
    status: "未対応",
  },
  {
    id: "I-07",
    category: "データ保存",
    title: "localStorage の制約をユーザーに周知",
    detail: "作業パターン・判定データはブラウザのlocalStorageに保存。別PC/ブラウザ/シークレットモードでは共有されず消える。",
    file: "UI上の説明文",
    func: "renderWorkPatternsPage()",
    fix: "ページ上部に「⚠️ データはこのブラウザにのみ保存されます」の警告表示を追加",
    priority: "低",
    status: "未対応",
  },
  {
    id: "I-08",
    category: "作業パターン",
    title: "画面モードに認証・帳票出力が不足",
    detail: "モーダルの「画面モード」selectに 閲覧/編集/新規/混在/その他 しかない。認証・帳票出力モードがない。",
    file: "generate-review.js",
    func: "renderWorkPatternsPage()",
    fix: "<option>認証</option><option>帳票出力</option> を追加",
    priority: "低",
    status: "未対応",
  },
];

const PRIORITY_COLOR = { 高: "bg-red-100 text-red-700", 中: "bg-yellow-100 text-yellow-700", 低: "bg-gray-100 text-gray-600" };
const STATUS_COLOR = { 未対応: "bg-slate-100 text-slate-600", 対応中: "bg-blue-100 text-blue-700", 完了: "bg-green-100 text-green-700" };
const CAT_COLOR = {
  タイムライン: "bg-blue-50 text-blue-700 border-blue-200",
  作業パターン: "bg-purple-50 text-purple-700 border-purple-200",
  画面フィルター: "bg-orange-50 text-orange-700 border-orange-200",
  コンソールログ: "bg-red-50 text-red-700 border-red-200",
  課題一覧: "bg-pink-50 text-pink-700 border-pink-200",
  データ保存: "bg-green-50 text-green-700 border-green-200",
};

export default function IssuesTable() {
  const [expanded, setExpanded] = useState(null);
  const [statuses, setStatuses] = useState(() => Object.fromEntries(issues.map(i => [i.id, i.status])));

  const nextStatus = { 未対応: "対応中", 対応中: "完了", 完了: "未対応" };

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans text-sm">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">📋 generate-review.js 残課題一覧</h1>
        <p className="text-xs text-gray-500 mb-4">優先度順 | 行クリックで詳細展開 | ステータスボタンで更新</p>

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {["未対応","対応中","完了"].map(s => (
            <div key={s} className="bg-white rounded-lg border border-gray-200 p-3 text-center shadow-sm">
              <div className={`text-2xl font-bold ${s==="未対応"?"text-slate-600":s==="対応中"?"text-blue-600":"text-green-600"}`}>
                {Object.values(statuses).filter(v=>v===s).length}
              </div>
              <div className="text-xs text-gray-500">{s}</div>
            </div>
          ))}
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-left">
                <th className="px-3 py-2 w-14">ID</th>
                <th className="px-3 py-2 w-24">カテゴリ</th>
                <th className="px-3 py-2">課題タイトル</th>
                <th className="px-3 py-2 w-16 text-center">優先度</th>
                <th className="px-3 py-2 w-20 text-center">対象ファイル</th>
                <th className="px-3 py-2 w-24 text-center">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <>
                  <tr
                    key={issue.id}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${expanded===issue.id?"bg-blue-50":""}`}
                    onClick={() => setExpanded(expanded===issue.id ? null : issue.id)}
                  >
                    <td className="px-3 py-2.5 font-mono text-gray-500">{issue.id}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${CAT_COLOR[issue.category]||"bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {issue.category}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{issue.title}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PRIORITY_COLOR[issue.priority]}`}>
                        {issue.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-500 text-xs">{issue.file.replace("generate-review.js","rev.js")}</td>
                    <td className="px-3 py-2.5 text-center" onClick={e=>e.stopPropagation()}>
                      <button
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${STATUS_COLOR[statuses[issue.id]]}`}
                        onClick={() => setStatuses(s => ({...s, [issue.id]: nextStatus[s[issue.id]]}))}
                      >
                        {statuses[issue.id]}
                      </button>
                    </td>
                  </tr>
                  {expanded===issue.id && (
                    <tr key={issue.id+"-detail"} className="bg-blue-50 border-t border-blue-100">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-xs font-bold text-gray-500 mb-1">📝 詳細</div>
                            <div className="text-xs text-gray-700 leading-relaxed">{issue.detail}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-500 mb-1">🎯 対象関数</div>
                            <div className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 text-blue-700">{issue.func}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-500 mb-1">🔧 修正方針</div>
                            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 leading-relaxed">{issue.fix}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
