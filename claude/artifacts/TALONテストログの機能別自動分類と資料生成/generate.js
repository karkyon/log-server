#!/usr/bin/env node
/* =============================================================================
   scripts/generate.js
   機能仕様書 自動生成スクリプト v1.0

   使い方:
     node scripts/generate.js <featureId>
     例: node scripts/generate.js MC_PRODUCTS_LIST

   処理フロー:
     1. logs/features/<featureId>.jsonl を読み込む
     2. logs/screenshots/<featureId>/ のスクショを base64 変換
     3. Claude API へ ログ + 画像 + プロンプトを送信
     4. docs/<featureId>/index.html に機能仕様書を保存
   =============================================================================*/

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

// ── 定数 ──────────────────────────────────────────────────────────────────────
const ROOT_DIR  = path.join(__dirname, '..');
const FEAT_DIR  = path.join(ROOT_DIR, 'logs', 'features');
const SS_DIR    = path.join(ROOT_DIR, 'logs', 'screenshots');
const DOCS_DIR  = path.join(ROOT_DIR, 'docs');

// Claude API モデル（コスト最適化: Sonnet 4 を使用）
const MODEL = 'claude-sonnet-4-20250514';

// スクショの最大枚数（トークン・コスト節約のため上限を設ける）
const MAX_SCREENSHOTS = 6;

// ── メイン処理 ────────────────────────────────────────────────────────────────
async function main() {
  const featureId = process.argv[2];
  if (!featureId) {
    console.error('[ERROR] featureId を引数で指定してください');
    console.error('  例: node scripts/generate.js MC_PRODUCTS_LIST');
    process.exit(1);
  }

  console.log(`\n[generate.js] 開始: ${featureId}`);
  console.log('─'.repeat(60));

  // 1. ログファイル読み込み
  const logFile = path.join(FEAT_DIR, `${featureId}.jsonl`);
  if (!fs.existsSync(logFile)) {
    console.error(`[ERROR] ログファイルが見つかりません: ${logFile}`);
    process.exit(1);
  }

  const logEntries = fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  console.log(`  ✓ ログ読み込み: ${logEntries.length} 件`);

  // 2. スクショ読み込み（最大 MAX_SCREENSHOTS 枚）
  const ssFeatureDir = path.join(SS_DIR, featureId);
  const screenshots  = [];

  if (fs.existsSync(ssFeatureDir)) {
    const files = fs.readdirSync(ssFeatureDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()                          // タイムスタンプ順
      .slice(0, MAX_SCREENSHOTS);      // 上限まで

    for (const file of files) {
      const filePath  = path.join(ssFeatureDir, file);
      const base64    = fs.readFileSync(filePath).toString('base64');
      const mediaType = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      screenshots.push({ file, base64, mediaType });
    }

    console.log(`  ✓ スクショ読み込み: ${screenshots.length} 枚 (全 ${fs.readdirSync(ssFeatureDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).length} 枚中)`);
  } else {
    console.warn(`  ⚠ スクショディレクトリが見つかりません（テキストのみで生成します）`);
  }

  // 3. Claude API 呼び出し
  console.log(`  → Claude API 呼び出し中... (${MODEL})`);
  const client = new Anthropic();

  const htmlContent = await callClaudeAPI(client, featureId, logEntries, screenshots);
  console.log(`  ✓ HTML 生成完了 (${(htmlContent.length / 1024).toFixed(1)} KB)`);

  // 4. docs/<featureId>/index.html に保存
  const outDir  = path.join(DOCS_DIR, featureId);
  const outFile = path.join(outDir, 'index.html');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, htmlContent, 'utf8');

  console.log(`  ✓ 保存完了: docs/${featureId}/index.html`);
  console.log('─'.repeat(60));
  console.log(`[generate.js] 完了: ${featureId}\n`);
}

/* =============================================================================
   Claude API 呼び出し
   ログエントリ + スクショ画像をプロンプトに乗せて HTML 機能仕様書を生成する
   =============================================================================*/
async function callClaudeAPI(client, featureId, logEntries, screenshots) {

  // ── ログをカテゴリ別に整理してプロンプト用テキストを作る ──
  const screenLoads     = logEntries.filter(e => e.type === 'SCREEN_LOAD');
  const uiClicks        = logEntries.filter(e => e.type === 'UI_CLICK');
  const backendLogs     = logEntries.filter(e => e.type === 'BACKEND');
  const screenshotLogs  = logEntries.filter(e => e.type === 'SCREENSHOT');
  const errorLogs       = logEntries.filter(e => e.type === 'ERROR');

  // 初期スナップショット（フォーム要素の一覧として活用）
  const initialSnapshot = backendLogs.find(e => e.processName === 'INITIAL_SNAPSHOT');

  // ユニークなボタン・入力要素を抽出
  const elements = {};
  uiClicks.forEach(e => {
    if (!elements[e.elementId]) {
      elements[e.elementId] = {
        id   : e.elementId,
        label: e.label,
        type : e.inputValues?.elementType || 'UNKNOWN',
        values: []
      };
    }
    if (e.inputValues?.newValue || e.inputValues?.selectedValue || e.inputValues?.buttonLabel) {
      elements[e.elementId].values.push(
        e.inputValues?.newValue || e.inputValues?.selectedValue || e.inputValues?.buttonLabel
      );
    }
  });

  const logSummary = JSON.stringify({
    featureId,
    screenName    : screenLoads[0]?.screenName || featureId,
    totalLogs     : logEntries.length,
    screenshotCount: screenshotLogs.length,
    screenLoads   : screenLoads.length,
    formElements  : initialSnapshot?.formSnapshot
      ? Object.keys(initialSnapshot.formSnapshot).map(id => ({ id, initialValue: initialSnapshot.formSnapshot[id] }))
      : [],
    elements      : Object.values(elements),
    backendProcess: [...new Set(backendLogs.map(e => e.processName))],
    errors        : errorLogs.slice(0, 5),
    sampleClicks  : uiClicks.slice(0, 20)
  }, null, 2);

  // ── プロンプト構築 ──
  const systemPrompt = `あなたはシステム仕様書を作成する専門エンジニアです。
提供されたユーザー操作ログ（JSON Lines形式）とスクリーンショットを分析し、
白基調の洗練されたモダンなHTML機能仕様書を生成してください。

【出力形式】
- 完全なHTMLファイル（DOCTYPE宣言から</html>まで）
- Tailwind CSS（CDN）を使用
- Google Fonts: DM Sans（本文）+ DM Mono（コード）
- 白基調・グレーアクセントのモダンスタイル
- インラインCSSやscriptタグは最小限
- 画像は <img src="../../logs/screenshots/${featureId}/ファイル名"> で相対パスを使用

【必ず含める内容】
1. ヘッダー: 機能名・機能ID・生成日時・ページネーション
2. 画面初期表示: スクショ＋初期フォーム値の説明
3. 検索・フィルター要素一覧: 各入力項目のID・ラベル・用途説明
4. ボタン一覧: ボタンID・ラベル・アクション説明
5. 操作フロー: ログから読み取れる典型的な操作手順（ステップ形式）
6. 遷移情報: 閲覧・編集ボタンなど他画面への遷移トリガー
7. スクリーンショットギャラリー: 各操作タイミングのスクショ一覧

【文体】
- 技術的かつ簡潔な日本語
- 箇条書きよりも表（table）を優先
- 見出し階層は h2 > h3 で統一`;

  // ── メッセージコンテンツ組み立て ──
  const contentBlocks = [];

  // テキスト（ログサマリ）
  contentBlocks.push({
    type: 'text',
    text: `以下の操作ログデータと画面スクリーンショットをもとに、機能仕様書HTMLを作成してください。

## 操作ログサマリ（JSON）
\`\`\`json
${logSummary}
\`\`\`

## スクリーンショット情報
${screenshots.map((s, i) => `- ${i + 1}枚目: ${s.file}`).join('\n') || '（スクショなし）'}

上記のデータを分析して、完全なHTML機能仕様書を出力してください。
HTMLのみを返してください。説明文やマークダウンのコードフェンスは不要です。`
  });

  // スクショ画像を追加
  for (const ss of screenshots) {
    contentBlocks.push({
      type  : 'image',
      source: {
        type      : 'base64',
        media_type: ss.mediaType,
        data      : ss.base64
      }
    });
    // 画像の直後にファイル名を付ける（Claude が画像とファイル名を紐付けやすくするため）
    contentBlocks.push({
      type: 'text',
      text: `↑ スクリーンショット: ${ss.file}`
    });
  }

  // ── API 呼び出し ──
  const response = await client.messages.create({
    model     : MODEL,
    max_tokens: 8192,
    system    : systemPrompt,
    messages  : [{ role: 'user', content: contentBlocks }]
  });

  let html = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Claude がコードフェンスを付けた場合は除去
  html = html.replace(/^```html\s*/i, '').replace(/\s*```$/, '').trim();

  // DOCTYPE がない場合は付加
  if (!html.toLowerCase().startsWith('<!doctype')) {
    html = '<!DOCTYPE html>\n' + html;
  }

  return html;
}

// ── 実行 ─────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
