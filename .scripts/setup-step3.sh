#!/usr/bin/env bash
# ============================================================
# setup-step3.sh
# generate-review.js v4.0 — PostgreSQL(Prisma)読み込み対応
#
# 実行方法:
#   bash .scripts/setup-step3.sh
# ============================================================
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " TLog v3.0 — Step3: generate-review.js v4.0"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- A. バックアップ ---
echo "--- A. バックアップ ---"
BAKFILE="scripts/generate-review.v3.x.bak.js"
if [ ! -f "$BAKFILE" ]; then
  cp scripts/generate-review.js "$BAKFILE"
  echo "✅ バックアップ: $BAKFILE"
else
  echo "ℹ️  バックアップ既存: $BAKFILE"
fi

# --- B. generate-review.js v4.0 作成 ---
echo "--- B. generate-review.js v4.0 作成 ---"

# 現在のgenerate-review.jsから末尾のmain()呼び出し以降を確認
MAIN_LINE=$(grep -n "^main()" scripts/generate-review.js | head -1 | cut -d: -f1)
echo "ℹ️  現在のmain()呼び出し行: ${MAIN_LINE:-不明}"

# DB対応用のラッパーモジュールを作成
cat > scripts/db-loader.js << 'DBLOADER'
// ============================================================
// scripts/db-loader.js  v1.0
// generate-review.js v4.0 用 DB読み込みモジュール
// PostgreSQL(Prisma) からログ・スクショ・コンソールログを取得
// ============================================================
'use strict';
require('dotenv').config();
const path = require('path');

const { prisma } = require(path.join(__dirname, '..', 'lib', 'prisma'));

/**
 * 全featureId → ログエントリ一覧 マップを取得
 * 旧: loadLogs() の .jsonl ファイル読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [payloadObj, ...] }
 */
async function loadLogsFromDB(projectId) {
  const logs = await prisma.log.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, payload: true }
  });
  const result = {};
  for (const { featureId, payload } of logs) {
    if (!result[featureId]) result[featureId] = [];
    // payload は Prisma Json 型 → そのまま利用可
    result[featureId].push(payload);
  }
  return result;
}

/**
 * 全featureId → コンソールログ一覧 マップを取得
 * 旧: loadConsoleLogs() の .console.jsonl 読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [entryObj, ...] }
 */
async function loadConsoleLogsFromDB(projectId) {
  const rows = await prisma.consoleLog.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, level: true, args: true, traceId: true, ts: true, stack: true }
  });
  const result = {};
  for (const row of rows) {
    if (!result[row.featureId]) result[row.featureId] = [];
    result[row.featureId].push({
      type       : 'CONSOLE',
      featureId  : row.featureId,
      level      : row.level,
      args       : row.args,
      lastTraceId: row.traceId,
      ts         : row.ts ? row.ts.toISOString() : null,
      stack      : row.stack
    });
  }
  return result;
}

/**
 * 全featureId → スクショ情報一覧 マップを取得
 * 旧: loadScreenshots() のファイルシステム読み込みを置き換え
 * @param {number} projectId
 * @returns {Promise<Object>} { featureId: [{ fname, fid, trigger, traceId }, ...] }
 */
async function loadScreenshotsFromDB(projectId) {
  const rows = await prisma.screenshot.findMany({
    where: { projectId },
    orderBy: { ts: 'asc' },
    select: { featureId: true, filePath: true, trigger: true, traceId: true }
  });
  const result = {};
  for (const row of rows) {
    if (!result[row.featureId]) result[row.featureId] = [];
    const fname = path.basename(row.filePath || '');
    result[row.featureId].push({
      fname   : fname,
      fid     : row.featureId,
      trigger : row.trigger || '',
      traceId : row.traceId || ''
    });
  }
  return result;
}

/**
 * DB からプロジェクトの画面一覧（screenId）を取得
 * @param {number} projectId
 * @returns {Promise<string[]>}
 */
async function loadFeatureIdsFromDB(projectId) {
  const screens = await prisma.screen.findMany({
    where: { projectId },
    select: { screenId: true },
    orderBy: { screenId: 'asc' }
  });
  return screens.map(s => s.screenId);
}

/**
 * DB から画面の説明文を取得
 * @param {number} projectId
 * @returns {Promise<Object>} { screenId: description }
 */
async function loadScreenDescriptionsFromDB(projectId) {
  const screens = await prisma.screen.findMany({
    where: { projectId },
    select: { screenId: true, description: true }
  });
  const result = {};
  for (const s of screens) {
    result[s.screenId] = s.description || '';
  }
  return result;
}

/**
 * DB からプロジェクト情報を取得
 * @param {number} projectId
 * @returns {Promise<Object|null>}
 */
async function loadProjectFromDB(projectId) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true, description: true }
  });
}

module.exports = {
  loadLogsFromDB,
  loadConsoleLogsFromDB,
  loadScreenshotsFromDB,
  loadFeatureIdsFromDB,
  loadScreenDescriptionsFromDB,
  loadProjectFromDB
};
DBLOADER

echo "✅ scripts/db-loader.js 作成完了"

# --- C. generate-review.js にDB読み込みを統合するパッチスクリプト作成 ---
cat > scripts/apply-patch-v40.js << 'PATCHSCRIPT'
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
PATCHSCRIPT

echo "✅ scripts/apply-patch-v40.js 作成完了"

# --- D. パッチ適用 ---
echo "--- D. パッチ適用 ---"
node scripts/apply-patch-v40.js

# --- E. 動作テスト ---
echo "--- E. 動作テスト ---"
echo "ℹ️  node scripts/generate-review.js を実行..."
node scripts/generate-review.js && echo "✅ generate-review.js v4.0 DB読み込み成功" || {
  echo "❌ 実行エラー — ロールバックします"
  cp "$BAKFILE" scripts/generate-review.js
  echo "✅ ロールバック完了"
  exit 1
}

# --- F. 生成確認 ---
echo "--- F. 生成ファイル確認 ---"
if [ -f docs/review/index.html ]; then
  SIZE=$(du -sh docs/review/index.html | cut -f1)
  echo "✅ docs/review/index.html: $SIZE"
else
  echo "❌ docs/review/index.html が生成されませんでした"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Step 3 完了 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 次: Step 4 — レビュー画面 localStorage廃止 + ヘッダーUI"
