// ~/projects/log-server/server.js
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = 3099;
const LOG_FILE = path.join(__dirname, 'logs', 'talon.jsonl');
const SS_DIR   = path.join(__dirname, 'logs', 'screenshots');

// ディレクトリ作成
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// ミドルウェア（app.listen前に全部定義）
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ログ受信
app.post('/log', (req, res) => {
  const entry = { ...req.body, _savedAt: new Date().toISOString() };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  res.sendStatus(200);
});

// スクリーンショット受信・保存
app.post('/screenshot', (req, res) => {
  try {
    const { traceId, screenId, trigger, imageData } = req.body;
    const ts  = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = imageData.startsWith('data:image/jpeg') ? 'jpg' : 'png';

    // ★ filenameをfilepathより先に宣言
    const filename = `${ts}_${screenId}_${trigger}_${traceId}.${ext}`;
    const filepath = path.join(SS_DIR, filename);

    // base64 → ファイル保存
    const base64 = imageData.replace(/^data:image\/(png|jpeg);base64,/, '');
    fs.writeFileSync(filepath, base64, 'base64');

    // ログにも記録
    const entry = {
      type    : 'SCREENSHOT',
      traceId : traceId,
      screenId: screenId,
      trigger : trigger,
      file    : filename,
      _savedAt: new Date().toISOString()
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');

    res.json({ saved: filename });

  } catch (err) {
    console.error('[SCREENSHOT ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 死活確認
app.get('/ping', (req, res) => res.json({ status: 'ok', port: PORT }));

// ★ app.listenは最後に1回だけ
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LOG SERVER] 起動中 → http://0.0.0.0:${PORT}`);
});