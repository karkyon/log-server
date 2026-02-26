#!/usr/bin/env node
// scripts/generate-review.js
// ============================================================
// アクションレビューHTML自動生成スクリプト
//
// 入力:
//   logs/features/{featureId}.jsonl  ← 操作ログ
//   logs/screenshots/{featureId}/   ← スクショ画像
//   docs/issues/issues.json         ← 課題データ（任意）
//
// 出力:
//   docs/review/index.html
//
// 処理:
//   1. 全 .jsonl を traceId 単位でシーケンス化
//   2. スクショを traceId で紐付け
//   3. issues.json と照合して課題ノートを付与
//   4. 添付 HTML フォーマットで完全再現
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── パス定義 ─────────────────────────────────────────────────
const LOGS_DIR     = path.join(__dirname, '..', 'logs', 'features');
const SS_DIR       = path.join(__dirname, '..', 'logs', 'screenshots');
const ISSUES_FILE  = path.join(__dirname, '..', 'docs', 'issues', 'issues.json');
const OUT_DIR      = path.join(__dirname, '..', 'docs', 'review');
const OUT_FILE     = path.join(OUT_DIR, 'index.html');

// ── 画面名マスタ（analyze-logs.js と同期） ───────────────────
const SCREEN_NAME_MAP = {
  MC_DRAWING_LIST              : '図面一覧',
  MC_INDEX_PROGRAM_EDIT        : 'インデックスプログラム編集',
  MC_EQUIPMENT_LIST            : '設備一覧',
  MC_MACHINING_INFO            : 'マシニング情報管理',
  MC_SYSTEM_OPERATION_HISTORY  : 'システム操作履歴',
  MC_PRODUCTS_LIST             : '部品一覧',
  MC_PHOTO_LIST                : '写真一覧',
  MC_SETUP_SHEET_BACK          : '段取シートバック',
  MC_SETUP_SHEET_ISSUE_REPEAT  : '段取シート発行リピート',
  MC_RAW_CLAW_SEARCH           : '生爪検索',
  MC_SP_SETUP_SHEET_NOTIFY     : 'SP段取シート通知',
  MC_TOOLING_EDIT_BASIC        : 'ツーリング編集（基本版）',
  MC_TOOLING_EDIT_DETAIL       : 'ツーリング編集（詳細版）',
  MC_INFO_UPDATE_CONFIRM       : '情報更新内容確認',
  MC_OPERATOR_AUTHENTICATION   : 'ユーザ認証',
  MC_WORK_RESULT_LIST          : '作業実績登録一覧',
  MC_WORK_RESULT_REGISTER      : '作業実績登録',
  MC_WORK_OFFSET_EQUIPMENT_PERF: 'ワークオフセット設備稼働実績',
  MC_RAW_CLAW_EDIT_SETUP_LIST  : '生爪編集・段取シート一覧',
  UNKNOWN                      : '（不明）',
};

// ── ユーティリティ ───────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function formatTs(ts) {
  try {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2,'0');
    const jst = new Date(d.getTime() + 9*60*60*1000);
    return `${jst.getUTCFullYear()}/${pad(jst.getUTCMonth()+1)}/${pad(jst.getUTCDate())} `
         + `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`;
  } catch { return String(ts || ''); }
}

function shortLabel(label) {
  // "BTN_CLICK:検索" → "検索ボタン押下"
  // "INPUT_CHANGE:部品ID" → "部品ID 入力"
  // "SELECT_CHANGE:工程" → "工程 選択"
  if (!label) return '';
  const m = label.match(/^([A-Z_]+):(.+)$/);
  if (!m) return label.slice(0,40);
  const [,type, name] = m;
  if (type === 'BTN_CLICK')      return esc(name) + 'ボタン押下';
  if (type === 'INPUT_CHANGE')   return esc(name) + ' 入力';
  if (type === 'SELECT_CHANGE')  return esc(name) + ' 選択';
  return esc(label.slice(0,40));
}

function triggerLabel(trigger) {
  if (!trigger) return '';
  if (trigger.includes('_BEFORE'))      return '📸 BEFORE — 操作直前';
  if (trigger.includes('_AFTER'))       return '📸 AFTER — 操作結果';
  if (trigger === 'SCREEN_LOAD')        return '🖥 SCREEN_LOAD — 初期表示';
  if (trigger === 'JS_ERROR')           return '🚨 ERROR — エラー発生時';
  return '📷 ' + esc(trigger);
}

function triggerBorderClass(trigger) {
  if (!trigger) return 'border-gray-300';
  if (trigger.includes('_BEFORE'))  return 'border-orange-300';
  if (trigger.includes('_AFTER'))   return 'border-red-300';
  if (trigger === 'SCREEN_LOAD')    return 'border-blue-200';
  if (trigger === 'JS_ERROR')       return 'border-red-500';
  return 'border-gray-300';
}

function triggerBgClass(trigger) {
  if (!trigger) return 'bg-gray-50 text-gray-700';
  if (trigger.includes('_BEFORE'))  return 'bg-orange-50 text-orange-700';
  if (trigger.includes('_AFTER'))   return 'bg-red-50 text-red-700';
  if (trigger === 'SCREEN_LOAD')    return 'bg-blue-50 text-blue-700';
  if (trigger === 'JS_ERROR')       return 'bg-red-100 text-red-800';
  return 'bg-gray-50 text-gray-700';
}

// ── ログ読み込み ─────────────────────────────────────────────
function loadLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('[WARN] logs/features/ ディレクトリが存在しません');
    return {};
  }
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));
  const result = {};
  for (const file of files) {
    const featureId = path.basename(file, '.jsonl');
    if (featureId === 'UNKNOWN') continue;
    const lines = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8')
      .split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch {}
    }
    if (entries.length > 0) result[featureId] = entries;
  }
  return result;
}

// ── スクショ一覧 ─────────────────────────────────────────────
function loadScreenshots() {
  const map = {};  // featureId → [{traceId, trigger, file, ts}]
  if (!fs.existsSync(SS_DIR)) return map;
  for (const fid of fs.readdirSync(SS_DIR)) {
    const dir = path.join(SS_DIR, fid);
    if (!fs.statSync(dir).isDirectory()) continue;
    map[fid] = [];
    for (const fname of fs.readdirSync(dir).sort()) {
      if (!/\.(jpg|jpeg|png)$/i.test(fname)) continue;
      // ファイル名パターン: {ts}_{screenId}_{trigger}_{traceId}.jpg
      const parts = fname.replace(/\.(jpg|jpeg|png)$/i,'').split('_');
      const ts = parts[0] || '';
      // traceId は "TR-" から始まる最後の部分
      const traceIdx = parts.findIndex(p => /^TR-/.test(p));
      const traceId  = traceIdx >= 0 ? parts[traceIdx] + (parts[traceIdx+1] ? '-'+parts[traceIdx+1] : '') : '';
      const trigger  = traceIdx >= 2 ? parts.slice(2, traceIdx).join('_') : '';
      map[fid].push({
        traceId: parts.slice(traceIdx).join('-').replace(/\.(jpg|jpeg|png)$/i,''),
        trigger,
        file: fname,
        featureId: fid,
        ts,
      });
    }
  }
  return map;
}

// ── issues.json 読み込み ─────────────────────────────────────
function loadIssues() {
  if (!fs.existsSync(ISSUES_FILE)) return { issues: [], summary: {} };
  try { return JSON.parse(fs.readFileSync(ISSUES_FILE,'utf8')); }
  catch { return { issues: [], summary: {} }; }
}

// ── シーケンス構築 ───────────────────────────────────────────
// 同一 traceId をグループ化し、アクション単位のシーケンスを生成
function buildSequences(entries, screenshots, issuesForFeature) {
  // featureId不明なエントリ除去・時系列ソート
  const sorted = [...entries].sort((a,b) => new Date(a.ts)-new Date(b.ts));

  // traceId→エントリのマップ
  const traceMap = {};
  for (const e of sorted) {
    if (!e.traceId) continue;
    if (!traceMap[e.traceId]) traceMap[e.traceId] = [];
    traceMap[e.traceId].push(e);
  }

  // traceId→スクショのマップ（ファイル名から正確なtraceIdを取得）
  const ssMap = {};  // traceId → [{trigger, file}]
  for (const ss of (screenshots || [])) {
    // ファイル名から TR-XXXX-XXXX を抽出
    const m = ss.file.match(/(TR-\d+-[a-z0-9]+)/i);
    const tid = m ? m[1] : ss.traceId;
    if (!ssMap[tid]) ssMap[tid] = [];
    ssMap[tid].push(ss);
  }

  // issues照合: traceId → issue[]
  const issueMap = {};
  for (const issue of (issuesForFeature || [])) {
    if (issue.relatedTraceId) {
      if (!issueMap[issue.relatedTraceId]) issueMap[issue.relatedTraceId] = [];
      issueMap[issue.relatedTraceId].push(issue);
    }
  }

  // traceId 順でシーケンス生成
  const seenTraceIds = [];
  const sequences = [];
  let seqNo = 0;

  for (const e of sorted) {
    if (!e.traceId || seenTraceIds.includes(e.traceId)) continue;
    seenTraceIds.push(e.traceId);
    const group = traceMap[e.traceId] || [e];
    const mainEntry = group.find(x=>x.type==='SCREEN_LOAD')
                   || group.find(x=>x.type==='UI_CLICK')
                   || group.find(x=>x.type==='ERROR')
                   || group.find(x=>x.type==='BACKEND')
                   || group[0];
    if (!mainEntry) continue;

    seqNo++;
    const ts = mainEntry.ts;
    const shots = ssMap[mainEntry.traceId] || [];
    const issues = issueMap[mainEntry.traceId] || [];
    const hasError = group.some(x=>x.type==='ERROR') || issues.some(i=>i.severity==='Critical'||i.severity==='High');

    // 概要を決定
    let summary = '';
    let operationContent = '';
    let targetElement = '';
    let inputValue = '';
    let operationType = mainEntry.type;

    if (mainEntry.type === 'SCREEN_LOAD') {
      summary        = mainEntry.screenName || '画面表示';
      operationContent = summary + ' — 初期状態';
      targetElement  = '—';
      inputValue     = '—';
    } else if (mainEntry.type === 'UI_CLICK') {
      const lbl = mainEntry.label || '';
      summary = shortLabel(lbl);
      operationContent = summary;
      targetElement = mainEntry.elementId || mainEntry.inputValues?.elementType || '—';
      // 入力値（formSnapshotや直接値）
      const iv = mainEntry.inputValues || {};
      if (iv.newValue)       inputValue = iv.newValue;
      else if (iv.selectedValue) inputValue = iv.selectedValue + (iv.selectedText?' ('+iv.selectedText+')':'');
      else if (iv.buttonLabel)   inputValue = '—（ボタン）';
      else                       inputValue = '—';
    } else if (mainEntry.type === 'ERROR') {
      summary = 'エラー発生';
      operationContent = esc(String(mainEntry.message||'').slice(0,80));
      targetElement  = mainEntry.screenId || '—';
      inputValue     = '—';
    } else if (mainEntry.type === 'BACKEND') {
      summary = mainEntry.processName || 'バックエンド処理';
      operationContent = summary + ' — ' + (mainEntry.status||'');
      targetElement = mainEntry.processName || '—';
      inputValue    = mainEntry.rowCount != null ? mainEntry.rowCount + '件' : '—';
    }

    // バックエンドエントリが別traceIdにある場合も確認（検索結果）
    const backendEntry = group.find(x=>x.type==='BACKEND');
    if (backendEntry && mainEntry.type === 'UI_CLICK') {
      operationContent += `（結果: ${backendEntry.rowCount ?? '?'}件）`;
    }

    sequences.push({
      seqNo,
      traceId    : mainEntry.traceId,
      screenId   : mainEntry.screenId || mainEntry.featureId,
      ts,
      summary,
      operationType,
      operationContent,
      targetElement,
      inputValue,
      verdict    : hasError ? 'NG' : 'OK',
      issues,
      screenshots: shots,
      context    : mainEntry.context || {},
    });
  }

  return sequences;
}

// ── セクション別HTML生成 ──────────────────────────────────────

function renderScreenshotBlock(shots) {
  if (!shots || shots.length === 0) {
    return `<div style="color:#94a3b8;font-size:12px;padding:8px;">スクリーンショットなし</div>`;
  }
  return shots.map(ss => {
    const trigger = ss.trigger || 'SCREEN_LOAD';
    const borderC = triggerBorderClass(trigger);
    const bgC     = triggerBgClass(trigger);
    const label   = triggerLabel(trigger);
    const relPath = `../screenshots/${esc(ss.featureId)}/${esc(ss.file)}`;
    return `
    <div style="margin-bottom:10px; border-radius:8px; border:2px solid; overflow:hidden;"
         class="${borderC}">
      <div style="padding:6px 12px; font-size:11px; font-weight:700;" class="${bgC}">${label}</div>
      <div style="background:#f8fafc; cursor:pointer; text-align:center;"
           onclick="openImg('${relPath}')">
        <img src="${relPath}"
             alt="${label}"
             style="max-width:100%; max-height:220px; object-fit:contain; display:block; margin:0 auto;"
             onerror="this.parentElement.innerHTML='<div style=\\'padding:20px;color:#94a3b8;font-size:12px;\\'>画像未取得</div>'"
        />
      </div>
      <div style="padding:4px 8px; font-size:10px; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(ss.file)}</div>
    </div>`;
  }).join('');
}

function renderIssueNotes(issues) {
  if (!issues || issues.length === 0) return `<span style="color:#94a3b8;">なし</span>`;
  return issues.map(issue => {
    const isBug  = issue.severity === 'Critical' || issue.severity === 'High';
    const cls    = isBug ? 'issue-bug' : 'issue-spec';
    const icon   = isBug ? '🐛' : '📝';
    const label  = isBug ? '不具合' : '仕様・設定';
    const ruleId = issue.ruleId || '';
    return `<div class="${cls}">${icon} [${ruleId}] ${esc(issue.description || '')}<br>
      <small style="opacity:0.8;">修正提案: ${esc(issue.fixSuggestion||'')}</small>
    </div>`;
  }).join('');
}

function renderActionLog(seq) {
  const verdictHtml = seq.verdict === 'OK'
    ? `<div class="verdict"><div class="toggle toggle-on"></div><span class="verdict-text-ok">OK</span></div>`
    : `<div class="verdict"><div class="toggle toggle-off"></div><span class="verdict-text-ng">NG</span></div>`;

  const ctxHtml = seq.context && seq.context.screenMode && seq.context.screenMode !== 'unknown'
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">モード: ${esc(seq.context.screenMode)}${seq.context.callerScreen?' | 遷移元: '+esc(seq.context.callerScreen):''}</div>`
    : '';

  return `
    <div class="action-log">
      <div class="al-header">
        <div class="al-header-cell">
          <div class="al-fieldlabel">seqNo</div>
          <div class="al-fieldvalue">${seq.seqNo}</div>
        </div>
        <div class="al-header-cell" style="flex:1;">
          <div class="al-fieldlabel">概要</div>
          <div class="al-fieldvalue">${seq.summary}</div>
        </div>
        <div class="al-header-cell">
          <div class="al-fieldlabel">操作日時</div>
          <div class="al-fieldvalue">${esc(formatTs(seq.ts))}</div>
        </div>
      </div>
      <div class="al-meta">
        <div class="al-meta-cell">
          <span style="font-size:11px;color:#94a3b8;font-weight:700;">TRACEID</span>
          <span class="mono" style="font-size:11px;color:#334155;">${esc(seq.traceId)}</span>
        </div>
        <div class="al-meta-cell">
          <span style="font-size:11px;color:#94a3b8;font-weight:700;">screenId</span>
          <span class="mono" style="font-size:11px;color:#334155;">${esc(seq.screenId)}</span>
        </div>
      </div>
      <div class="al-ss">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:8px;">📷 スクリーンショット</div>
        ${renderScreenshotBlock(seq.screenshots)}
      </div>
      <div class="al-detail">
        <div class="al-row">
          <div class="al-label">操作内容</div>
          <div class="al-value">${seq.operationContent}</div>
        </div>
        <div class="al-row">
          <div class="al-label">対象要素</div>
          <div class="al-value">${seq.targetElement === '—' ? '<span style="color:#94a3b8;">—</span>' : esc(seq.targetElement)}</div>
        </div>
        <div class="al-row">
          <div class="al-label">入力値</div>
          <div class="al-value">${
            seq.inputValue && seq.inputValue !== '—'
              ? `<span class="mono" style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;">${esc(seq.inputValue)}</span>`
              : '<span style="color:#94a3b8;">—</span>'
          }</div>
        </div>
        <div class="al-row">
          <div class="al-label">判定</div>
          <div class="al-value">${verdictHtml}${ctxHtml}</div>
        </div>
        <div class="al-row">
          <div class="al-label">問題点課題</div>
          <div class="al-value">${renderIssueNotes(seq.issues)}</div>
        </div>
      </div>
    </div>`;
}

function renderScreenPage(featureId, entries, screenshots, issuesData) {
  const screenName = SCREEN_NAME_MAP[featureId] || featureId;
  const issuesForFeature = (issuesData.issues || []).filter(i => i.featureId === featureId);
  const sequences = buildSequences(entries, screenshots, issuesForFeature);

  const hasIssues = issuesForFeature.length > 0;
  const isNg      = issuesForFeature.some(i=>i.severity==='Critical'||i.severity==='High');
  const badgeClass = isNg ? 'badge-ng' : (hasIssues ? 'badge-warn' : 'badge-ok');
  const badgeText  = isNg ? '🔴 課題あり' : (hasIssues ? '🟡 確認中' : '✅ 確認済');

  // セクション日時（最初のログのts）
  const firstTs = entries.length ? formatTs(entries[0].ts) : '';

  // アクションレビュー HTML
  const actionsHtml = sequences.map(renderActionLog).join('\n');

  // 課題サマリーHTML
  const issuesSummaryHtml = issuesForFeature.length === 0
    ? `<p style="color:#64748b;font-size:14px;">現時点で課題なし ✅</p>`
    : `<table class="spec-table">
        <thead><tr><th>ルールID</th><th>重大度</th><th>カテゴリ</th><th>説明</th><th>スコア</th></tr></thead>
        <tbody>${issuesForFeature.map(iss=>`
          <tr>
            <td class="mono" style="font-size:11px;">${esc(iss.ruleId)}</td>
            <td>${renderSeverityBadge(iss.severity)}</td>
            <td style="font-size:12px;">${esc(iss.categoryLabel||iss.category||'')}</td>
            <td style="font-size:13px;">${esc(iss.description||'')}</td>
            <td style="font-weight:700;color:#6366f1;">${iss.priorityScore}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

  return `
<div id="${esc(featureId)}" class="page">
  <!-- 画面ヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;flex-wrap:wrap;gap:10px;">
    <div>
      <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;margin-bottom:3px;">${esc(featureId)}</div>
      <h1 style="font-size:21px;font-weight:700;color:#0f172a;">${esc(screenName)}</h1>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">
        ログ取得: ${esc(firstTs)} &nbsp;|&nbsp; ${entries.length}件のログ / ${sequences.length}シーケンス
      </div>
    </div>
    <span class="badge ${badgeClass}" style="font-size:13px;padding:6px 14px;">${badgeText}</span>
  </div>

  <!-- 画面概要 -->
  <div class="card">
    <div class="card-title">画面概要</div>
    <table class="spec-table">
      <tbody>
        <tr><td style="width:120px;font-weight:600;color:#64748b;">featureId</td><td class="mono">${esc(featureId)}</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">画面名</td><td>${esc(screenName)}</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">総ログ数</td><td>${entries.length} 件</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">シーケンス数</td><td>${sequences.length} 件</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">スクショ数</td><td>${(screenshots||[]).length} 枚</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">検出課題数</td><td>${issuesForFeature.length} 件</td></tr>
        ${entries[0]?.context?.urlParams && Object.keys(entries[0].context.urlParams).length
          ? `<tr><td style="font-weight:600;color:#64748b;">URLパラメータ</td>
               <td class="mono" style="font-size:11px;word-break:break-all;">${esc(JSON.stringify(entries[0].context.urlParams))}</td></tr>`
          : ''}
      </tbody>
    </table>
  </div>

  <!-- アクションレビュー -->
  <div class="card">
    <div class="card-title">アクションレビュー（${sequences.length}シーケンス）</div>
    ${sequences.length === 0
      ? `<p style="color:#94a3b8;font-size:13px;">ログが存在しません。TLog.screenLoad() と TLogAutoInstrument.init() が呼ばれているか確認してください。</p>`
      : actionsHtml
    }
  </div>

  <!-- 課題・メモ -->
  <div class="card">
    <div class="card-title">検出課題（analyze-logs.js 結果）</div>
    ${issuesSummaryHtml}
  </div>
</div>`;
}

function renderSeverityBadge(severity) {
  const map = {
    Critical : 'badge-ng',
    High     : 'badge-warn',
    Medium   : 'badge-pend',
    Low      : 'badge-pend',
  };
  return `<span class="badge ${map[severity]||'badge-pend'}">${esc(severity)}</span>`;
}

// ── サイドバー + ダッシュボード HTML ─────────────────────────
function renderSidebar(featureIds, featureStatus) {
  const navItems = featureIds.map(fid => {
    const { icon } = featureStatus[fid] || { icon: '⬜' };
    const name = SCREEN_NAME_MAP[fid] || fid;
    return `  <div class="nav-item" onclick="showPage('${esc(fid)}')">`
         + `<span>${icon}</span>${esc(fid)}`
         + `<span style="font-size:10px;color:#64748b;margin-left:auto;">${esc(name)}</span>`
         + `</div>`;
  }).join('\n');

  return `
  <nav id="sidebar">
    <div style="padding:20px 16px 14px;border-bottom:1px solid #1e293b;">
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;">📋 画面レビュー資料</div>
      <div style="font-size:11px;color:#475569;margin-top:3px;" id="sidebar-date"></div>
    </div>
    <div style="padding:10px 0 4px;">
      <div class="nav-item active" onclick="showPage('dashboard')">🏠 ダッシュボード</div>
    </div>
    <div class="nav-group">画面一覧（${featureIds.length}画面）</div>
    ${navItems}
    <div class="nav-group" style="margin-top:8px;">管理</div>
    <div class="nav-item" onclick="showPage('issues')">🐛 課題一覧</div>
    <div style="margin:14px;padding:12px;background:#1e293b;border-radius:8px;font-size:11px;color:#64748b;line-height:2.2;">
      ✅ 確認済 &nbsp; 🟡 確認中<br>🔴 課題あり &nbsp; ⬜ 未確認
    </div>
  </nav>`;
}

function renderDashboard(featureIds, featureStatus, issuesData) {
  const total    = featureIds.length;
  const okCount  = featureIds.filter(f => featureStatus[f]?.status === 'ok').length;
  const ngCount  = featureIds.filter(f => ['ng','warn'].includes(featureStatus[f]?.status)).length;
  const pendCount= total - okCount - ngCount;
  const allIssues = issuesData.issues || [];

  const tableRows = featureIds.map(fid => {
    const s = featureStatus[fid] || {};
    const name = SCREEN_NAME_MAP[fid] || fid;
    const issueCount = allIssues.filter(i=>i.featureId===fid).length;
    return `
      <tr>
        <td><span class="mono" style="font-size:11px;">${esc(fid)}</span></td>
        <td><span onclick="showPage('${esc(fid)}')" style="color:#2563eb;cursor:pointer;text-decoration:underline;">${esc(name)}</span></td>
        <td><span class="badge ${s.badgeClass||'badge-pend'}">${esc(s.badgeText||'未確認')}</span></td>
        <td>${issueCount}</td>
        <td>${esc(s.firstTs||'')}</td>
        <td>${esc(s.logCount||0)} ログ / ${esc(s.seqCount||0)} seq</td>
      </tr>`;
  }).join('');

  return `
  <div id="dashboard">
    <div style="margin-bottom:24px;">
      <h1 style="font-size:22px;font-weight:700;color:#0f172a;">レビュー進捗ダッシュボード</h1>
      <p style="font-size:13px;color:#64748b;margin-top:4px;" id="dash-date"></p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
      <div class="stat-card"><div class="stat-label">総画面数</div><div class="stat-num" style="color:#0f172a;">${total}</div></div>
      <div class="stat-card"><div class="stat-label">確認済</div><div class="stat-num" style="color:#16a34a;">${okCount}</div></div>
      <div class="stat-card"><div class="stat-label">確認中 / 課題あり</div><div class="stat-num" style="color:#d97706;">${ngCount}</div></div>
      <div class="stat-card"><div class="stat-label">未確認</div><div class="stat-num" style="color:#94a3b8;">${pendCount}</div></div>
    </div>
    <div class="card">
      <div class="card-title">画面一覧</div>
      <table class="spec-table">
        <thead><tr><th>screenId</th><th>画面名</th><th>状態</th><th>課題数</th><th>確認日</th><th>備考</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderIssuesPage(issuesData) {
  const issues = issuesData.issues || [];
  const rows = issues.length === 0
    ? `<tr><td colspan="7" style="color:#94a3b8;text-align:center;padding:24px;">課題なし</td></tr>`
    : issues.map((iss, i) => `
      <tr>
        <td class="mono" style="font-size:11px;">ISS${String(i+1).padStart(3,'0')}</td>
        <td>${renderSeverityBadge(iss.severity)}</td>
        <td><span onclick="showPage('${esc(iss.featureId)}')" style="color:#2563eb;cursor:pointer;">${esc(iss.featureId)}</span></td>
        <td class="mono" style="font-size:11px;">${esc(iss.ruleId)}</td>
        <td style="font-size:13px;">${esc(iss.description||'')}</td>
        <td style="font-weight:700;">${iss.priorityScore}</td>
        <td><span class="badge badge-warn">Open</span></td>
      </tr>`).join('');

  return `
  <div id="issues" class="page">
    <div style="margin-bottom:22px;">
      <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🐛 課題一覧</h1>
      <p style="font-size:13px;color:#64748b;margin-top:4px;">
        全${issues.length}件 — analyze-logs.js による自動検出（Claude API 不使用）
      </p>
    </div>
    <div class="card">
      <table class="spec-table">
        <thead><tr><th>ID</th><th>重大度</th><th>screenId</th><th>ルール</th><th>内容</th><th>スコア</th><th>状態</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── メイン処理 ───────────────────────────────────────────────
function main() {
  console.log('[REVIEW] アクションレビューHTML生成 開始');

  // データ読み込み
  const allLogs    = loadLogs();
  const allShots   = loadScreenshots();
  const issuesData = loadIssues();
  const featureIds = Object.keys(allLogs).sort();

  if (featureIds.length === 0) {
    console.log('[WARN] 有効なログファイルが見つかりません');
  }

  // 各featureの状態を決定
  const featureStatus = {};
  for (const fid of featureIds) {
    const entries  = allLogs[fid] || [];
    const featureIssues = (issuesData.issues || []).filter(i=>i.featureId===fid);
    const isNg     = featureIssues.some(i=>i.severity==='Critical'||i.severity==='High');
    const hasWarn  = featureIssues.length > 0;
    const status   = isNg ? 'ng' : (hasWarn ? 'warn' : 'ok');
    const icon     = isNg ? '🔴' : (hasWarn ? '🟡' : '✅');
    const badgeClass = isNg ? 'badge-ng' : (hasWarn ? 'badge-warn' : 'badge-ok');
    const badgeText  = isNg ? '🔴 課題あり' : (hasWarn ? '🟡 確認中' : '✅ 確認済');
    const firstTs  = entries.length ? formatTs(entries[0].ts) : '';
    const shots    = allShots[fid] || [];
    const issuesForFeature = featureIssues;
    const seqs     = buildSequences(entries, shots, issuesForFeature);

    featureStatus[fid] = {
      status, icon, badgeClass, badgeText,
      firstTs,
      logCount : entries.length,
      seqCount : seqs.length,
    };
  }

  // 各画面ページHTML生成
  const screenPagesHtml = featureIds.map(fid =>
    renderScreenPage(fid, allLogs[fid], allShots[fid] || [], issuesData)
  ).join('\n');

  // 最終HTML組み立て
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"><\/script>
<title>画面レビュー資料 — Machining System</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');
  * { font-family: 'Noto Sans JP', sans-serif; }
  code, .mono { font-family: 'JetBrains Mono', monospace; }
  :root { --sidebar-w: 280px; }

  #sidebar {
    width: var(--sidebar-w); min-height: 100vh; position: fixed; top: 0; left: 0;
    background: #0f172a; overflow-y: auto; z-index: 100;
  }
  #main-content { margin-left: var(--sidebar-w); min-height: 100vh; background: #f1f5f9; }

  .nav-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px 8px 20px; font-size: 12px; color: #94a3b8;
    border-left: 3px solid transparent; cursor: pointer; transition: all 0.15s;
  }
  .nav-item:hover { color: #f1f5f9; background: #1e293b; border-left-color: #3b82f6; }
  .nav-item.active { color: #fff; background: #1e3a8a; border-left-color: #60a5fa; font-weight: 600; }
  .nav-group { padding: 14px 16px 4px; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: #475569; font-weight: 700; }

  .badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-ok   { background:#dcfce7; color:#166534; }
  .badge-ng   { background:#fee2e2; color:#991b1b; }
  .badge-warn { background:#fef3c7; color:#92400e; }
  .badge-pend { background:#f1f5f9; color:#475569; }

  .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 24px 28px; margin-bottom: 16px; }
  .card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 18px; }

  .spec-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .spec-table th { background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; padding:10px 14px; text-align:left; border-bottom:2px solid #e2e8f0; }
  .spec-table td { padding:10px 14px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  .spec-table tr:last-child td { border-bottom:none; }
  .spec-table tr:hover td { background:#fafbff; }

  .action-log { margin-bottom: 20px; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); }

  .al-header { display: grid; grid-template-columns: 100px 1fr 180px; background: #f8fafc; border: 1px solid #e2e8f0; border-bottom: none; }
  .al-header-cell { padding: 10px 14px; border-right: 1px solid #e2e8f0; }
  .al-header-cell:last-child { border-right: none; }

  .al-meta { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #e2e8f0; border-top: none; border-bottom: none; background: #fafbff; }
  .al-meta-cell { display: grid; grid-template-columns: 80px 1fr; align-items: center; padding: 7px 14px; border-right: 1px solid #e2e8f0; gap: 8px; }
  .al-meta-cell:last-child { border-right: none; }

  .al-ss { border: 1px solid #e2e8f0; border-top: none; border-bottom: none; padding: 12px 14px; background: white; }

  .al-detail { border: 1px solid #e2e8f0; border-top: none; }
  .al-row { display: grid; grid-template-columns: 110px 1fr; border-bottom: 1px solid #f1f5f9; }
  .al-row:last-child { border-bottom: none; }
  .al-label { padding: 10px 14px; background: #f8fafc; color: #64748b; font-weight: 600; font-size: 13px; border-right: 1px solid #e2e8f0; display: flex; align-items: flex-start; padding-top: 12px; }
  .al-value { padding: 10px 14px; color: #1e293b; background: white; font-size: 13.5px; }

  .al-fieldlabel { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; line-height: 1; margin-bottom: 3px; }
  .al-fieldvalue { font-weight: 600; color: #0f172a; font-size: 13.5px; }

  .verdict { display: inline-flex; align-items: center; gap: 10px; }
  .toggle { width: 46px; height: 25px; border-radius: 13px; position: relative; flex-shrink: 0; transition: background .2s; }
  .toggle::after { content: ''; position: absolute; top: 3px; width: 19px; height: 19px; background: white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: left .2s; }
  .toggle-on  { background: #22c55e; } .toggle-on::after  { right: 3px; }
  .toggle-off { background: #d1d5db; } .toggle-off::after { left: 3px; }
  .verdict-text-ok   { font-size: 15px; font-weight: 700; color: #16a34a; }
  .verdict-text-ng   { font-size: 15px; font-weight: 700; color: #dc2626; }

  .issue-bug  { background:#fff5f5; border-left:3px solid #dc2626; border-radius:4px; padding:7px 12px; font-size:13px; color:#7f1d1d; margin-top:6px; }
  .issue-spec { background:#fffbeb; border-left:3px solid #f59e0b; border-radius:4px; padding:7px 12px; font-size:13px; color:#78350f; margin-top:6px; }

  .page { display: none; padding: 32px 36px; }
  .page.active { display: block; }
  #dashboard { padding: 32px 36px; }
  .stat-card { background:white; border-radius:12px; padding:20px 24px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .stat-label { font-size:12px; color:#94a3b8; font-weight:600; margin-bottom:6px; }
  .stat-num { font-size:32px; font-weight:700; line-height:1; }

  /* 画像拡大モーダル */
  #img-modal { position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:20px; }
  #img-modal.open { display:flex; }
</style>
</head>
<body>

${renderSidebar(featureIds, featureStatus)}

<div id="main-content">

${renderDashboard(featureIds, featureStatus, issuesData)}

${screenPagesHtml}

${renderIssuesPage(issuesData)}

</div><!-- /main-content -->

<!-- 画像拡大モーダル -->
<div id="img-modal" onclick="closeImg()">
  <div style="position:relative;max-width:1000px;width:100%;" onclick="event.stopPropagation()">
    <button onclick="closeImg()" style="position:absolute;top:-36px;right:0;color:white;font-size:24px;background:none;border:none;cursor:pointer;">✕</button>
    <img id="img-modal-src" src="" style="width:100%;height:auto;border-radius:8px;max-height:90vh;object-fit:contain;"/>
  </div>
</div>

<script>
  const today = new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'});
  document.getElementById('sidebar-date').textContent = today + ' 更新';
  document.getElementById('dash-date').textContent = today + ' 時点';

  function showPage(id) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById('dashboard').style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (id === 'dashboard') {
      document.getElementById('dashboard').style.display = 'block';
    } else {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    }
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('onclick') === \`showPage('\${id}')\`) el.classList.add('active');
    });
    window.scrollTo(0,0);
  }

  function openImg(src) {
    document.getElementById('img-modal-src').src = src;
    document.getElementById('img-modal').classList.add('open');
  }
  function closeImg() {
    document.getElementById('img-modal').classList.remove('open');
  }
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeImg(); });

  showPage('dashboard');
<\/script>
</body>
</html>`;

  // 出力
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  const size = (Buffer.byteLength(html,'utf8')/1024).toFixed(1);
  console.log(`[REVIEW] 生成完了: ${OUT_FILE} (${size} KB)`);
  console.log(`[REVIEW] 対象画面: ${featureIds.join(', ') || 'なし'}`);
  console.log(`[REVIEW] 総課題数: ${(issuesData.issues||[]).length} 件`);
}

main();