#!/usr/bin/env node
// ============================================================
// apply-patch-v40-fix.js
// generate-review.js v3.x → v4.0 パッチ（修正版）
//
// 元のコード:
//   function buildHtml(fids, allLogs, allShots, issData, allConsoleLogs)
//   内部で buildAllSeqs を呼ぶ構造
//
// パッチ内容:
//   1. require群にdb-loaderを追加
//   2. main()だけをasync DB版に置き換え（buildHtmlのシグネチャは変えない）
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

fs.copyFileSync(TARGET, BAKFILE);
console.log('[BACKUP]', BAKFILE);

let src = fs.readFileSync(TARGET, 'utf8');

// ── 1. バージョン表記更新 ──────────────────────────────────
src = src.replace(
  /\/\/ scripts\/generate-review\.js\s+v[\d.]+/,
  '// scripts/generate-review.js  v4.0'
);
src = src.replace(
  /\[generate-review v[\d.]+\]/g,
  '[generate-review v4.0]'
);
console.log('[OK] バージョン表記 v4.0 に更新');

// ── 2. require 群に db-loader を追加 ─────────────────────
const useStrict = `'use strict';
const fs   = require('fs');
const path = require('path');`;

const useStrictNew = `'use strict';
const fs   = require('fs');
const path = require('path');
require('dotenv').config();
const {
  loadLogsFromDB,
  loadConsoleLogsFromDB,
  loadScreenshotsFromDB,
  loadFeatureIdsFromDB,
  loadProjectFromDB
} = require('./db-loader');
const { prisma } = require('../lib/prisma');`;

if (src.includes(useStrict)) {
  src = src.replace(useStrict, useStrictNew);
  console.log('[OK] db-loader require 追加');
} else {
  console.error('[ERROR] "use strict" + fs/path ブロックが見つかりません');
  process.exit(1);
}

// ── 3. main() 全体を置き換え ──────────────────────────────
// 元の main() の開始位置を探す
const mainStart = src.indexOf('\nfunction main()');
if (mainStart < 0) {
  console.error('[ERROR] main() が見つかりません');
  process.exit(1);
}

// main() の後ろにある main(); 呼び出しを含む末尾まで切り取る
// ファイル末尾の main(); を探す
const mainCallIdx = src.lastIndexOf('\nmain();');
if (mainCallIdx < 0) {
  console.error('[ERROR] main() 呼び出しが見つかりません');
  process.exit(1);
}

// main()の終わりは main(); の後ろ（改行含む）
const endIdx = mainCallIdx + '\nmain();'.length;

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

  // DB からデータを並列取得
  const [allLogs, allConsoleLogs, allShots] = await Promise.all([
    loadLogsFromDB(PROJECT_ID),
    loadConsoleLogsFromDB(PROJECT_ID),
    loadScreenshotsFromDB(PROJECT_ID)
  ]);

  // featureId 一覧: ログあり画面 + DB画面マスタを統合
  const logFids    = Object.keys(allLogs).filter(k => allLogs[k].length > 0);
  const masterFids = await loadFeatureIdsFromDB(PROJECT_ID);
  const fids       = [...new Set([...logFids, ...masterFids])].sort();

  if (!fids.length) console.warn('[generate-review v4.0] ログが見つかりません');
  console.log('[generate-review v4.0] 画面:', fids.join(', ') || 'なし');
  console.log('  ログあり画面:', logFids.length, '/ 合計:', fids.length);

  // issues.json は引き続きファイルから読み込み（Step 4 以降でDB化予定）
  const issData = loadIssues();

  // buildHtml に渡す（シグネチャは変更なし）
  // function buildHtml(fids, allLogs, allShots, issData, allConsoleLogs)
  const html = buildHtml(fids, allLogs, allShots, issData, allConsoleLogs);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log('[generate-review v4.0] 完了:', OUT_FILE, '(' + kb + ' KB)');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});`;

src = src.slice(0, mainStart) + newMain;

fs.writeFileSync(TARGET, src, 'utf8');
console.log('[OK] main() v4.0 DB版に置き換え完了');

// ── 4. 構文チェック ──────────────────────────────────────
const { execSync } = require('child_process');
try {
  execSync('node --check ' + TARGET, { stdio: 'pipe' });
  console.log('[OK] 構文チェック通過');
} catch (e) {
  console.error('[ERROR] 構文エラー:', e.stderr?.toString());
  fs.copyFileSync(BAKFILE, TARGET);
  console.error('[ROLLBACK] 元のファイルに戻しました');
  process.exit(1);
}

console.log('\n✅ generate-review.js v4.0 パッチ完了');
console.log('   テスト: node scripts/generate-review.js');
