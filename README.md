# 🔍 log-server — TLog NEXT 操作ログ収集・課題可視化システム

> **karkyon/log-server**  
> TALON ローコードプラットフォーム上の各画面から操作ログ・スクリーンショットを自動収集し、  
> CMS（Next.js）上でアクションレビュー HTML を生成するシステム。

---

## 📌 概要

TALON（JSF/PrimeFaces ベース）で開発中のマシニング加工管理システム（22機能・約25画面）において、  
各画面の動作課題を体系的に把握するために構築されたログ収集・可視化基盤。

**主な目的:**
- どのボタンを・どの条件で・何が起きたか を完全記録
- CMS 上でTraceID別に「アクションレビュー HTML」を生成
- パターン登録・課題管理をCMSで一元管理

---

## 🏗️ システム構成

```
karkyon/log-server/
├── apps/
│   ├── api/                          # NestJS APIサーバー (port: 3099)
│   │   └── src/
│   │       ├── sdk/                  # SDK受信エンドポイント群
│   │       ├── traces/               # TraceID管理・ログ取得
│   │       ├── patterns/             # パターン登録・管理
│   │       ├── review/               # アクションレビューHTML生成
│   │       └── apikeys/              # APIキー発行・認証
│   └── cms/                          # Next.js CMS (port: 3002)
│       └── app/projects/[id]/
│           ├── traces/               # TraceID一覧・詳細
│           ├── patterns/             # パターン一覧・蛇行タイムライン
│           ├── issues/               # 課題チケット一覧
│           └── apikeys/              # APIキー管理
├── public/
│   └── tlog-sdk.min.js               # クライアントSDK (配信: /assets/tlog-sdk.min.js)
├── scripts/
│   └── generate-review.js            # アクションレビューHTML生成スクリプト
├── prisma/
│   └── schema.prisma                 # DBスキーマ（LogVerdict含む）
└── docs/
    └── review/index.html             # 生成済みレビューHTML
```

### インフラ構成

| 役割 | ホスト | 詳細 |
|------|--------|------|
| API / SDKサーバー | `192.168.1.11:3099` | NestJS (pm2 id:0) |
| CMS | `192.168.1.11:3002` | Next.js (pm2 id:1) |
| DB | `192.168.1.11:5434` | PostgreSQL |
| TALON クライアント | `192.168.1.207` | SDK組み込み済み |

---

## ⚡ システムフロー

```
TALON 画面操作
    ↓ (SDK 自動送信)
POST /sdk/log  →  NestJS API (192.168.1.11:3099)
    ↓
PostgreSQL に蓄積 (traces / logs / screenshots)
    ↓
CMS: http://192.168.1.11:3002/projects/[id]/traces
    ↓ [📄 アクションレビュー生成] ボタンをKICK
POST /api/projects/:id/traces/:traceId/generate-review
    ↓
review.service.ts → generate-review.js 実行
    ↓
HTML レビュー資料をブラウザで表示  ← システムの最大目的
```

---

## 🎯 SDK 組み込み方法

### ① 共通ライブラリへの追加（1回だけ）

全ページ共通のヘッダー・CSS共通ファイルの末尾に追加するだけ。

```html
<script src="http://192.168.1.11:3099/assets/tlog-sdk.min.js"></script>
<script>
TLog.init({
  apiKey: 'ak_xxxxxxxxxxxxxxxxxxxxxxxx',  // CMSのAPIキー管理画面で発行
  serverUrl: 'http://192.168.1.11:3099',
  projectId: 'your-project-id',           // CMS上のプロジェクトslug
  autoStart: true,                        // ページロード時に自動でTrace開始
});
</script>
```

**`autoStart: true` を指定するだけで以下が自動的に動作します:**
- ページロード時に `startTrace()` を自動呼び出し
- `startTrace()` 完了前に呼ばれたログを内部キューに蓄積し、完了後に自動送信

### ② 各ページ側（変更不要 or 最小追加）

**既存コードはそのままで動作します。**  
`TLog.log()` / `TLog.screenLoad()` / `TLog.action()` は `autoStart` 完了前に呼ばれても  
内部キューに保持され、TraceID取得後に自動送信されます。

```javascript
// レンダリング後の初期化処理（既存コードのまま）
TLog.log('SCREEN_LOAD', 'MC_PRODUCTS_LIST', '', {label: 'マシニング部品一覧'});
TLog.screenLoad('MC_PRODUCTS_LIST', 'マシニング部品一覧');
// TLog.bootstrap({}) は no-op なので削除可
```

**ボタン操作ログ（任意）:**

```javascript
// クリックイベントに追加
TLog.action('MC_PRODUCTS_LIST', 'btn_search', { label: '検索' });
TLog.action('MC_PRODUCTS_LIST', 'btn_register', { label: '登録' });
```

### ③ テスト終了ボタン

```javascript
// 「テスト終了」ボタンの onclick に追加
TLog.stopTrace().then(function() {
  console.log('[TLog] Trace終了 traceId=' + TLog.getTraceId());
  // 既存の終了処理...
});
```

### TALON 特有の注意事項

TALONは JSF の `resizeContents_end()` レンダリング完了後にJSが実行される。  
`autoStart: true` のキュー機能により、実行順序の問題は自動解決されます。

```javascript
function resizeContents_end() {
  // 既存処理...

  // ↓ これだけ追加（autoStart のキューで確実に送信される）
  TLog.screenLoad('MC_XXXX', '画面名');
  TLogAutoInstrument.init('MC_XXXX', { screenMode: 'list' });
}
```

---

## 📡 API エンドポイント一覧

### SDK用（APIキー認証: `x-api-key` ヘッダー）

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
| POST | `/api/projects/:id/traces/:traceId/generate-review` | レビューHTML生成 |
| PUT | `/api/projects/:id/traces/:traceId/logs/:logId/verdict` | 判定（OK/NG）保存 |
| GET/POST | `/api/projects/:id/patterns` | パターン一覧・登録 |
| DELETE | `/api/projects/:id/patterns/:patternId` | パターン削除 |
| GET/POST | `/api/projects/:id/apikeys` | APIキー一覧・発行 |
| DELETE | `/api/projects/:id/apikeys/:keyId` | APIキー無効化 |

---

## 🔎 SDK メソッド一覧

```javascript
// 初期化（共通ライブラリで1回）
TLog.init({ apiKey, serverUrl, projectId, autoStart })

// Trace制御
TLog.startTrace({ userId, label, meta })  // autoStart:true なら不要
TLog.stopTrace()                           // テスト終了時に呼ぶ
TLog.getTraceId()                          // 現在のtraceIdを取得

// ログ送信（autoStartのキューで順序保証）
TLog.log(eventType, screenName, elementId, payload)
TLog.screenLoad(screenId, screenName)      // SCREEN_LOAD ショートカット
TLog.action(screenId, elementId, payload)  // ACTION ショートカット
TLog.screenCapture(screenId, label)        // SCREENSHOT ショートカット

// 未定義メソッド → Proxyで自動吸収（既存コードのエラーなし）
```

    // ロガー
    TLogAutoInstrument.init(screenId, { screenName: screenName });

		// ロガー
		TLogAutoInstrument.init('SC_ID', { screenName: 'SC_NAME'});

		## TALONでの呼出位置・方法
    var isValid = true;
    function resizeContents_end(){

      if (isValid){

          // ロガー
          TLogAutoInstrument.init('MC_MACHINING', { screenName: 'マシニング情報管理画面'});

      }
      isValid = false;
    }
---

## 🗂️ 対応画面（20画面）

| 機能 ID | 画面名 |
|---------|--------|
| `MC_MACHINING_INFO` | マシニング情報管理（最重要・4ブロック構成） |
| `MC_PRODUCTS_LIST` | 部品一覧 |
| `MC_EQUIPMENT_LIST` | 設備一覧 |
| `MC_DRAWING_LIST` | 図面一覧 |
| `MC_PHOTO_LIST` | 写真一覧 |
| `MC_SETUP_SHEET_ISSUE` | 段取シート発行（リピート） |
| `MC_SETUP_SHEET_BACK` | 段取シートバック |
| `MC_RAW_CLAW_EDIT` | 生爪編集・段取シート一覧 |
| `MC_RAW_CLAW_SEARCH` | 生爪検索 |
| `MC_TOOLING_EDIT_BASIC` | ツーリング編集（基本） |
| `MC_TOOLING_EDIT_DETAIL` | ツーリング編集（詳細） |
| `MC_INFO_UPDATE_CONFIRM` | 情報更新内容確認 |
| `MC_WORK_RESULT_LIST` | 作業実績登録一覧 |
| `MC_WORK_RESULT_REGISTER` | 作業実績登録 |
| `MC_WORK_OFFSET` | ワークオフセット・設備稼働実績 |
| `MC_INDEX_PROGRAM_EDIT` | インデックスプログラム編集 |
| `MC_SP_SETUP_NOTIFY` | SP段取シート通知 |
| `MC_SYSTEM_OPERATION_LOG` | システム操作履歴 |
| `MC_USER_AUTH` | ユーザー認証 |
| `MC_OPERATOR_AUTHENTICATION` | オペレーター認証 |

---

## ⌘ よく使うコマンド

```bash
# サービス状態確認
pm2 status

# ログ確認（リアルタイム）
pm2 logs tlog-api
pm2 logs tlog-cms

# ビルド＆デプロイ
cd ~/projects/log-server/apps/cms && npm run build && pm2 restart tlog-cms
cd ~/projects/log-server/apps/api && npm run build && pm2 restart tlog-api

# DB直接確認
psql -U tlog -d tlogdb -h 127.0.0.1 -p 5434 \
  -c "SELECT id, project_id, status, started_at FROM traces ORDER BY started_at DESC LIMIT 5;"

# SDK疎通テスト
curl -s -X POST http://localhost:3099/sdk/trace/start \
  -H "x-api-key: ak_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"your-project","operatorId":"test"}' | python3 -m json.tool
```

### エイリアス（~/.bashrc に追加済み）

```bash
alias tlog-status='pm2 status'
alias tlog-restart='pm2 restart all'
alias tlog-deploy-cms='cd ~/projects/log-server/apps/cms && npm run build && pm2 restart tlog-cms'
alias tlog-deploy-api='cd ~/projects/log-server/apps/api && npm run build && pm2 restart tlog-api'
alias tlog-db='psql -U tlog -d tlogdb -h 127.0.0.1 -p 5434'
```

---

## 🔧 バージョン履歴

### tlog-sdk.min.js

| バージョン | 変更内容 |
|-----------|----------|
| v1.0 | 初版 |
| v1.1 | TLogAutoInstrument Proxy対応・旧API互換 |
| **v1.2** | `autoStart` オプション追加・ログキュー実装（startTrace完了前のログを自動保留→フラッシュ） |

### talon_testcase_logger.js（旧SDK・参照用）

| バージョン | 変更内容 |
|-----------|----------|
| v2.0 | URLパラメータ・前画面 URL・JS 例外・Before/After スクショ追加 |
| v2.3 | console キャプチャ機能・リソースエラーキャプチャ |

---

## ⚠️ 既知の注意事項

| 項目 | 詳細 |
|------|------|
| `NEXT_PUBLIC_*` 変数 | 変更後は必ず `npm run build` + `pm2 restart` が必要 |
| Python置換スクリプト | `grep -n` で実際の文字列を確認してから実行すること |
| `overflow: hidden` + `visible` 共存不可 | `overflowX`/`overflowY` を個別指定で回避 |
| TraceStatus値 | `ACTIVE` / `COMPLETED` / `TIMEOUT` / `ERROR`（`CLOSED`は存在しない） |

---

## 🚀 CMS アクセス

| URL | 用途 |
|-----|------|
| `http://192.168.1.11:3002` | CMS ログイン |
| `http://192.168.1.11:3002/projects/talon-mc/traces` | TraceID一覧 |
| `http://192.168.1.11:3002/projects/talon-mc/patterns` | パターン一覧 |

**認証情報**: username: `admin` / password: `admin1234`

---

*karkyon / log-server — TLog NEXT 操作ログ収集・課題可視化システム*