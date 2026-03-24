# 🔍 log-server — TLog APEX 操作ログ収集・課題可視化システム

> **karkyon/log-server**  
> WebアプリケーションのUIレイヤーにSDKを組み込み、ユーザー操作ログ・スクリーンショットを自動収集し、  
> CMS（Next.js）上でログ可視化・チケット管理・操作パターン分析を行うシステム。

---

## 📌 概要

**主な機能:**
- ユーザーのUI操作（クリック・入力・画面遷移）を seqNo 付きで完全記録
- 操作ごとのスクリーンショット自動取得
- TraceID 単位でログをタイムライン表示・リスト表示
- 操作パターンの登録・再利用・蛇行タイムライン可視化
- チケット発行・管理（Trace / PatternページどちらからでもOK）
- 重複ログの検出・削除（連続 seqNo 判定）

---

## 🏗️ システム構成

```
karkyon/log-server/
├── apps/
│   ├── api/                          # NestJS APIサーバー (port: 3099)
│   │   └── src/
│   │       ├── sdk/                  # SDK受信エンドポイント群
│   │       ├── traces/               # TraceID管理・ログ取得・チケット・パターン
│   │       ├── auth/                 # JWT認証
│   │       ├── users/                # ユーザー管理
│   │       └── projects/             # プロジェクト管理
│   └── cms/                          # Next.js CMS (port: 3002)
│       └── app/projects/[id]/
│           ├── traces/               # TraceID一覧
│           │   └── [traceId]/        # ログ詳細・判定・チケット発行・重複削除
│           ├── patterns/             # パターン一覧・蛇行タイムライン・チケット発行
│           ├── issues/               # チケット一覧・詳細・ステータス管理
│           └── apikeys/              # APIキー管理
├── public/
│   └── tlog-sdk.min.js               # クライアントSDK (配信: /assets/tlog-sdk.min.js)
├── scripts/
│   └── source_code_zip.sh            # ソースコード圧縮スクリプト
├── prisma/
│   └── schema.prisma                 # DBスキーマ
└── logs/
    └── screenshots/                  # スクリーンショット保存先
```

### インフラ構成

| 役割 | ホスト | 詳細 |
|------|--------|------|
| API / SDKサーバー | `192.168.1.11:3099` | NestJS (pm2 id:0) |
| CMS | `192.168.1.11:3002` | Next.js (pm2 id:1) |
| DB | `192.168.1.11:5434` | PostgreSQL |

---

## ⚡ システムフロー

```
アプリ画面操作
    ↓ (SDK 自動送信)
POST /sdk/log  →  NestJS API (192.168.1.11:3099)
    ↓
PostgreSQL に蓄積 (traces / logs / screenshots)
    ↓
CMS: http://192.168.1.11:3002/projects/[id]/traces
    ↓
ログ可視化 / 判定（OK/NG）/ チケット発行 / パターン登録
```

---

## 🎯 SDK 組み込み方法

### ① 初期化（1回だけ）

```html
<script src="http://192.168.1.11:3099/assets/tlog-sdk.min.js"></script>
<script>
TLog.init({
  apiKey:    'ak_xxxxxxxxxxxxxxxxxxxxxxxx',  // CMSのAPIキー管理画面で発行
  serverUrl: 'http://192.168.1.11:3099',
  projectId: 'your-project-id',
  autoStart: true,  // ページロード時に自動でTrace開始
});
</script>
```

### ② 各ページ（既存コードはそのままで動作）

```javascript
// 画面ロード記録
TLog.screenLoad('SCREEN_ID', '画面名');
TLogAutoInstrument.init('SCREEN_ID', { screenName: '画面名' });

// ボタン操作記録（任意）
TLog.action('SCREEN_ID', 'btn_search', { label: '検索' });

// テスト終了
TLog.stopTrace();
```

**`autoStart: true` を指定するだけで以下が自動動作:**
- ページロード時に `startTrace()` を自動呼び出し
- `startTrace()` 完了前のログを内部キューに蓄積し、完了後に自動送信

---

## 📡 API エンドポイント一覧

### SDK用（`x-api-key` ヘッダー認証）

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/sdk/trace/start` | Trace開始・traceId発行 |
| POST | `/sdk/trace/stop` | Trace終了 |
| POST | `/sdk/log` | 操作ログ送信 |
| POST | `/sdk/screenshot` | スクリーンショット送信 |
| POST | `/sdk/consolelog` | コンソールログ送信 |
| GET  | `/sdk/ping` | 疎通確認 |

### CMS用（JWT認証）

| メソッド | パス | 用途 |
|---------|------|------|
| GET | `/api/projects/:id/traces` | TraceID一覧 |
| GET | `/api/projects/:id/traces/:tid/logs` | ログ一覧（verdict JOIN済み） |
| PUT | `/api/projects/:id/traces/:traceId/logs/:logId/verdict` | 判定（OK/NG）保存 |
| DELETE | `/api/projects/:id/traces/:traceId/logs/seq/:seqNo` | seqNo指定ログ削除・リナンバリング |
| GET/POST | `/api/projects/:id/issues` | チケット一覧・作成 |
| PATCH | `/api/projects/:id/issues/:issueId` | チケット更新 |
| DELETE | `/api/projects/:id/issues/:issueId` | チケット削除 |
| GET/POST | `/api/projects/:id/patterns` | パターン一覧・登録 |
| DELETE | `/api/projects/:id/patterns/:patternId` | パターン削除 |
| GET/POST | `/api/projects/:id/apikeys` | APIキー一覧・発行 |
| DELETE | `/api/projects/:id/apikeys/:keyId` | APIキー無効化 |

---

## 🎫 チケット機能

### 発行エントリーポイント

| 場所 | 方法 |
|------|------|
| トレース詳細（リストビュー） | ログ行を選択 → 右パネルの「🎫 チケット」ボタン |
| トレース詳細（リストビュー） | ログ行を選択 → 行右端の「🎫」ボタン |
| パターン一覧 | パターンカード右上の「🎫」ボタン |

### チケット管理（issues ページ）

- ステータス管理：**未対応 / 対応中 / 解決済 / 保留**
- タイトル・内容の編集・保存
- 削除
- TraceID リンク（クリックでトレース詳細へ遷移）
- ステータスタブによる絞り込み

---

## 🔎 SDK メソッド一覧

```javascript
TLog.init({ apiKey, serverUrl, projectId, autoStart })

// Trace制御
TLog.startTrace({ userId, label, meta })  // autoStart:true なら不要
TLog.stopTrace()
TLog.getTraceId()

// ログ送信
TLog.log(eventType, screenName, elementId, payload)
TLog.screenLoad(screenId, screenName)
TLog.action(screenId, elementId, payload)
TLog.screenCapture(screenId, label)
```

---

## ⌘ よく使うコマンド

```bash
# サービス状態確認
pm2 status

# ビルド＆デプロイ
tlog-deploy-cms   # CMS ビルド + pm2 restart
tlog-deploy-api   # API ビルド + pm2 restart

# ログ確認
pm2 logs tlog-cms --lines 30 --nostream
pm2 logs tlog-api --lines 30 --nostream

# DB直接確認
tlog-db -c "SELECT id, status, started_at FROM traces ORDER BY started_at DESC LIMIT 5;"

# ソースコード圧縮
bash scripts/source_code_zip.sh              # ソースのみ
bash scripts/source_code_zip.sh --with-data  # logs/screenshots も含む
```

### エイリアス（~/.bashrc）

```bash
alias tlog-status='pm2 status'
alias tlog-restart='pm2 restart all'
alias tlog-deploy-cms='cd ~/projects/log-server/apps/cms && npm run build && pm2 restart tlog-cms'
alias tlog-deploy-api='cd ~/projects/log-server/apps/api && npm run build && pm2 restart tlog-api'
alias tlog-db='psql -U tlog -d tlogdb -h 127.0.0.1 -p 5434'
alias tlog-build='cd ~/projects/log-server && npm run build'
```

---

## 🗄️ DB スキーマ（主要テーブル）

| テーブル | 用途 |
|---------|------|
| `projects` | プロジェクト管理 |
| `traces` | 操作セッション（TraceID） |
| `logs` | 操作ログ（1操作=1レコード） |
| `screenshots` | スクリーンショット紐付け |
| `log_verdicts` | OK/NG 判定・問題点メモ |
| `issues` | チケット（種別・優先度・ステータス） |
| `patterns` | 操作パターン（seqData JSON） |
| `api_keys` | SDK認証キー |
| `users` | CMSユーザー |

---

## ⚠️ 既知の注意事項

| 項目 | 詳細 |
|------|------|
| `NEXT_PUBLIC_*` 変数 | 変更後は必ず `npm run build` + `pm2 restart` が必要 |
| Python修正スクリプト | `grep -n` で実際の行を確認してから実行すること |
| TraceStatus値 | `ACTIVE` / `COMPLETED` / `TIMEOUT`（`CLOSED`は存在しない） |
| チケット種別APIキー | `バグ` / `改善` / `確認`（日本語のまま送信） |
| チケット優先度APIキー | `HIGH` / `MEDIUM` / `LOW` |

---

## 🚀 CMS アクセス

| URL | 用途 |
|-----|------|
| `http://192.168.1.11:3002` | CMS ログイン |
| `http://192.168.1.11:3002/projects/talon-mc/traces` | TraceID一覧 |
| `http://192.168.1.11:3002/projects/talon-mc/patterns` | パターン一覧 |
| `http://192.168.1.11:3002/projects/talon-mc/issues` | チケット一覧 |

**認証情報**: username: `admin` / password: `admin1234`

---

## 🔧 バージョン履歴

### SDK (tlog-sdk.min.js)

| バージョン | 変更内容 |
|-----------|----------|
| v1.0 | 初版 |
| v1.1 | TLogAutoInstrument Proxy対応・旧API互換 |
| v1.2 | `autoStart` オプション追加・ログキュー実装 |

### システム

| Phase | 主な実装内容 |
|-------|-------------|
| Phase 1〜4 | 基盤構築・認証・APIキー・CMS基本機能 |
| Phase 5〜8 | SDK高度化・タイムライン・スクリーンショット表示 |
| Phase 9 | consoleLogs表示・蛇行タイムライン・ScreenNav |
| Phase 10 | seqNo削除・リナンバリング・パターンUI改善 |
| Phase 11 | チケット発行・チケット管理・重複ログ削除・スクロール分離 |

---

*karkyon / log-server — TLog APEX 操作ログ収集・課題可視化システム*