# 🔍 log-server — TLog 操作ログ収集・課題可視化システム

> **karkyon/log-server**  
> TALON ローコードプラットフォーム上の各画面から操作ログ・スクリーンショットを自動収集し、GitHub Actions で課題ダッシュボード・アクションレビュー HTML を自動生成するシステム。

---

## 📌 概要

TALON（JSF/PrimeFaces ベース）で開発中のマシニング加工管理システム（22機能・約25画面）において、各画面の動作課題を体系的に把握するために構築されたログ収集・可視化基盤。

**主な目的:**
- どのボタンを・どの条件で・何が起きたか を完全記録
- ルールベース（Claude API 不使用）でログを自動解析し課題を抽出
- 課題にスクリーンショットを紐づけてプレビュー可能なダッシュボードを自動生成
- GitHub Actions・GitHub Pages で CI/CD を完結

---

## 🏗️ システム構成

```
karkyon/log-server/
├── server.js                          # Node.js ログ受信サーバ v2.2（ポート: 3099）
├── talon_testcase_logger.js           # クライアントサイドロガー v2.3
├── scripts/
│   ├── analyze-logs.js                # ルールベース課題抽出（R01〜R11）
│   ├── generate-dashboard.js          # 課題ダッシュボード HTML 生成
│   └── generate-review.js            # アクションレビュー HTML 生成
├── .github/workflows/
│   ├── analyze-issues.yml             # logs Push 時に自動実行
│   └── generate-review.yml           # レビュー HTML 自動生成
├── logs/
│   ├── features/<featureId>.jsonl            # 操作ログ（UI_CLICK, SCREEN_LOAD 等）
│   ├── features/<featureId>.console.jsonl   # コンソールログ（v2.2 追加）
│   └── screenshots/<featureId>/            # スクリーンショット（JPG）
└── docs/
    ├── issues/index.html              # 課題ダッシュボード（GitHub Pages 公開）
    └── review/index.html             # アクションレビュー（GitHub Pages 公開）
```

### インフラ構成

| 役割 | ホスト | 詳細 |
|------|--------|------|
| ログ受信サーバ | Ubuntu: `192.168.1.11:3099` | `server.js` を常時起動 |
| TALON クライアント | `192.168.1.207` | 各画面 JS の先頭にロガーを組み込み |
| CI/CD | GitHub Actions | logs Push → 自動解析・HTML 生成 |
| 公開 URL | GitHub Pages | `https://karkyon.github.io/log-server/docs/review/` |

---

## ⚡ 自動化フロー

```
TALON 画面操作
    ↓ (操作ログ・スクショ POST)
server.js (192.168.1.11:3099)
    ↓ (logs/ に保存)
git push origin main
    ↓
analyze-issues.yml 起動（Claude API 不使用・完全ルールベース）
    ↓
docs/issues/index.html 更新
    ↓
generate-review.yml 自動連鎖
    ↓
docs/review/index.html 更新（スクショ 105枚統合）
    ↓
GitHub Pages で閲覧可能
```

---

## 📡 server.js API エンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/log` | 操作ログ受信 → `.jsonl` 保存 |
| POST | `/screenshot` | スクリーンショット受信・保存 |
| POST | `/consolelog` | コンソールログ受信 → `.console.jsonl` 保存 |
| GET | `/consolelogs/:featureId` | コンソールログ取得 |
| GET | `/features` | 記録済み機能 ID 一覧 |
| GET | `/logs/:featureId` | 機能ログ取得 |
| GET | `/clean` | 全ログ削除（開発用のみ） |
| GET | `/ping` | 死活確認 |

---

## 🎯 talon_testcase_logger.js — 各画面への組み込み方法

各 TALON 画面の JavaScript 先頭に `talon_testcase_logger.js` を貼り付け、  
`resizeContents_end()` の末尾に以下を追加するだけで自動計装が有効になります。

```javascript
function resizeContents_end() {
  // --- 既存の処理 ---

  // ✅ ログ収集の起点（スクリーンショットもここで取得）
  TLog.screenLoad('MC_XXXX', '画面名');

  // ✅ 全 UI 要素への自動 addEventListener 付与
  TLogAutoInstrument.init('MC_XXXX', { screenMode: 'search' });
}
```

**screenMode の選択肢:** `search` / `edit` / `create` / `auth` / `list` / `report`

### 記録されるログ種別

| type | 内容 |
|------|------|
| `SCREEN_LOAD` | 画面表示（URL パラメータ・前画面 URL を含む） |
| `UI_CLICK` | ボタン操作（要素 ID・ラベル・フォーム入力値・行データ） |
| `BACKEND` | REST API 呼び出し結果 |
| `ERROR` | JS 例外・リソース読み込みエラー（window.onerror / capture） |
| `SCREENSHOT` | Before/After スクリーンショット（traceId で紐づけ） |

---

## 🔎 課題検出ルール（R01〜R11）

`analyze-logs.js` が以下のルールでログを自動解析します。Claude API は一切使用しません。

| ルール | 検出内容 | 重大度 |
|--------|----------|--------|
| R01 | ERROR ログ直接検出 | Critical |
| R02 | `featureId=UNKNOWN`（ロガー初期化ミス） | High |
| R03 | 1ms 以内のボタン重複記録（addEventListener 重複バインド） | High |
| R04 | 検索実行後に BACKEND ログなし（API 呼び出し失敗） | High |
| R05 | SCREEN_LOAD から次操作まで極端な無応答時間 | Medium |
| R06 | 同一 elementId への連続クリック（デバウンス不備） | Medium |
| R07 | モード遷移後の予期しない SCREEN_LOAD（意図しないリロード） | Medium |
| R08 | フォーム入力値がすべて空での送信 | Low |
| R09 | セッション内の ERROR 比率が高い | Medium |
| R10 | UI_CLICK 件数が極端に少ない（ロガー未動作） | Low |
| R11 | screenMode 未設定（`init()` 引数不足） | Low |

**優先度スコア算出式:**  
`PriorityScore = (重大度 × 40) + (再現性 × 20) + (頻度 × 20) + (信頼度 × 20)`

---

## 📊 生成ドキュメント

### 課題ダッシュボード

`https://karkyon.github.io/log-server/docs/issues/`

- 機能別・重大度別フィルター
- 課題ごとのスクリーンショットプレビュー
- 修正提案の自動生成
- 優先度スコアによるランキング

### アクションレビュー

`https://karkyon.github.io/log-server/docs/review/`

- traceId 単位のシーケンス（操作フロー）可視化
- コンソールログと操作ログの統合表示
- 作業パターン登録・管理機能
- 画面フィルター・スクリーンショット105枚統合

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

## 🔧 バージョン履歴

### talon_testcase_logger.js

| バージョン | 変更内容 |
|-----------|----------|
| v2.0 | URLパラメータ・前画面 URL・JS 例外・Before/After スクショ追加 |
| v2.1 | `_capture()` で featureId を POST body に含める / SHOT エントリ二重記録排除 |
| v2.2 | console キャプチャ機能追加 / `_lastTraceId` による操作相関 |
| **v2.3** | `window.onerror` → `/consolelog` 送信・リソースエラーキャプチャ・シリアライザ強化 |

### server.js

| バージョン | 変更内容 |
|-----------|----------|
| v2.0 | featureId 別保存・スクリーンショット API |
| v2.1 | スクリーンショット保存パス修正 |
| **v2.2** | `/consolelog` エンドポイント追加・`/consolelogs/:featureId` 追加 |

---

## 🚀 セットアップ

### サーバー起動（Ubuntu: 192.168.1.11）

```bash
cd ~/projects/log-server
node server.js -d

# 動作確認
curl http://192.168.1.11:3099/ping
```

### GitHub Actions 手動実行

```
Actions タブ → 「問題課題 自動解析」→ Run workflow
Actions タブ → 「アクションレビュー HTML 生成」→ Run workflow
```

### よく使う確認コマンド

```bash
# console.jsonl の最新5件
tail -5 ~/projects/log-server/logs/features/MC_PRODUCTS_LIST.console.jsonl

# リアルタイム監視
tail -f ~/projects/log-server/logs/features/MC_PRODUCTS_LIST.console.jsonl

# エラーログ抽出
grep '"level":"error"' logs/features/MC_PRODUCTS_LIST.console.jsonl | tail -10

# 全ログリセット（テスト前）
curl http://192.168.1.11:3099/clean
```

---

## ⚠️ 既知の問題・注意事項

| 問題 | 詳細 | 対応状況 |
|------|------|----------|
| `/consolelog` 500 エラー | `192.168.1.11:3099/consolelog` が 500 を返す場合がある | 調査中 |
| 無限ループリスク | fetch 失敗 → console.error → キャプチャ → 再送信 の循環 | 未適用（対策コードあり） |
| `IGNORE_ID_PATTERNS` 不一致 | `1_閲覧_0` 〜 `1_編集_6` が TLN_ プレフィックスなしで存在 | 未適用（修正コードあり） |

**無限ループ防止コード（talon_testcase_logger.js に追加予定）:**

```javascript
console[level] = function (...args) {
  native(...args);
  // サーバー URL を含む出力はスキップ（無限ループ防止）
  if (args.some(a => typeof a === 'string' && a.includes('192.168.1.11:3099'))) return;
  // ...
};
```

---

## 🗺️ 今後の予定

- [ ] 機能仕様書の自動生成（Claude API 経由・各画面の HTML ドキュメント）
- [ ] エンドユーザー向け操作マニュアルの自動生成
- [ ] Next.js + NestJS への移行対応（MC-REBUILD-001）
- [ ] IGNORE_ID_PATTERNS 修正の適用
- [ ] 無限ループ防止コードの適用

---

*karkyon / log-server — TALON テストログ自動収集・課題可視化システム*
