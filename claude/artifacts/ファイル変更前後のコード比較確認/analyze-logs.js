#!/usr/bin/env node
/* =============================================================================
   scripts/analyze-logs.js  v2.0（修正版）
   変更履歴:
     v1.0 - 初版（10ルール R01〜R10, 個別検出関数, 優先度スコア算出）
     v2.0 - [新機能] スクリーンショット紐付け（traceIdベース）
            [新機能] contextSummary（操作文脈サマリー）自動生成
            [新機能] R11 追加（画面モード未設定検出）
            [修正]  ルール関数を detectR01_Error 〜 detectR11_NoScreenMode の
                    11個別関数に維持（保守性・個別チューニングを確保）
            [修正]  issue に featureId を明示格納（フィルター動作のため必要）
            [修正]  CATEGORY ラベルをフル表記に統一
   入力:  logs/features/*.jsonl
   出力:  docs/issues/issues.json
   =============================================================================*/

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const FEAT_DIR  = path.join(ROOT, 'logs', 'features');
const SS_DIR    = path.join(ROOT, 'logs', 'screenshots');
const OUT_DIR   = path.join(ROOT, 'docs', 'issues');
const OUT_FILE  = path.join(OUT_DIR, 'issues.json');

// ─── SCREEN_NAME マッピング（featureId → 日本語画面名）────────────────────────
const SCREEN_NAME_MAP = {
  MC_DRAWING_LIST            : '図面一覧',
  MC_INDEX_PROGRAM_EDIT      : 'インデックスプログラム編集',
  MC_EQUIPMENT_LIST          : '設備一覧',
  MC_MACHINING_INFO          : 'マシニング情報管理',
  MC_SYSTEM_OPERATION_LOG    : 'システム操作履歴',
  MC_PRODUCTS_LIST           : '部品一覧',
  MC_PHOTO_LIST              : '写真一覧',
  MC_SETUP_SHEET_BACK        : '段取シートバック',
  MC_SETUP_SHEET_ISSUE       : '段取シート発行リピート',
  MC_RAW_CLAW_SEARCH         : '生爪検索',
  MC_SP_SETUP_NOTIFY         : 'SP段取シート通知',
  MC_TOOLING_EDIT_BASIC      : 'ツーリング編集（基本版）',
  MC_TOOLING_EDIT_DETAIL     : 'ツーリング編集（詳細版）',
  MC_INFO_UPDATE_CONFIRM     : '情報更新内容確認',
  MC_USER_AUTH               : 'ユーザ認証',
  MC_OPERATOR_AUTHENTICATION : 'ユーザ認証',
  MC_WORK_RESULT_LIST        : '作業実績登録一覧',
  MC_WORK_RESULT_REGISTER    : '作業実績登録',
  MC_WORK_OFFSET             : 'ワークオフセット/設備稼働実績',
  MC_RAW_CLAW_EDIT           : '生爪編集/段取シート一覧',
  UNKNOWN                    : '（不明）'
};

function screenName(featureId) {
  return SCREEN_NAME_MAP[featureId] || featureId;
}

// ─── 優先度スコア算出 ──────────────────────────────────────────────────────────
//   PriorityScore = (重大度×40) + (再現性×20) + (頻度×20) + (信頼度×20)
const SEVERITY_WEIGHT    = { Critical: 1.0, High: 0.8, Medium: 0.5, Low: 0.2 };
const REPRO_WEIGHT       = { Always: 1.0, Likely: 0.75, Sometimes: 0.5, Unknown: 0.3 };

function calcPriorityScore(severity, reproducibility, occurrences, confidence) {
  const sevW   = SEVERITY_WEIGHT[severity]        || 0.2;
  const reproW = REPRO_WEIGHT[reproducibility]    || 0.3;
  const freqW  = occurrences >= 3 ? 1.0 : occurrences === 2 ? 0.7 : 0.4;
  const confW  = Math.min(1.0, Math.max(0, confidence || 0));
  return Math.round(sevW * 40 + reproW * 20 + freqW * 20 + confW * 20);
}

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function newIssueId(ruleId, featureId, idx) {
  return `${ruleId}-${featureId}-${Date.now()}-${idx}`;
}

/** ログファイルを読み込んでオブジェクト配列を返す */
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** featureId ごとのスクリーンショット一覧を traceId → [filePath] のマップで返す */
function buildTraceScreenshotMap(featureId, logs) {
  // logs/features/*.jsonl に記録されている SCREENSHOT エントリから紐付け
  const fromLog = {};
  logs.filter(e => e.type === 'SCREENSHOT').forEach(e => {
    const tid = e.traceId;
    if (!tid) return;
    if (!fromLog[tid]) fromLog[tid] = [];
    if (e.file) fromLog[tid].push(e.file);
  });

  // logs/screenshots/{featureId}/ のファイルからも補完（ログが欠落している場合）
  const ssDir = path.join(SS_DIR, featureId);
  const fromDir = {};
  if (fs.existsSync(ssDir)) {
    fs.readdirSync(ssDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .forEach(f => {
        // ファイル名フォーマット: {ts}_{screenId}_{trigger}_{traceId}.{ext}
        const parts  = f.replace(/\.(jpg|png)$/, '').split('_');
        const traceId = parts.slice(-1)[0];
        if (!traceId) return;
        const filePath = `logs/screenshots/${featureId}/${f}`;
        if (!fromDir[traceId]) fromDir[traceId] = [];
        if (!fromDir[traceId].includes(filePath)) fromDir[traceId].push(filePath);
      });
  }

  // マージ（ログを優先、ディレクトリで補完）
  const merged = { ...fromLog };
  Object.keys(fromDir).forEach(tid => {
    if (!merged[tid]) merged[tid] = [];
    fromDir[tid].forEach(fp => {
      if (!merged[tid].includes(fp)) merged[tid].push(fp);
    });
  });
  return merged;
}

/** UI_CLICK や BACKEND ログから操作文脈サマリー文字列を生成 */
function buildContextSummary(relatedLogs) {
  if (!relatedLogs || relatedLogs.length === 0) return '';
  const parts = [];
  const ctx = relatedLogs.find(e => e.context);
  if (ctx && ctx.context) {
    const c = ctx.context;
    if (c.screenMode && c.screenMode !== 'unknown') parts.push(`モード:${c.screenMode}`);
    if (c.callerScreen) parts.push(`遷移元:${c.callerScreen}`);
    if (c.urlParams && Object.keys(c.urlParams).length > 0) {
      const ps = Object.entries(c.urlParams).map(([k,v]) => `${k}=${v}`).join(', ');
      parts.push(`URLパラメータ:{ ${ps} }`);
    }
    if (c.pageContext && c.pageContext.headingText) parts.push(`見出し:${c.pageContext.headingText}`);
  }
  const click = relatedLogs.find(e => e.type === 'UI_CLICK');
  if (click) {
    if (click.elementId) parts.push(`操作:${click.elementId}`);
    if (click.inputValues && Object.keys(click.inputValues).length > 0) {
      const iv = click.inputValues;
      const fmtVals = Object.entries(iv)
        .filter(([,v]) => v && String(v).length > 0)
        .map(([k,v]) => `${k}=${String(v).slice(0,20)}`)
        .slice(0, 3).join(', ');
      if (fmtVals) parts.push(`入力:{ ${fmtVals} }`);
    }
  }
  return parts.join(' | ');
}

// =============================================================================
//   R01: ERROR ログ検出
// =============================================================================
function detectR01_Error(featureId, logs, traceMap) {
  const errors = logs.filter(e => e.type === 'ERROR');
  return errors.map((e, idx) => {
    const shots = traceMap[e.traceId] || [];
    const score = calcPriorityScore('Critical', 'Always', errors.length, 0.99);
    return {
      issueId         : newIssueId('R01', featureId, idx),
      ruleId          : 'R01',
      featureId       : featureId,
      screenName      : screenName(featureId),
      category        : 'ERROR',
      categoryLabel   : 'ERRORログ検出',
      severity        : 'Critical',
      difficulty      : 'High',
      description     : `JavaScriptエラーが検出されました: ${(e.message || '詳細不明').slice(0, 80)}`,
      logEvidence     : `type=ERROR | message="${e.message || ''}" | source="${(e.detail && e.detail.source) || ''}" | lineno=${(e.detail && e.detail.lineno) || ''} | ts=${e.ts || ''}`,
      fixSuggestion   : 'ブラウザコンソール（F12）でスタックトレースを確認し、エラー箇所のJSコードを修正してください。TALONの画面JSでの変数未定義・NULLアクセスが多い原因です。',
      reproducibility : 'Always',
      confidence      : 0.99,
      occurrences     : 1,
      priorityScore   : score,
      relatedTraceId  : e.traceId || '',
      contextSummary  : buildContextSummary([e]),
      screenshots     : shots,
      status          : 'Open',
      detectedAt      : new Date().toISOString()
    };
  });
}

// =============================================================================
//   R02: ロガー初期化ミス（UNKNOWN featureId）
// =============================================================================
function detectR02_UnknownFeature(featureId, logs, traceMap) {
  if (featureId !== 'UNKNOWN') return [];
  const screenLoads = logs.filter(e => e.type === 'SCREEN_LOAD');
  const occurrences = logs.length;
  const shots       = [];
  screenLoads.forEach(e => {
    (traceMap[e.traceId] || []).forEach(s => { if (!shots.includes(s)) shots.push(s); });
  });
  const score = calcPriorityScore('High', 'Always', occurrences >= 3 ? 3 : occurrences, 0.95);
  return [{
    issueId         : newIssueId('R02', featureId, 0),
    ruleId          : 'R02',
    featureId       : featureId,
    screenName      : screenName(featureId),
    category        : 'UNKNOWN_FEATURE',
    categoryLabel   : 'ロガー初期化ミス（UNKNOWN featureId）',
    severity        : 'High',
    difficulty      : 'Low',
    description     : `featureId が "UNKNOWN" のログが ${occurrences} 件あります。TLogAutoInstrument.init() が未呼び出し、または resizeContents_start() に配置されています。`,
    logEvidence     : `featureId=UNKNOWN のログ ${occurrences} 件 | SCREEN_LOAD ${screenLoads.length} 件`,
    fixSuggestion   : 'resizeContents_end() の末尾に TLog.screenLoad("機能ID", "画面名") と TLogAutoInstrument.init("機能ID", { screenMode: "search" }) を追加してください。',
    reproducibility : 'Always',
    confidence      : 0.95,
    occurrences     : occurrences,
    priorityScore   : score,
    relatedTraceId  : screenLoads[0]?.traceId || '',
    contextSummary  : '',
    screenshots     : shots.slice(0, 4),
    status          : 'Open',
    detectedAt      : new Date().toISOString()
  }];
}

// =============================================================================
//   R03: ボタン重複バインド（同一elementIdが10ms以内に複数記録）
// =============================================================================
function detectR03_DuplicateBind(featureId, logs, traceMap) {
  const clicks  = logs.filter(e => e.type === 'UI_CLICK' && e.elementId);
  const issues  = [];

  // elementId ごとにグループ化してタイムスタンプ差を確認
  const byElement = {};
  clicks.forEach(e => {
    if (!byElement[e.elementId]) byElement[e.elementId] = [];
    byElement[e.elementId].push(e);
  });

  let idx = 0;
  Object.entries(byElement).forEach(([elementId, evts]) => {
    evts.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    for (let i = 1; i < evts.length; i++) {
      const diff = new Date(evts[i].ts) - new Date(evts[i - 1].ts);
      if (diff <= 10) {
        const shots = traceMap[evts[i].traceId] || [];
        const score = calcPriorityScore('High', 'Likely', 1, 0.90);
        issues.push({
          issueId         : newIssueId('R03', featureId, idx++),
          ruleId          : 'R03',
          featureId       : featureId,
          screenName      : screenName(featureId),
          category        : 'DUPLICATE_BIND',
          categoryLabel   : 'ボタン重複バインド',
          severity        : 'High',
          difficulty      : 'Medium',
          description     : `ボタン "${elementId}" が ${diff}ms 以内に ${i + 1} 回記録されています。addEventListener が複数回バインドされている可能性があります。`,
          logEvidence     : `elementId=${elementId} | 時刻差=${diff}ms | ts1=${evts[i-1].ts} | ts2=${evts[i].ts}`,
          fixSuggestion   : 'resizeContents_end() が複数回呼ばれていないか確認してください。isValid フラグで初期化ガードを実装し、addEventListener の二重登録を防いでください。',
          reproducibility : 'Likely',
          confidence      : 0.90,
          occurrences     : 1,
          priorityScore   : score,
          relatedTraceId  : evts[i].traceId || '',
          contextSummary  : buildContextSummary([evts[i]]),
          screenshots     : shots,
          status          : 'Open',
          detectedAt      : new Date().toISOString()
        });
        break; // 同一elementIdで1件検出すれば十分
      }
    }
  });
  return issues;
}

// =============================================================================
//   R04: 検索結果取得不可（SEARCH_RESULTのrowCount=0かつcountText=不明）
// =============================================================================
function detectR04_SearchUnavailable(featureId, logs, traceMap) {
  const results = logs.filter(e =>
    e.type === 'BACKEND' && e.processName === 'SEARCH_RESULT'
  );
  const unavailable = results.filter(e =>
    (e.rowCount === 0 || e.rowCount === '取得不可') &&
    (e.countText === '不明' || !e.countText)
  );
  if (unavailable.length === 0) return [];

  const shots = [];
  unavailable.forEach(e => {
    (traceMap[e.traceId] || []).forEach(s => { if (!shots.includes(s)) shots.push(s); });
  });
  const score = calcPriorityScore('Medium', 'Likely', unavailable.length, 0.75);
  return [{
    issueId         : newIssueId('R04', featureId, 0),
    ruleId          : 'R04',
    featureId       : featureId,
    screenName      : screenName(featureId),
    category        : 'SEARCH_UNAVAILABLE',
    categoryLabel   : '検索結果取得不可',
    severity        : 'Medium',
    difficulty      : 'Medium',
    description     : `検索実行後に結果件数が取得できませんでした（${unavailable.length}回）。DOMセレクタが実際のテーブル構造と一致していない可能性があります。`,
    logEvidence     : `SEARCH_RESULT rowCount=取得不可 ${unavailable.length}件 | countText=不明`,
    fixSuggestion   : 'ブラウザのF12でHTMLを確認し、テーブル行のCSSクラスを確認してください。logSearchResult()内のDOMセレクタ "table tbody tr.ui-widget-content" を実際の構造に合わせて修正してください。',
    reproducibility : 'Likely',
    confidence      : 0.75,
    occurrences     : unavailable.length,
    priorityScore   : score,
    relatedTraceId  : unavailable[0]?.traceId || '',
    contextSummary  : buildContextSummary(unavailable),
    screenshots     : shots.slice(0, 4),
    status          : 'Open',
    detectedAt      : new Date().toISOString()
  }];
}

// =============================================================================
//   R05: ボタン押下後API無応答（処理系ボタン後3秒以内にBACKENDログなし）
// =============================================================================
function detectR05_ApiNotCalled(featureId, logs, traceMap) {
  const actionBtns = logs.filter(e =>
    e.type === 'UI_CLICK' &&
    /SEARCH|SAVE|UPDATE|REGIST|ISSUE|EXEC|SEND|COMMIT|CONFIRM/i.test(
      (e.elementId || '') + ' ' + (e.label || '')
    )
  );
  const issues = [];
  let idx = 0;

  actionBtns.forEach(btn => {
    const btnTime = new Date(btn.ts).getTime();
    if (isNaN(btnTime)) return;

    // 同じ traceId で 3秒以内の BACKEND ログを検索
    const hasBackend = logs.some(e =>
      e.type === 'BACKEND' &&
      e.traceId === btn.traceId &&
      Math.abs(new Date(e.ts).getTime() - btnTime) <= 3000
    );
    if (!hasBackend) {
      const shots = traceMap[btn.traceId] || [];
      const score = calcPriorityScore('High', 'Sometimes', 1, 0.70);
      issues.push({
        issueId         : newIssueId('R05', featureId, idx++),
        ruleId          : 'R05',
        featureId       : featureId,
        screenName      : screenName(featureId),
        category        : 'API_NOT_CALLED',
        categoryLabel   : 'ボタン押下後API無応答',
        severity        : 'High',
        difficulty      : 'High',
        description     : `ボタン "${btn.elementId || btn.label || '不明'}" 押下後 3秒以内にBACKENDログが記録されていません。REST API呼び出しが失敗しているか、レスポンス取得コードが未実装の可能性があります。`,
        logEvidence     : `UI_CLICK elementId=${btn.elementId} | ts=${btn.ts} | traceId=${btn.traceId} | 3秒以内BACKEND=なし`,
        fixSuggestion   : 'ブラウザのF12 > Networkタブで実際にREST APIが呼ばれているか確認してください。PrimeFaces AJAXのコールバック内にTLog.backend()の記録を追加してください。',
        reproducibility : 'Sometimes',
        confidence      : 0.70,
        occurrences     : 1,
        priorityScore   : score,
        relatedTraceId  : btn.traceId || '',
        contextSummary  : buildContextSummary([btn]),
        screenshots     : shots,
        status          : 'Open',
        detectedAt      : new Date().toISOString()
      });
    }
  });
  return issues;
}

// =============================================================================
//   R06: 戻るボタン連打（100ms以内にBACK系ボタンが3回以上）
// =============================================================================
function detectR06_RapidBack(featureId, logs, traceMap) {
  const backClicks = logs.filter(e =>
    e.type === 'UI_CLICK' &&
    /BACK|閉じる|CLOSE|CANCEL/i.test((e.elementId || '') + ' ' + (e.label || ''))
  ).sort((a, b) => new Date(a.ts) - new Date(b.ts));

  const issues = [];
  let idx = 0;
  for (let i = 0; i + 2 < backClicks.length; i++) {
    const diff = new Date(backClicks[i + 2].ts) - new Date(backClicks[i].ts);
    if (diff <= 100) {
      const shots = traceMap[backClicks[i].traceId] || [];
      const score = calcPriorityScore('Medium', 'Sometimes', 1, 0.80);
      issues.push({
        issueId         : newIssueId('R06', featureId, idx++),
        ruleId          : 'R06',
        featureId       : featureId,
        screenName      : screenName(featureId),
        category        : 'RAPID_BACK',
        categoryLabel   : '戻るボタン連打',
        severity        : 'Medium',
        difficulty      : 'Medium',
        description     : `戻る/閉じるボタンが ${diff}ms 以内に3回連続して記録されています。ボタンの重複バインドまたは画面遷移が機能していない可能性があります。`,
        logEvidence     : `BACK系クリック3回 | diff=${diff}ms | elementId=${backClicks[i].elementId} | ts=${backClicks[i].ts}`,
        fixSuggestion   : 'ボタンクリック後にすぐ画面遷移（ダイアログクローズ）されているか確認してください。TALON の RequestContext.execute("PF(\'dlg\').hide()") 等の遷移処理を確認してください。',
        reproducibility : 'Sometimes',
        confidence      : 0.80,
        occurrences     : 1,
        priorityScore   : score,
        relatedTraceId  : backClicks[i].traceId || '',
        contextSummary  : buildContextSummary([backClicks[i]]),
        screenshots     : shots,
        status          : 'Open',
        detectedAt      : new Date().toISOString()
      });
      break;
    }
  }
  return issues;
}

// =============================================================================
//   R07: 画面重複ロード（1秒以内にSCREEN_LOADが2回以上）
// =============================================================================
function detectR07_DuplicateLoad(featureId, logs, traceMap) {
  const screenLoads = logs.filter(e => e.type === 'SCREEN_LOAD')
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  const issues = [];
  let idx = 0;
  for (let i = 1; i < screenLoads.length; i++) {
    const diff = new Date(screenLoads[i].ts) - new Date(screenLoads[i - 1].ts);
    if (diff <= 1000) {
      const shots = [
        ...(traceMap[screenLoads[i - 1].traceId] || []),
        ...(traceMap[screenLoads[i].traceId] || [])
      ].filter((v, k, a) => a.indexOf(v) === k);
      const score = calcPriorityScore('Medium', 'Likely', 1, 0.85);
      issues.push({
        issueId         : newIssueId('R07', featureId, idx++),
        ruleId          : 'R07',
        featureId       : featureId,
        screenName      : screenName(featureId),
        category        : 'DUPLICATE_LOAD',
        categoryLabel   : '画面重複ロード',
        severity        : 'Medium',
        difficulty      : 'Medium',
        description     : `SCREEN_LOAD が ${diff}ms 以内に2回記録されています。resizeContents_end() が複数回呼ばれているか、isValid ガードが正しく機能していない可能性があります。`,
        logEvidence     : `SCREEN_LOAD 2回 | diff=${diff}ms | ts1=${screenLoads[i-1].ts} | ts2=${screenLoads[i].ts}`,
        fixSuggestion   : 'resizeContents_end() にisValidフラグによる実行ガードが実装されているか確認してください。TALONのライフサイクル上、resizeContents_end() が複数回呼ばれることがあります。',
        reproducibility : 'Likely',
        confidence      : 0.85,
        occurrences     : 1,
        priorityScore   : score,
        relatedTraceId  : screenLoads[i].traceId || '',
        contextSummary  : buildContextSummary([screenLoads[i]]),
        screenshots     : shots.slice(0, 4),
        status          : 'Open',
        detectedAt      : new Date().toISOString()
      });
    }
  }
  return issues;
}

// =============================================================================
//   R08: バックエンド処理失敗（BACKEND の status !== SUCCESS）
// =============================================================================
function detectR08_BackendFailure(featureId, logs, traceMap) {
  const failures = logs.filter(e =>
    e.type === 'BACKEND' &&
    e.status !== undefined &&
    e.status !== 'SUCCESS' &&
    e.processName !== 'SEARCH_RESULT' // R04との重複を避ける
  );
  return failures.map((e, idx) => {
    const shots = traceMap[e.traceId] || [];
    const score = calcPriorityScore('Critical', 'Likely', failures.length, 0.95);
    return {
      issueId         : newIssueId('R08', featureId, idx),
      ruleId          : 'R08',
      featureId       : featureId,
      screenName      : screenName(featureId),
      category        : 'BACKEND_FAILURE',
      categoryLabel   : 'バックエンド処理失敗',
      severity        : 'Critical',
      difficulty      : 'High',
      description     : `バックエンド処理 "${e.processName || '不明'}" が失敗しました。status=${e.status}`,
      logEvidence     : `type=BACKEND | processName=${e.processName} | status=${e.status} | message=${e.message || ''} | ts=${e.ts}`,
      fixSuggestion   : 'サーバサイドのログ（TALON/アプリサーバ）でエラー内容を確認してください。REST APIのレスポンスコードと返却メッセージを確認し、DB接続・権限・バリデーションエラーを切り分けてください。',
      reproducibility : 'Likely',
      confidence      : 0.95,
      occurrences     : 1,
      priorityScore   : score,
      relatedTraceId  : e.traceId || '',
      contextSummary  : buildContextSummary([e]),
      screenshots     : shots,
      status          : 'Open',
      detectedAt      : new Date().toISOString()
    };
  });
}

// =============================================================================
//   R09: クリア後フォーム値残存（クリアボタンのformSnapshotに値が残存）
// =============================================================================
function detectR09_FormResidual(featureId, logs, traceMap) {
  const clearClicks = logs.filter(e =>
    e.type === 'UI_CLICK' &&
    /CLEAR|クリア|RESET|リセット/i.test((e.elementId || '') + ' ' + (e.label || ''))
  );
  const issues = [];
  clearClicks.forEach((e, idx) => {
    const snap = e.inputValues && e.inputValues.formSnapshot;
    if (!snap) return;
    const residuals = Object.entries(snap)
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([k]) => k);
    if (residuals.length > 0) {
      const shots = traceMap[e.traceId] || [];
      const score = calcPriorityScore('Low', 'Likely', 1, 0.70);
      issues.push({
        issueId         : newIssueId('R09', featureId, idx),
        ruleId          : 'R09',
        featureId       : featureId,
        screenName      : screenName(featureId),
        category        : 'FORM_RESIDUAL',
        categoryLabel   : 'クリア後フォーム値残存',
        severity        : 'Low',
        difficulty      : 'Low',
        description     : `クリアボタン押下後にフォームに値が残存しています。残存フィールド: ${residuals.slice(0, 5).join(', ')}`,
        logEvidence     : `elementId=${e.elementId} | 残存フィールド=${residuals.join(', ')} | ts=${e.ts}`,
        fixSuggestion   : 'クリアボタンのクリックイベントで全フォーム要素のvalueを空文字にリセットするコードを追加してください。PrimeFacesの場合 p:resetInput を使用することも検討してください。',
        reproducibility : 'Likely',
        confidence      : 0.70,
        occurrences     : 1,
        priorityScore   : score,
        relatedTraceId  : e.traceId || '',
        contextSummary  : buildContextSummary([e]),
        screenshots     : shots,
        status          : 'Open',
        detectedAt      : new Date().toISOString()
      });
    }
  });
  return issues;
}

// =============================================================================
//   R10: ログ取得量過少（SCREEN_LOADはあるがUI_CLICKが5件未満）
// =============================================================================
function detectR10_LowLogCoverage(featureId, logs, traceMap) {
  const screenLoads = logs.filter(e => e.type === 'SCREEN_LOAD');
  const uiClicks    = logs.filter(e => e.type === 'UI_CLICK');
  if (screenLoads.length === 0) return [];
  if (uiClicks.length >= 5)    return [];

  const shots = [];
  screenLoads.forEach(e => {
    (traceMap[e.traceId] || []).forEach(s => { if (!shots.includes(s)) shots.push(s); });
  });
  const score = calcPriorityScore('Low', 'Unknown', 1, 0.60);
  return [{
    issueId         : newIssueId('R10', featureId, 0),
    ruleId          : 'R10',
    featureId       : featureId,
    screenName      : screenName(featureId),
    category        : 'LOW_LOG_COVERAGE',
    categoryLabel   : 'ログ取得量過少',
    severity        : 'Low',
    difficulty      : 'Low',
    description     : `画面ロードは記録されていますが、操作ログ（UI_CLICK）が ${uiClicks.length} 件しか取得できていません。ロガー設定の確認または操作テストが不足している可能性があります。`,
    logEvidence     : `SCREEN_LOAD=${screenLoads.length}件 | UI_CLICK=${uiClicks.length}件（期待値: 5件以上）`,
    fixSuggestion   : 'TLogAutoInstrument.init() が正しく設定されているか確認してください。また実際に画面上のボタンや入力フィールドを操作してからログを確認してください。',
    reproducibility : 'Unknown',
    confidence      : 0.60,
    occurrences     : 1,
    priorityScore   : score,
    relatedTraceId  : screenLoads[0]?.traceId || '',
    contextSummary  : '',
    screenshots     : shots.slice(0, 2),
    status          : 'Open',
    detectedAt      : new Date().toISOString()
  }];
}

// =============================================================================
//   R11: 画面モード未設定（v2.0以前のロガー実装・context.screenMode が全ログで未設定）
// =============================================================================
function detectR11_NoScreenMode(featureId, logs, traceMap) {
  const logsWithContext = logs.filter(e => e.context);
  if (logsWithContext.length === 0) return [];

  const allUnknownMode = logsWithContext.every(e =>
    !e.context.screenMode || e.context.screenMode === 'unknown'
  );
  if (!allUnknownMode) return [];

  const screenLoads = logs.filter(e => e.type === 'SCREEN_LOAD');
  const shots = [];
  screenLoads.forEach(e => {
    (traceMap[e.traceId] || []).forEach(s => { if (!shots.includes(s)) shots.push(s); });
  });
  const score = calcPriorityScore('Low', 'Always', 1, 0.80);
  return [{
    issueId         : newIssueId('R11', featureId, 0),
    ruleId          : 'R11',
    featureId       : featureId,
    screenName      : screenName(featureId),
    category        : 'NO_SCREEN_MODE',
    categoryLabel   : '画面モード未設定（v2.0未対応）',
    severity        : 'Low',
    difficulty      : 'Low',
    description     : `全ログで context.screenMode が "unknown" のままです。TLogAutoInstrument.init() の第2引数 { screenMode: "..." } が未設定です。`,
    logEvidence     : `context付きログ ${logsWithContext.length} 件中、screenMode設定なし 100%`,
    fixSuggestion   : 'init() の第2引数に { screenMode: "search" } など画面のモードを指定してください。例: TLogAutoInstrument.init("MC_PRODUCTS_LIST", { screenMode: "search" })',
    reproducibility : 'Always',
    confidence      : 0.80,
    occurrences     : 1,
    priorityScore   : score,
    relatedTraceId  : '',
    contextSummary  : '',
    screenshots     : shots.slice(0, 2),
    status          : 'Open',
    detectedAt      : new Date().toISOString()
  }];
}

// =============================================================================
//   メイン: 全ログファイルを解析して issues.json を生成
// =============================================================================
function main() {
  console.log('\n[analyze-logs.js v2.0] 開始');
  console.log(`  ログディレクトリ: ${FEAT_DIR}`);

  // 出力ディレクトリを作成
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // ログファイル一覧を取得
  if (!fs.existsSync(FEAT_DIR)) {
    console.warn('  [WARN] logs/features/ が存在しません。空のissues.jsonを生成します。');
    const emptyData = {
      summary : { generatedAt: new Date().toISOString(), totalFeatures: 0, totalLogs: 0, totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 },
      features: {},
      issues  : []
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(emptyData, null, 2), 'utf8');
    return;
  }

  const jsonlFiles = fs.readdirSync(FEAT_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort();

  console.log(`  対象ファイル: ${jsonlFiles.length} 件`);

  const allIssues   = [];
  const featureStats = {};
  let totalLogs = 0;

  jsonlFiles.forEach(file => {
    const featureId = file.replace('.jsonl', '');
    const logs      = readJsonl(path.join(FEAT_DIR, file));
    const traceMap  = buildTraceScreenshotMap(featureId, logs);

    console.log(`  ${featureId}: ${logs.length} ログ, トレースマップ: ${Object.keys(traceMap).length} 件`);

    // 11ルールを個別に実行
    const detected = [
      ...detectR01_Error           (featureId, logs, traceMap),
      ...detectR02_UnknownFeature  (featureId, logs, traceMap),
      ...detectR03_DuplicateBind   (featureId, logs, traceMap),
      ...detectR04_SearchUnavailable(featureId, logs, traceMap),
      ...detectR05_ApiNotCalled    (featureId, logs, traceMap),
      ...detectR06_RapidBack       (featureId, logs, traceMap),
      ...detectR07_DuplicateLoad   (featureId, logs, traceMap),
      ...detectR08_BackendFailure  (featureId, logs, traceMap),
      ...detectR09_FormResidual    (featureId, logs, traceMap),
      ...detectR10_LowLogCoverage  (featureId, logs, traceMap),
      ...detectR11_NoScreenMode    (featureId, logs, traceMap)
    ];

    featureStats[featureId] = {
      featureId  : featureId,
      screenName : screenName(featureId),
      logCount   : logs.length,
      issueCount : detected.length
    };

    totalLogs   += logs.length;
    allIssues.push(...detected);
  });

  // 優先度スコア降順でソート
  allIssues.sort((a, b) => b.priorityScore - a.priorityScore);

  // サマリー集計
  const summary = {
    generatedAt   : new Date().toISOString(),
    totalFeatures : jsonlFiles.length,
    totalLogs     : totalLogs,
    totalIssues   : allIssues.length,
    critical      : allIssues.filter(i => i.severity === 'Critical').length,
    high          : allIssues.filter(i => i.severity === 'High').length,
    medium        : allIssues.filter(i => i.severity === 'Medium').length,
    low           : allIssues.filter(i => i.severity === 'Low').length
  };

  const output = { summary, features: featureStats, issues: allIssues };
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n  ── 解析結果 ──────────────────────────────');
  console.log(`  対象画面  : ${summary.totalFeatures} 画面`);
  console.log(`  総ログ数  : ${summary.totalLogs} 件`);
  console.log(`  検出課題  : ${summary.totalIssues} 件`);
  console.log(`    Critical: ${summary.critical}`);
  console.log(`    High    : ${summary.high}`);
  console.log(`    Medium  : ${summary.medium}`);
  console.log(`    Low     : ${summary.low}`);
  console.log(`  出力ファイル: ${OUT_FILE}`);
  console.log('  ─────────────────────────────────────────\n');
}

main();
