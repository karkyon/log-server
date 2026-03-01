#!/usr/bin/env node
// ============================================================
// apply-patch-v40.js
// generate-review.js v3.x → v4.0 パッチ
// 変更内容:
//   1. ファイル先頭にdb-loaderのrequireを追加
//   2. main()をasync化 + DB読み込みに変更
//   3. buildAllSeqs()呼び出し引数を統一
//   4. PROJECT_ID環境変数対応
// ============================================================
'use strict';
const fs   = require('fs');
const path = require('path');

const TARGET  = path.join(__dirname, 'generate-review.js');
const BAKFILE = path.join(__dirname, 'generate-review.v4.0.pre.bak.js');

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: generate-review.js が見つかりません');
  process.exit(1);
}

// バックアップ
fs.copyFileSync(TARGET, BAKFILE);
console.log('[BACKUP]', BAKFILE);

let src = fs.readFileSync(TARGET, 'utf8');

// ── 1. バージョン表記をv4.0に更新 ─────────────────────────────
src = src.replace(
  /\/\/ scripts\/generate-review\.js\s+v\d+\.\d+/,
  '// scripts/generate-review.js  v4.0'
);
console.log('[OK] バージョン表記 v4.0 に更新');

// ── 2. require群の末尾にdb-loaderを追加 ─────────────────────
// 'use strict'; の次の require('fs') の行を探して後ろにdb-loaderを追加
const requireBlock = `'use strict';
const fs   = require('fs');
const path = require('path');`;

const requireBlockNew = `'use strict';
const fs   = require('fs');
const path = require('path');
require('dotenv').config();
const {
  loadLogsFromDB,
  loadConsoleLogsFromDB,
  loadScreenshotsFromDB,
  loadFeatureIdsFromDB,
  loadProjectFromDB,
  loadScreenDescriptionsFromDB
} = require('./db-loader');
const { prisma } = require('../lib/prisma');`;

if (src.includes(requireBlock)) {
  src = src.replace(requireBlock, requireBlockNew);
  console.log('[OK] db-loader require 追加');
} else {
  // フォールバック: ファイル先頭に追加
  src = `'use strict';\nrequire('dotenv').config();\nconst {\n  loadLogsFromDB,\n  loadConsoleLogsFromDB,\n  loadScreenshotsFromDB,\n  loadFeatureIdsFromDB,\n  loadProjectFromDB,\n  loadScreenDescriptionsFromDB\n} = require('./db-loader');\nconst { prisma } = require('../lib/prisma');\n` + src.replace(/^'use strict';/, '');
  console.log('[OK] db-loader require 先頭に追加');
}

// ── 3. main() をasync DB版に置き換え ─────────────────────────
// 既存のmain()の開始を探す
const mainStart = src.indexOf('\nfunction main()');
const mainStartAsync = src.indexOf('\nasync function main()');
const mainIdx = mainStart >= 0 ? mainStart : mainStartAsync;

if (mainIdx < 0) {
  console.error('[ERROR] main() 関数が見つかりません');
  process.exit(1);
}

// main()の終わり（最後の }）を探す
// main()の開始から末尾のmain()呼び出しまでを置き換え
const mainCallIdx = src.lastIndexOf('\nmain();');
const mainCallIdxAlt = src.lastIndexOf('\nmain().catch');

if (mainCallIdx < 0 && mainCallIdxAlt < 0) {
  console.error('[ERROR] main() 呼び出しが見つかりません');
  process.exit(1);
}

const endIdx = mainCallIdx >= 0 ? mainCallIdx : mainCallIdxAlt;

// main()本体全体を新しいDB版に置き換え
const newMain = `
// ============================================================
// main() v4.0 — PostgreSQL(Prisma) からデータを読み込む
// ============================================================
async function main() {
  const PROJECT_ID = parseInt(process.env.PROJECT_ID || '1', 10);

  console.log('[generate-review v4.0] 開始 PROJECT_ID=' + PROJECT_ID);

  // DB からプロジェクト情報取得
  const project = await loadProjectFromDB(PROJECT_ID);
  if (!project) {
    console.error('[ERROR] プロジェクトID ' + PROJECT_ID + ' が見つかりません');
    process.exit(1);
  }
  console.log('  プロジェクト:', project.name);

  // DB からデータ一括取得（並列）
  const [allLogs, allConsoleLogs, allShots] = await Promise.all([
    loadLogsFromDB(PROJECT_ID),
    loadConsoleLogsFromDB(PROJECT_ID),
    loadScreenshotsFromDB(PROJECT_ID)
  ]);

  // ログが存在するfeatureIdを優先、DB画面マスタも補完
  const logFids     = Object.keys(allLogs).filter(k => allLogs[k].length > 0);
  const masterFids  = await loadFeatureIdsFromDB(PROJECT_ID);
  const fids        = [...new Set([...logFids, ...masterFids])].sort();

  console.log('  画面数:', fids.length, '/ ログあり:', logFids.length);

  // issues.json は引き続きファイルから（Step4以降でDB化）
  const issData = loadIssues();

  // シーケンス構築
  const allSeqs = buildAllSeqs(fids, allLogs, allShots, issData, allConsoleLogs);

  console.log('  シーケンス合計:', allSeqs.length);

  // HTML生成・出力
  const html = buildHtml(allSeqs, fids, issData);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(\`✅ 生成完了: \${OUT_FILE} (\${kb} KB)\`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('[ERROR]', e);
  process.exit(1);
});`;

src = src.slice(0, mainIdx) + newMain;

fs.writeFileSync(TARGET, src, 'utf8');
console.log('[OK] main() v4.0 DB版に置き換え完了');

// ── 4. 構文チェック ───────────────────────────────────────────
const { execSync } = require('child_process');
try {
  execSync('node --check ' + TARGET, { stdio: 'pipe' });
  console.log('[OK] 構文チェック通過');
} catch (e) {
  console.error('[ERROR] 構文エラー:', e.stderr?.toString());
  // ロールバック
  fs.copyFileSync(BAKFILE, TARGET);
  console.error('[ROLLBACK] 元のファイルに戻しました');
  process.exit(1);
}

console.log('\n✅ generate-review.js v4.0 パッチ完了');
console.log('   テスト: node scripts/generate-review.js');
