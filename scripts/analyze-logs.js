#!/usr/bin/env node
/* =============================================================================
   scripts/analyze-logs.js  v2.0
   変更履歴:
     v1.0 - 初版（R01〜R10）
     v2.0 - [新機能] context フィールド解析（urlParams/callerScreen/screenMode）
            [新機能] screenshots[] の自動紐付け
            [新機能] contextSummary（操作文脈）を各 issue に付与
            [新機能] R11: 画面モード未設定検出
            [修正]  featureId を issue オブジェクトに明示的に格納
            ※ ルール関数は v1.0 の個別関数構造を維持（保守性のため）
   =============================================================================*/

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const FEAT_DIR = path.join(ROOT, 'logs', 'features');
const SS_DIR   = path.join(ROOT, 'logs', 'screenshots');
const OUT_DIR  = path.join(ROOT, 'docs', 'issues');

// ─── 画面ID → 日本語名マッピング ──────────────────────────────────────────────
const SCREEN_NAMES = {
  MC_DRAWING_LIST         : '図面一覧',
  MC_INDEX_EDIT           : 'インデックスプログラム編集',
  MC_EQUIPMENT_LIST       : '設備一覧',
  MC_MACHINING_DETAIL     : 'マシニング情報管理',
  MC_HISTORY              : 'システム操作履歴',
  MC_PRODUCTS_LIST        : '部品一覧',
  MC_PHOTO_LIST           : '写真一覧',
  MC_SETUP_SHEET_BACK     : '段取シートバック',
  MC_SETUP_SHEET_ISSUE    : '段取シート発行（リピート）',
  MC_RAW_CLAW_SEARCH      : '生爪検索',
  MC_SP_SETUP_NOTIFY      : 'SP段取シート通知',
  MC_TOOLING_BASIC        : 'ツーリング編集（基本版）',
  MC_TOOLING_DETAIL       : 'ツーリング編集（詳細版）',
  MC_INFO_UPDATE_CONFIRM  : '情報更新内容確認',
  MC_USER_AUTH            : 'ユーザ認証',
  MC_WORK_RECORD_LIST     : '作業実績登録一覧',
  MC_WORK_RECORD          : '作業実績登録',
  MC_WORK_OFFSET          : 'ワークオフセット・設備稼働実績',
  MC_RAW_CLAW_EDIT        : '生爪編集・段取シート一覧',
  UNKNOWN                 : '（未分類：ロガー初期化ミス）'
};

// ─── 重大度の重み ──────────────────────────────────────────────────────────────
const SEVERITY_WEIGHT = { Critical: 1.0, High: 0.8, Medium: 0.5, Low: 0.2 };

// ─── 再現性の重み ──────────────────────────────────────────────────────────────
const REPRO_WEIGHT = { Always: 1.0, Likely: 0.75, Sometimes: 0.5, Unknown: 0.3 };

// ─── 課題カテゴリ定義 ─────────────────────────────────────────────────────────
const CATEGORY = {
  ERROR              : 'ERRORログ検出',
  UNKNOWN_FEATURE    : 'ロガー初期化ミス（UNKNOWN featureId）',
  DUPLICATE_BIND     : 'ボタン重複バインド',
  SEARCH_UNAVAILABLE : '検索結果取得不可',
  API_NOT_CALLED     : 'ボタン押下後API無応答',
  RAPID_BACK         : '戻るボタン連打（重複実行）',
  DUPLICATE_LOAD     : '画面重複ロード',
  BACKEND_FAILURE    : 'バックエンド処理失敗',
  FORM_RESIDUAL      : 'クリア後フォーム値残存',
  LOW_LOG_COVERAGE   : 'ログ取得量過少（操作記録不十分）',
  NO_SCREEN_MODE     : '画面モード未設定（v2.0以前のinit()）'
};

// =============================================================================
//   ユーティリティ
// =============================================================================

let _issueCounter = 0;
function newIssueId(featureId) {
  _issueCounter++;
  return `${featureId}-${String(_issueCounter).padStart(3, '0')}`;
}

/** JSONL 読み込み */
function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/** タイムスタンプ差分（ms） */
function timeDiffMs(tsA, tsB) {
  return Math.abs(new Date(tsB) - new Date(tsA));
}

/** 優先度スコア算出（0〜100） */
function calcPriorityScore(severity, reproducibility, frequency, confidence) {
  const sw = SEVERITY_WEIGHT[severity]     || 0.3;
  const rw = REPRO_WEIGHT[reproducibility] || 0.3;
  return Math.round((sw * 40) + (rw * 20) + (frequency * 20) + (confidence * 20));
}

/** 難易度推定（カテゴリから機械的に割り当て） */
function estimateDifficulty(category) {
  const map = {
    ERROR              : 'High',
    UNKNOWN_FEATURE    : 'Low',
    DUPLICATE_BIND     : 'High',
    SEARCH_UNAVAILABLE : 'Medium',
    API_NOT_CALLED     : 'High',
    RAPID_BACK         : 'Medium',
    DUPLICATE_LOAD     : 'Medium',
    BACKEND_FAILURE    : 'High',
    FORM_RESIDUAL      : 'Low',
    LOW_LOG_COVERAGE   : 'Low',
    NO_SCREEN_MODE     : 'Low'
  };
  return map[category] || 'Medium';
}

// =============================================================================
//   v2.0 追加ユーティリティ
// =============================================================================

/** スクリーンショットファイル一覧を取得（featureId 単位） */
function getScreenshotFiles(featureId) {
  const dir = path.join(SS_DIR, featureId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => `logs/screenshots/${featureId}/${f}`);
}

/**
 * traceId に紐付くスクショを取得
 * ① SCREENSHOT エントリの file フィールドから探す
 * ② なければファイル名の中に traceId を含むものを探す
 */
function findScreenshots(featureId, traceId, logs) {
  const fromLog = logs
    .filter(e => e.type === 'SCREENSHOT' && e.traceId === traceId)
    .map(e => e.file)
    .filter(Boolean);
  if (fromLog.length > 0) return fromLog;

  if (!traceId) return [];
  return getScreenshotFiles(featureId).filter(f => f.includes(traceId));
}

/**
 * 操作文脈サマリを生成（ダッシュボード表示用）
 * ログエントリの context + inputValues から人間が読めるテキストを生成
 */
function buildContextSummary(entry) {
  if (!entry) return '';
  const c    = entry.context || {};
  const parts = [];

  if (c.screenMode && c.screenMode !== 'unknown') parts.push(`モード=${c.screenMode}`);
  if (c.callerScreen) parts.push(`前画面=${c.callerScreen}`);

  const urlStr = Object.entries(c.urlParams || {})
    .filter(([k]) => !/^j_idt|faces/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => `${k}:${String(v).slice(0, 20)}`)
    .join(', ');
  if (urlStr) parts.push(`URL=${urlStr}`);

  const snapStr = Object.entries(entry.inputValues?.formSnapshot || {})
    .filter(([, v]) => v)
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/CNDTN_STD:\d+:/,'').replace(/_TEXT|_SEL/,'')}=${String(v).slice(0,15)}`)
    .join(', ');
  if (snapStr) parts.push(`入力値=${snapStr}`);

  return parts.join(' / ');
}

// =============================================================================
//   検出ルール R01〜R11（v1.0の個別関数構造を維持・v2.0機能追加）
// =============================================================================

/**
 * R01: ERRORログ検出
 * type === 'ERROR' のエントリが存在すればそのまま問題として登録
 */
function detectR01_Error(featureId, logs) {
  return logs.filter(e => e.type === 'ERROR').map(e => ({
    ruleId          : 'R01',
    category        : 'ERROR',
    severity        : 'Critical',
    reproducibility : 'Always',
    description     : `ERRORログを検出: ${e.message || '(メッセージなし)'}`,
    logEvidence     : `type=ERROR / screenId=${e.screenId} / ts=${e.ts}` +
                      (e.detail ? ` / detail=${JSON.stringify(e.detail).slice(0, 80)}` : ''),
    fixSuggestion   : 'エラーメッセージと発生時のスタックトレースを確認。JSコンソールと合わせて原因を特定してください。',
    confidence      : 0.99,
    frequency       : 1.0,
    occurrences     : 1,
    relatedTraceId  : e.traceId || null,
    screenshots     : findScreenshots(featureId, e.traceId, logs),
    contextSummary  : buildContextSummary(e),
    relatedTs       : e.ts
  }));
}

/**
 * R02: UNKNOWN featureId
 * featureId === 'UNKNOWN' はロガー初期化前にイベントが発生している証拠
 */
function detectR02_UnknownFeature(featureId, logs) {
  if (featureId !== 'UNKNOWN') return [];
  const count = logs.length;
  return [{
    ruleId          : 'R02',
    category        : 'UNKNOWN_FEATURE',
    severity        : 'High',
    reproducibility : 'Always',
    description     : `TLogAutoInstrument.init() 呼び出し前にログが記録されています（${count}件）`,
    logEvidence     : `logs/features/UNKNOWN.jsonl に ${count} 件のログが存在`,
    fixSuggestion   : 'resizeContents_end() 内の TLogAutoInstrument.init(featureId) が正しい featureId で呼ばれているか確認してください。',
    confidence      : 0.95,
    frequency       : 1.0,
    occurrences     : count,
    relatedTraceId  : null,
    screenshots     : [],
    contextSummary  : '',
    relatedTs       : logs[0]?.ts || null
  }];
}

/**
 * R03: ボタン重複バインド
 * 同一 elementId が 10ms 以内に 2件以上 UI_CLICK として記録されている
 */
function detectR03_DuplicateBind(featureId, logs) {
  const issues  = [];
  const clicks  = logs.filter(e => e.type === 'UI_CLICK');
  const byElement = {};

  clicks.forEach(e => {
    if (!byElement[e.elementId]) byElement[e.elementId] = [];
    byElement[e.elementId].push(e);
  });

  Object.entries(byElement).forEach(([elementId, events]) => {
    if (events.length < 2) return;
    for (let i = 1; i < events.length; i++) {
      const diff = timeDiffMs(events[i-1].ts, events[i].ts);
      if (diff <= 10) {
        issues.push({
          ruleId          : 'R03',
          category        : 'DUPLICATE_BIND',
          severity        : 'High',
          reproducibility : 'Always',
          description     : `要素 "${elementId}" が ${diff}ms 以内に ${events.length} 回連続記録（重複バインドの疑い）`,
          logEvidence     : `elementId=${elementId} / 発生: ${events[0].ts} / 差分: ${diff}ms`,
          fixSuggestion   : 'addEventListener が複数回呼ばれていないか確認。resizeContents_end の isValid フラグや、changeButtonStyle() の呼び出し回数を見直してください。',
          confidence      : 0.9,
          frequency       : 1.0,
          occurrences     : events.length,
          relatedTraceId  : events[0].traceId || null,
          screenshots     : findScreenshots(featureId, events[0].traceId, logs),
          contextSummary  : buildContextSummary(events[0]),
          relatedTs       : events[0].ts
        });
        break;
      }
    }
  });

  return issues;
}

/**
 * R04: 検索結果 取得不可
 * BACKEND processName=SEARCH_RESULT で resultCount が「取得不可」
 */
function detectR04_SearchUnavailable(featureId, logs) {
  const results = logs.filter(e =>
    e.type === 'BACKEND' && e.processName === 'SEARCH_RESULT' && e.resultCount === '取得不可'
  );
  if (results.length === 0) return [];

  // 直近の検索ボタンクリックを探してスクショを紐付け
  const searchClick = logs.find(e =>
    e.type === 'UI_CLICK' && /SEARCH/i.test(e.elementId || '')
  );

  return [{
    ruleId          : 'R04',
    category        : 'SEARCH_UNAVAILABLE',
    severity        : 'Medium',
    reproducibility : 'Always',
    description     : `検索結果件数が取得できていません（${results.length}回発生）。DOM上に件数要素が存在しないか、CSSセレクタが一致していない可能性があります。`,
    logEvidence     : `processName=SEARCH_RESULT / resultCount="取得不可" / ${results.length}回`,
    fixSuggestion   : 'talon_testcase_logger.js の logSearchResult() 内セレクタ（.ui-paginator-current等）がTALONの実際のDOM構造と一致しているか確認してください。',
    confidence      : 0.85,
    frequency       : results.length >= 3 ? 1.0 : results.length === 2 ? 0.7 : 0.4,
    occurrences     : results.length,
    relatedTraceId  : searchClick?.traceId || null,
    screenshots     : findScreenshots(featureId, searchClick?.traceId, logs),
    contextSummary  : buildContextSummary(searchClick),
    relatedTs       : results[0]?.ts || null
  }];
}

/**
 * R05: ボタン押下後BACKEND無応答
 * BTN_CLICKのうちSEARCH/SAVE/UPDATE/REGISTERを含むものの後、
 * 3秒以内に BACKEND ログが続かない場合
 */
function detectR05_ApiNotCalled(featureId, logs) {
  const issues = [];
  const actionKeywords = /SEARCH|SAVE|UPDATE|REGIST|ISSUE|EXEC|SEND|COMMIT/i;

  const actionClicks = logs.filter(e =>
    e.type === 'UI_CLICK' &&
    e.inputValues?.elementType === 'BUTTON' &&
    (actionKeywords.test(e.elementId || '') || actionKeywords.test(e.label || ''))
  );

  actionClicks.forEach(click => {
    const backend = logs.find(e =>
      e.type === 'BACKEND' &&
      e.ts > click.ts &&
      timeDiffMs(click.ts, e.ts) <= 3000 &&
      e.processName !== 'INITIAL_SNAPSHOT'
    );

    if (!backend) {
      issues.push({
        ruleId          : 'R05',
        category        : 'API_NOT_CALLED',
        severity        : 'High',
        reproducibility : 'Likely',
        description     : `ボタン "${click.inputValues?.buttonLabel || click.elementId}" クリック後、3秒以内にBACKENDログが記録されていません（REST API未実行の可能性）`,
        logEvidence     : `UI_CLICK: elementId=${click.elementId} / ts=${click.ts} → 後続BACKEND=なし`,
        fixSuggestion   : 'JSのイベントハンドラが正しくバインドされているか、PrimeFaces AJAXのリクエストが送信されているかブラウザのNetworkタブで確認してください。',
        confidence      : 0.75,
        frequency       : 0.6,
        occurrences     : 1,
        relatedTraceId  : click.traceId || null,
        screenshots     : findScreenshots(featureId, click.traceId, logs),
        contextSummary  : buildContextSummary(click),
        relatedTs       : click.ts
      });
    }
  });

  return issues;
}

/**
 * R06: BACK_BUTTON連打（短時間内に3回以上）
 * BACK_BUTTON / BACK_BTN 系が 100ms 以内に 3回以上記録
 */
function detectR06_RapidBack(featureId, logs) {
  const backClicks = logs.filter(e =>
    e.type === 'UI_CLICK' && /BACK/i.test(e.elementId || '')
  ).sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (backClicks.length < 3) return [];

  const issues = [];
  for (let i = 2; i < backClicks.length; i++) {
    const diff = timeDiffMs(backClicks[i-2].ts, backClicks[i].ts);
    if (diff <= 100) {
      issues.push({
        ruleId          : 'R06',
        category        : 'RAPID_BACK',
        severity        : 'Medium',
        reproducibility : 'Always',
        description     : `戻るボタン（BACK系）が100ms以内に${backClicks.length}回記録されています（重複実行・二重遷移の可能性）`,
        logEvidence     : `BACK系クリック: ${backClicks.length}回 / 最初=${backClicks[0].ts} / 最後=${backClicks[backClicks.length-1].ts}`,
        fixSuggestion   : '戻るボタンにも重複実行防止フラグを設けるか、addEventListener のガード処理を追加してください。',
        confidence      : 0.85,
        frequency       : 1.0,
        occurrences     : backClicks.length,
        relatedTraceId  : backClicks[0].traceId || null,
        screenshots     : findScreenshots(featureId, backClicks[0].traceId, logs),
        contextSummary  : buildContextSummary(backClicks[0]),
        relatedTs       : backClicks[0].ts
      });
      break;
    }
  }

  return issues;
}

/**
 * R07: SCREEN_LOAD重複
 * 1秒以内に SCREEN_LOAD が2回以上記録されている
 */
function detectR07_DuplicateLoad(featureId, logs) {
  const loads = logs.filter(e => e.type === 'SCREEN_LOAD')
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (loads.length < 2) return [];

  const issues = [];
  for (let i = 1; i < loads.length; i++) {
    const diff = timeDiffMs(loads[i-1].ts, loads[i].ts);
    if (diff <= 1000) {
      issues.push({
        ruleId          : 'R07',
        category        : 'DUPLICATE_LOAD',
        severity        : 'Medium',
        reproducibility : 'Likely',
        description     : `SCREEN_LOADが${diff}ms以内に${loads.length}回記録されています（resizeContents_end の isValid フラグが機能していない可能性）`,
        logEvidence     : `SCREEN_LOAD: ${loads.length}回 / 最初=${loads[0].ts} / ${diff}ms後に再発`,
        fixSuggestion   : 'resizeContents_end() の isValid フラグによる二重実行防止が正しく機能しているか確認。TALONのリサイズイベントが複数回発火している可能性もあります。',
        confidence      : 0.8,
        frequency       : 0.7,
        occurrences     : loads.length,
        relatedTraceId  : loads[0].traceId || null,
        screenshots     : findScreenshots(featureId, loads[0].traceId, logs),
        contextSummary  : '',
        relatedTs       : loads[0].ts
      });
      break;
    }
  }

  return issues;
}

/**
 * R08: BACKEND処理失敗
 * type=BACKEND で status が SUCCESS 以外
 */
function detectR08_BackendFailure(featureId, logs) {
  return logs.filter(e =>
    e.type === 'BACKEND' && e.status && e.status !== 'SUCCESS'
  ).map(e => ({
    ruleId          : 'R08',
    category        : 'BACKEND_FAILURE',
    severity        : 'Critical',
    reproducibility : 'Likely',
    description     : `バックエンド処理「${e.processName}」が失敗しています（status=${e.status}）`,
    logEvidence     : `type=BACKEND / processName=${e.processName} / status=${e.status} / ts=${e.ts}`,
    fixSuggestion   : 'REST APIのレスポンスコードとエラーメッセージを確認してください。DBコネクション、権限、パラメータ不足などが原因として考えられます。',
    confidence      : 0.95,
    frequency       : 1.0,
    occurrences     : 1,
    relatedTraceId  : e.traceId || null,
    screenshots     : findScreenshots(featureId, e.traceId, logs),
    contextSummary  : buildContextSummary(e),
    relatedTs       : e.ts
  }));
}

/**
 * R09: クリア後フォーム値残存
 * クリアボタン押下後のフォームスナップショットに値が残っている
 */
function detectR09_FormResidual(featureId, logs) {
  const issues = [];
  const clearClicks = logs.filter(e =>
    e.type === 'UI_CLICK' && /CLEAR/i.test(e.elementId || '')
  );

  clearClicks.forEach(click => {
    const snap     = click.inputValues?.formSnapshot || {};
    const nonEmpty = Object.entries(snap).filter(([, v]) => v && v !== '');
    if (nonEmpty.length > 0) {
      issues.push({
        ruleId          : 'R09',
        category        : 'FORM_RESIDUAL',
        severity        : 'Low',
        reproducibility : 'Always',
        description     : `クリアボタン押下時点でフォームに値が残存しています（${nonEmpty.length}項目）。クリア処理のタイミング問題の可能性があります。`,
        logEvidence     : `CLEAR後のformSnapshot: ${JSON.stringify(Object.fromEntries(nonEmpty)).slice(0, 120)}`,
        fixSuggestion   : 'クリアボタンのAjax処理完了後のコールバックでフォームがリセットされているか確認してください。PrimeFaces の update 属性の設定を見直してください。',
        confidence      : 0.7,
        frequency       : 0.4,
        occurrences     : 1,
        relatedTraceId  : click.traceId || null,
        screenshots     : findScreenshots(featureId, click.traceId, logs),
        contextSummary  : buildContextSummary(click),
        relatedTs       : click.ts
      });
    }
  });

  return issues;
}

/**
 * R10: ログ取得量過少
 * SCREEN_LOADはあるが UI_CLICK が5件未満のケース
 */
function detectR10_LowCoverage(featureId, logs) {
  const hasLoad  = logs.some(e => e.type === 'SCREEN_LOAD');
  const clicks   = logs.filter(e => e.type === 'UI_CLICK').length;
  const backends = logs.filter(e => e.type === 'BACKEND' && e.processName !== 'INITIAL_SNAPSHOT').length;

  if (!hasLoad) return [];
  if (clicks >= 5 || backends >= 2) return [];

  return [{
    ruleId          : 'R10',
    category        : 'LOW_LOG_COVERAGE',
    severity        : 'Low',
    reproducibility : 'Unknown',
    description     : `ログ量が過少です（UI操作=${clicks}件 / BACKEND=${backends}件）。TLogAutoInstrument.init() が正しく機能していないか、この画面の操作テストが不十分な可能性があります。`,
    logEvidence     : `SCREEN_LOAD=あり / UI_CLICK=${clicks}件 / BACKEND(非snapshot)=${backends}件`,
    fixSuggestion   : 'この画面でロガーが正しく動作しているかブラウザコンソールで確認し、全操作をテストしてください。',
    confidence      : 0.6,
    frequency       : 0.3,
    occurrences     : 1,
    relatedTraceId  : null,
    screenshots     : [],
    contextSummary  : '',
    relatedTs       : logs[0]?.ts || null
  }];
}

/**
 * R11: 画面モード未設定（v2.0 新規）
 * context.screenMode が全ログで 'unknown' または未設定
 * → init() の第2引数が渡されていないことを示す
 */
function detectR11_NoScreenMode(featureId, logs) {
  if (featureId === 'UNKNOWN') return [];
  const hasLoad = logs.some(e => e.type === 'SCREEN_LOAD');
  if (!hasLoad) return [];

  const hasMode = logs.some(e =>
    e.context?.screenMode && e.context.screenMode !== 'unknown'
  );
  if (hasMode) return [];

  return [{
    ruleId          : 'R11',
    category        : 'NO_SCREEN_MODE',
    severity        : 'Low',
    reproducibility : 'Always',
    description     : '画面モードが記録されていません。init() の第2引数（{ screenMode }）が未設定です。',
    logEvidence     : 'context.screenMode が全ログで unknown または未設定',
    fixSuggestion   : `TLogAutoInstrument.init('${featureId}', { screenMode: 'search' }) のように第2引数を追加してください。`,
    confidence      : 0.9,
    frequency       : 1.0,
    occurrences     : 1,
    relatedTraceId  : null,
    screenshots     : [],
    contextSummary  : '',
    relatedTs       : logs[0]?.ts || null
  }];
}

// =============================================================================
//   analyzeFeature: 全ルールを実行し、メタデータを付与して返す
// =============================================================================
function analyzeFeature(featureId, logs) {
  const allIssues = [
    ...detectR01_Error(featureId, logs),
    ...detectR02_UnknownFeature(featureId, logs),
    ...detectR03_DuplicateBind(featureId, logs),
    ...detectR04_SearchUnavailable(featureId, logs),
    ...detectR05_ApiNotCalled(featureId, logs),
    ...detectR06_RapidBack(featureId, logs),
    ...detectR07_DuplicateLoad(featureId, logs),
    ...detectR08_BackendFailure(featureId, logs),
    ...detectR09_FormResidual(featureId, logs),
    ...detectR10_LowCoverage(featureId, logs),
    ...detectR11_NoScreenMode(featureId, logs)   // v2.0 追加
  ];

  // 共通メタデータ付与
  allIssues.forEach(issue => {
    issue.issueId       = newIssueId(featureId);
    issue.featureId     = featureId;   // v2.0: 明示的に格納（ダッシュボードフィルター用）
    issue.priorityScore = calcPriorityScore(
      issue.severity, issue.reproducibility, issue.frequency, issue.confidence
    );
    issue.difficulty    = estimateDifficulty(issue.category);
    issue.categoryLabel = CATEGORY[issue.category] || issue.category;
    issue.screenName    = SCREEN_NAMES[featureId]  || featureId;
    issue.status        = 'Open';
    issue.detectedAt    = new Date().toISOString();
  });

  return allIssues.sort((a, b) => b.priorityScore - a.priorityScore);
}

// =============================================================================
//   メイン処理
// =============================================================================
function main() {
  console.log('\n[analyze-logs.js v2.0] 開始');
  console.log('─'.repeat(60));

  if (!fs.existsSync(FEAT_DIR)) {
    console.error(`[ERROR] logs/features/ が見つかりません: ${FEAT_DIR}`);
    process.exit(1);
  }

  const files        = fs.readdirSync(FEAT_DIR).filter(f => f.endsWith('.jsonl'));
  const allIssues    = [];
  const featureStats = {};

  for (const file of files) {
    const featureId = file.replace('.jsonl', '');
    const logs      = readJsonl(path.join(FEAT_DIR, file));

    console.log(`  解析中: ${featureId} (${logs.length}件)`);

    const issues = analyzeFeature(featureId, logs);
    allIssues.push(...issues);

    featureStats[featureId] = {
      featureId,
      screenName : SCREEN_NAMES[featureId] || featureId,
      logCount   : logs.length,
      issueCount : issues.length,
      critical   : issues.filter(i => i.severity === 'Critical').length,
      high       : issues.filter(i => i.severity === 'High').length,
      medium     : issues.filter(i => i.severity === 'Medium').length,
      low        : issues.filter(i => i.severity === 'Low').length,
      maxScore   : issues[0]?.priorityScore || 0
    };

    if (issues.length > 0) {
      console.log(`    → ${issues.length} 件の問題を検出`);
    }
  }

  // 全体サマリ
  const summary = {
    generatedAt   : new Date().toISOString(),
    totalFeatures : files.length,
    totalLogs     : Object.values(featureStats).reduce((s, f) => s + f.logCount, 0),
    totalIssues   : allIssues.length,
    critical      : allIssues.filter(i => i.severity === 'Critical').length,
    high          : allIssues.filter(i => i.severity === 'High').length,
    medium        : allIssues.filter(i => i.severity === 'Medium').length,
    low           : allIssues.filter(i => i.severity === 'Low').length,
    byCategory    : {}
  };
  allIssues.forEach(i => {
    summary.byCategory[i.category] = (summary.byCategory[i.category] || 0) + 1;
  });

  allIssues.sort((a, b) => b.priorityScore - a.priorityScore);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'issues.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary, features: featureStats, issues: allIssues }, null, 2), 'utf8');

  console.log('─'.repeat(60));
  console.log(`  ✓ 完了: ${allIssues.length} 件の問題を検出`);
  console.log(`    Critical=${summary.critical} / High=${summary.high} / Medium=${summary.medium} / Low=${summary.low}`);
  console.log(`  ✓ 保存: docs/issues/issues.json\n`);
}

main();