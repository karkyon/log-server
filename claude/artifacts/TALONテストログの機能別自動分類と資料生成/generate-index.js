#!/usr/bin/env node
/* =============================================================================
   scripts/generate-index.js
   docs/index.html（生成済み仕様書の一覧ページ）を生成する
   generate.js 実行後に呼び出される
   =============================================================================*/

const fs   = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

function main() {
  // docs/ 以下のサブディレクトリ（= 生成済み featureId 一覧）を取得
  if (!fs.existsSync(DOCS_DIR)) {
    console.log('[generate-index] docs/ ディレクトリが存在しません。スキップします。');
    return;
  }

  const features = fs.readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(DOCS_DIR, d.name, 'index.html')))
    .map(d => {
      const stat = fs.statSync(path.join(DOCS_DIR, d.name, 'index.html'));
      return { id: d.name, updatedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>機能仕様書 一覧 | Machining System</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>body { font-family: 'DM Sans', sans-serif; }</style>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="max-w-4xl mx-auto py-12 px-6">
    <div class="mb-10">
      <p class="text-xs font-semibold tracking-widest text-indigo-400 uppercase mb-1">karkyon / log-server</p>
      <h1 class="text-3xl font-bold text-gray-900">機能仕様書 一覧</h1>
      <p class="mt-1 text-sm text-gray-400">最終更新: ${now} JST</p>
    </div>

    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="text-left px-6 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">機能ID</th>
            <th class="text-left px-6 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">最終生成</th>
            <th class="px-6 py-3.5"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${features.length === 0
            ? '<tr><td colspan="3" class="px-6 py-8 text-center text-gray-400 text-sm">仕様書がまだ生成されていません</td></tr>'
            : features.map(f => `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 font-mono text-sm text-indigo-600 font-medium">${f.id}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${new Date(f.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
            <td class="px-6 py-4 text-right">
              <a href="./${f.id}/index.html"
                 class="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors">
                仕様書を開く →
              </a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-gray-400 text-center mt-8">自動生成 by GitHub Actions + Claude API</p>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), html, 'utf8');
  console.log(`[generate-index] docs/index.html を更新しました (${features.length} 件)`);
}

main();
