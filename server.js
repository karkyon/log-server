// ~/projects/log-server/server.js  v2.2
// 変更履歴:
//   v1.0 - 初版（/log, /screenshot, /ping）
//   v2.0 - featureId別ディレクトリ保存、/features, /logs/:featureId API追加
//   v2.1 - /screenshot に featureId を受け取り logs/screenshots/{featureId}/ に保存
//          SHOTエントリを features/{featureId}.jsonl にも記録（analyze-logs.js紐付け用）
//   v2.2 - /consolelog エンドポイント追加
//          保存先: logs/features/<featureId>.console.jsonl
//          /consolelogs/:featureId 取得エンドポイント追加

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = 3099;
const LOGS_DIR = path.join(__dirname, 'logs');
const FEAT_DIR = path.join(LOGS_DIR, 'features');   // 機能別ログ格納ディレクトリ
const SS_DIR   = path.join(LOGS_DIR, 'screenshots'); // 機能別スクショ格納ディレクトリ

// ── ベースディレクトリ作成 ──
[LOGS_DIR, FEAT_DIR, SS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ミドルウェア
app.use(cors());
app.use(express.json({ limit: '50mb' }));

/* ------------------------------------------------------------------ *
 * 機能名（featureId）を正規化してファイルシステムで安全な文字列にする
 * 英数字・アンダースコア・ハイフン以外は _ に置換
 * ------------------------------------------------------------------ */
function sanitizeFeatureId(featureId) {
  if (!featureId || typeof featureId !== 'string') return 'UNKNOWN';
  return featureId.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64);
}

/* ------------------------------------------------------------------ *
 * ログ受信
 * 保存先: logs/features/<featureId>.jsonl
 * ------------------------------------------------------------------ */
app.post('/log', (req, res) => {
  try {
    const featureId = sanitizeFeatureId(req.body.featureId);
    const logFile   = path.join(FEAT_DIR, `${featureId}.jsonl`);
    const entry     = { ...req.body, _savedAt: new Date().toISOString() };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    res.sendStatus(200);
  } catch (err) {
    console.error('[LOG ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * スクリーンショット受信・保存
 * 保存先: logs/screenshots/<featureId>/<ts>_<screenId>_<trigger>_<traceId>.jpg
 * v2.1変更: featureId を body から受け取り featureId 別ディレクトリに保存
 *           SHOTエントリを features/{featureId}.jsonl にも記録
 * ------------------------------------------------------------------ */
app.post('/screenshot', (req, res) => {
  try {
    const { featureId: rawFeatureId, traceId, screenId, trigger, imageData } = req.body;
    const featureId = sanitizeFeatureId(rawFeatureId);

    // 機能名別ディレクトリを動的作成
    const featureSSDir = path.join(SS_DIR, featureId);
    if (!fs.existsSync(featureSSDir)) fs.mkdirSync(featureSSDir, { recursive: true });

    const ts       = new Date().toISOString().replace(/[:.]/g, '-');
    const ext      = imageData.startsWith('data:image/jpeg') ? 'jpg' : 'png';
    const filename = `${ts}_${screenId}_${trigger}_${traceId}.${ext}`;
    const filepath = path.join(featureSSDir, filename);

    // base64 → ファイル保存
    const base64 = imageData.replace(/^data:image\/(png|jpeg);base64,/, '');
    fs.writeFileSync(filepath, base64, 'base64');

    // analyze-logs.js がトレースIDで紐付けるための SCREENSHOT エントリ
    // file パスは logs/ からの相対パスで統一（GitHub Pages では docs/screenshots/ に変換される）
    const logFile = path.join(FEAT_DIR, `${featureId}.jsonl`);
    const ssEntry = {
      type     : 'SCREENSHOT',
      featureId: featureId,
      traceId  : traceId,
      screenId : screenId,
      trigger  : trigger,
      file     : `logs/screenshots/${featureId}/${filename}`,
      _savedAt : new Date().toISOString()
    };
    fs.appendFileSync(logFile, JSON.stringify(ssEntry) + '\n', 'utf8');

    console.log(`[SS] 保存: logs/screenshots/${featureId}/${filename}`);
    res.json({ saved: filename, featureId: featureId });

  } catch (err) {
    console.error('[SCREENSHOT ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * コンソールログ受信                                         [v2.2追加]
 * 保存先: logs/features/<featureId>.console.jsonl
 *
 * クライアント側の _setupConsoleCapture() が console.log/warn/error/info/debug
 * を傍受してバッチ送信してくる。
 * 機能ログ（.jsonl）とは別ファイルに保存することで分析時に分離しやすくする。
 * featureId と ts、lastTraceId で機能ログ・スクショとの時系列照合が可能。
 * ------------------------------------------------------------------ */
app.post('/consolelog', (req, res) => {
  try {
    const featureId = sanitizeFeatureId(req.body.featureId);
    const logFile   = path.join(FEAT_DIR, `${featureId}.console.jsonl`);
    const entry     = { ...req.body, _savedAt: new Date().toISOString() };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    res.sendStatus(200);
  } catch (err) {
    console.error('[CONSOLELOG ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * コンソールログ一覧取得（JSON配列で返す）                   [v2.2追加]
 * GET /consolelogs/:featureId
 * ------------------------------------------------------------------ */
app.get('/consolelogs/:featureId', (req, res) => {
  try {
    const featureId = sanitizeFeatureId(req.params.featureId);
    const logFile   = path.join(FEAT_DIR, `${featureId}.console.jsonl`);

    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: `Console log for "${featureId}" not found` });
    }

    const lines   = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    res.json({ featureId, count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * 機能一覧の取得
 * 記録済みの機能名（.jsonlファイル名から取得）を返す
 * .console.jsonl は除外し、純粋な機能IDのみ返す
 * ------------------------------------------------------------------ */
app.get('/features', (req, res) => {
  try {
    const files    = fs.readdirSync(FEAT_DIR)
                       .filter(f => f.endsWith('.jsonl') && !f.endsWith('.console.jsonl'));
    const features = files.map(f => f.replace('.jsonl', ''));
    res.json({ features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * 指定機能のログ一覧取得（JSON配列で返す）
 * GET /logs/:featureId
 * ------------------------------------------------------------------ */
app.get('/logs/:featureId', (req, res) => {
  try {
    const featureId = sanitizeFeatureId(req.params.featureId);
    const logFile   = path.join(FEAT_DIR, `${featureId}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: `Feature "${featureId}" not found` });
    }

    const lines   = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    res.json({ featureId, count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 死活確認
app.get('/ping', (req, res) => res.json({ status: 'ok', port: PORT }));

// サーバ起動（1回のみ）
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LOG SERVER v2.2] 起動中 → http://0.0.0.0:${PORT}`);
  console.log(`  ログ保存先          : ${FEAT_DIR}/<featureId>.jsonl`);
  console.log(`  コンソールログ保存先: ${FEAT_DIR}/<featureId>.console.jsonl`);
  console.log(`  スクショ保存先      : ${SS_DIR}/<featureId>/`);
});