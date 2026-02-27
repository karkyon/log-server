#!/usr/bin/env node
// scripts/generate-review.js  v3.0
// ============================================================
// アクションレビューHTML自動生成スクリプト
//
// 変更履歴:
//   v2.0 - 画面遷移図 / OK|NG判定 / 課題フォーム / localStorage永続化
//   v3.0 - [修正] .console.jsonl を loadLogs() から除外
//                 （MC_XXX.console ページが生成されていた問題を解消）
//          [追加] loadConsoleLogs(): .console.jsonl を別途読み込み
//          [追加] buildSequences() に consoleLogs 紐づけを追加
//                 （lastTraceId === traceId でマッチ）
//          [追加] renderActionLog() に Console セクションを追加
//          [追加] 作業タイムラインページ（全画面横断の時系列表示）
//                 SHIFT+クリックで範囲選択 / Ctrl+クリックで個別選択
//          [追加] 作業パターン登録・管理ページ（localStorage永続化）
//
// 入力:
//   logs/features/{featureId}.jsonl           (操作ログ)
//   logs/features/{featureId}.console.jsonl   (コンソールログ)
//   logs/screenshots/{featureId}/             (スクリーンショット)
//   docs/issues/issues.json                   (課題データ、任意)
// 出力:
//   docs/review/index.html
// ============================================================
'use strict';
const fs   = require('fs');
const path = require('path');

const LOGS_DIR    = path.join(__dirname, '..', 'logs', 'features');
const SS_DIR      = path.join(__dirname, '..', 'logs', 'screenshots');
const ISSUES_FILE = path.join(__dirname, '..', 'docs', 'issues', 'issues.json');
const OUT_DIR     = path.join(__dirname, '..', 'docs', 'review');
const OUT_FILE    = path.join(OUT_DIR, 'index.html');

const SCREEN_NAME_MAP = {
  MC_DRAWING_LIST             : '図面一覧',
  MC_INDEX_PROGRAM_EDIT       : 'インデックスプログラム編集',
  MC_EQUIPMENT_LIST           : '設備一覧',
  MC_MACHINING_INFO           : 'マシニング情報管理',
  MC_SYSTEM_OPERATION_HISTORY : 'システム操作履歴',
  MC_PRODUCTS_LIST            : '部品一覧',
  MC_PHOTO_LIST               : '写真一覧',
  MC_SETUP_SHEET_BACK         : '段取シートバック',
  MC_SETUP_SHEET_ISSUE_REPEAT : '段取シート発行リピート',
  MC_RAW_CLAW_SEARCH          : '生爪検索',
  MC_SP_SETUP_SHEET_NOTIFY    : 'SP段取シート通知',
  MC_TOOLING_EDIT_BASIC       : 'ツーリング編集（基本版）',
  MC_TOOLING_EDIT_DETAIL      : 'ツーリング編集（詳細版）',
  MC_INFO_UPDATE_CONFIRM      : '情報更新内容確認',
  MC_OPERATOR_AUTHENTICATION  : 'ユーザ認証',
  MC_WORK_RESULT_LIST         : '作業実績登録一覧',
  MC_WORK_RESULT_EDIT         : '作業実績登録',
  MC_WORKOFFSET_RESULT        : 'ワークオフセット・設備稼働実績',
  MC_RAW_CLAW_EDIT_SHEET_LIST : '生爪編集・段取シート一覧',
};

// featureId ごとに異なるバッジ色を返す（タイムライン用）
const FEATURE_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
];
function featureColor(fid, fids) {
  const idx = fids.indexOf(fid);
  return FEATURE_COLORS[idx % FEATURE_COLORS.length];
}

// ─────────────────────────────────────────────────────────────
// データ読み込み
// ─────────────────────────────────────────────────────────────

/* ----------------------------------------------------------------
 * 操作ログ読み込み
 * v3.0修正: .console.jsonl を除外することで
 *           MC_XXX.console という featureId がページ生成されなくなる
 * ---------------------------------------------------------------- */
function loadLogs() {
  if (!fs.existsSync(LOGS_DIR)) return {};
  const result = {};
  for (const f of fs.readdirSync(LOGS_DIR)
         .filter(f => f.endsWith('.jsonl') && !f.endsWith('.console.jsonl'))) {
    const fid = path.basename(f, '.jsonl');
    if (fid === 'UNKNOWN') continue;
    const entries = [];
    for (const line of fs.readFileSync(path.join(LOGS_DIR, f), 'utf8').split('\n').filter(Boolean)) {
      try { entries.push(JSON.parse(line)); } catch {}
    }
    if (entries.length) result[fid] = entries;
  }
  return result;
}

/* ----------------------------------------------------------------
 * コンソールログ読み込み（v3.0追加）
 * .console.jsonl を別途読み込み featureId をキーとした Map を返す
 * 各エントリは { type:'CONSOLE', featureId, level, args, lastTraceId, ts }
 * ---------------------------------------------------------------- */
function loadConsoleLogs() {
  if (!fs.existsSync(LOGS_DIR)) return {};
  const result = {};
  for (const f of fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.console.jsonl'))) {
    const fid = path.basename(f, '.console.jsonl');
    if (fid === 'UNKNOWN') continue;
    const entries = [];
    for (const line of fs.readFileSync(path.join(LOGS_DIR, f), 'utf8').split('\n').filter(Boolean)) {
      try { entries.push(JSON.parse(line)); } catch {}
    }
    if (entries.length) result[fid] = entries;
  }
  return result;
}

function loadScreenshots() {
  const map = {};
  if (!fs.existsSync(SS_DIR)) return map;
  for (const fid of fs.readdirSync(SS_DIR)) {
    const dir = path.join(SS_DIR, fid);
    if (!fs.statSync(dir).isDirectory()) continue;
    map[fid] = [];
    for (const fname of fs.readdirSync(dir).sort()) {
      if (!/\.(jpg|jpeg|png)$/i.test(fname)) continue;
      const base  = fname.replace(/\.(jpg|jpeg|png)$/i, '');
      const parts = base.split('_');
      const ti    = parts.findIndex(p => /^TR-/.test(p));
      const trigger = ti >= 2 ? parts.slice(2, ti).join('_') : '';
      const traceId = ti >= 0 ? parts.slice(ti).join('-') : '';
      map[fid].push({ fname, fid, trigger, traceId });
    }
  }
  return map;
}

function loadIssues() {
  if (!fs.existsSync(ISSUES_FILE)) return { issues: [] };
  try { return JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf8')); } catch { return { issues: [] }; }
}

// ─────────────────────────────────────────────────────────────
// シーケンス構築
// ─────────────────────────────────────────────────────────────

/* ----------------------------------------------------------------
 * buildSequences()
 * v3.0変更: consoleLogs 引数を追加
 *   consoleLogs: { lastTraceId, level, args, ts, stack? }[] 
 *   各 seq の traceId と consoleLogs.lastTraceId を照合して seq.consoleLogs に付与
 * ---------------------------------------------------------------- */
function buildSequences(entries, screenshots, fidIssues, consoleLogs) {
  consoleLogs = consoleLogs || [];
  const sorted = [...entries].sort((a, b) => new Date(a.ts) - new Date(b.ts));

  // traceId → ログエントリ配列
  const traceMap = {};
  for (const e of sorted) {
    if (!e.traceId) continue;
    (traceMap[e.traceId] = traceMap[e.traceId] || []).push(e);
  }

  // traceId → スクショ配列
  const ssMap = {};
  for (const ss of (screenshots || [])) {
    const m = ss.fname.match(/(TR-\d+-[a-z0-9]+)/i);
    const tid = m ? m[1] : '';
    if (tid) (ssMap[tid] = ssMap[tid] || []).push(ss);
  }

  // traceId → issues 配列
  const issMap = {};
  for (const iss of (fidIssues || [])) {
    if (iss.relatedTraceId) (issMap[iss.relatedTraceId] = issMap[iss.relatedTraceId] || []).push(iss);
  }

  // コンソールログを traceId でインデックス（v3.0追加）
  // lastTraceId が一致するものを紐づける
  const consoleByTrace = {};
  for (const cl of consoleLogs) {
    const key = cl.lastTraceId || '';
    if (!key) continue;
    (consoleByTrace[key] = consoleByTrace[key] || []).push(cl);
  }

  const seen = [], seqs = [];
  let no = 0;
  for (const e of sorted) {
    if (!e.traceId || seen.includes(e.traceId)) continue;
    seen.push(e.traceId);
    const grp  = traceMap[e.traceId] || [e];
    const main = grp.find(x => x.type === 'SCREEN_LOAD')
              || grp.find(x => x.type === 'UI_CLICK')
              || grp.find(x => x.type === 'ERROR')
              || grp.find(x => x.type === 'BACKEND')
              || grp[0];
    if (!main) continue;
    no++;

    let summary = '', opContent = '', target = '', inputVal = '';
    const hasErr = grp.some(x => x.type === 'ERROR');

    if (main.type === 'SCREEN_LOAD') {
      summary    = main.screenName || '画面表示';
      opContent  = summary + ' — 初期状態';
      target     = '—';
      inputVal   = '—';
    } else if (main.type === 'UI_CLICK') {
      summary    = shortLabel(main.label || '');
      opContent  = summary;
      target     = main.elementId || '—';
      const iv   = main.inputValues || {};
      inputVal   = iv.newValue || iv.selectedValue || (iv.buttonLabel ? '—（ボタン）' : '—');
    } else if (main.type === 'ERROR') {
      summary    = 'エラー発生';
      opContent  = String(main.message || '').slice(0, 80);
      target     = '—';
      inputVal   = '—';
    } else if (main.type === 'BACKEND') {
      summary    = main.processName || 'バックエンド処理';
      opContent  = summary + ' — ' + (main.status || '');
      target     = main.processName || '—';
      inputVal   = main.rowCount != null ? main.rowCount + '件' : '—';
    }

    const be = grp.find(x => x.type === 'BACKEND');
    if (be && main.type === 'UI_CLICK') {
      opContent += '（結果: ' + (be.rowCount ?? '?') + '件）';
    }

    // このseqの traceId に紐づく consoleLogs（v3.0追加）
    const seqConsoleLogs = (consoleByTrace[e.traceId] || [])
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));

    seqs.push({
      seqNo      : no,
      traceId    : e.traceId,
      screenId   : main.screenId || main.featureId || '',
      ts         : main.ts || e.ts,
      summary,
      opContent,
      target,
      inputVal,
      shots      : ssMap[e.traceId] || [],
      issues     : issMap[e.traceId] || [],
      autoNG     : hasErr || (issMap[e.traceId] || []).some(i => i.severity === 'Critical' || i.severity === 'High'),
      consoleLogs: seqConsoleLogs,  // ← v3.0追加
      context    : (grp.find(x => x.context) || {}).context || {}
    });
  }
  return seqs;
}

/* ----------------------------------------------------------------
 * buildAllSeqs(): タイムラインページ用に全画面の seq を時系列で収集
 * featureId / screenName / globalSeqNo を付与した配列を返す
 * ---------------------------------------------------------------- */
function buildAllSeqs(fids, allLogs, allShots, issData, allConsoleLogs) {
  const result = [];
  for (const fid of fids) {
    const fi = (issData.issues || []).filter(i => i.featureId === fid);
    const cl = allConsoleLogs[fid] || [];
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi, cl);
    for (const s of seqs) {
      result.push(Object.assign({}, s, {
        featureId  : fid,
        screenName : SCREEN_NAME_MAP[fid] || fid,
        // タイムライン表示用の最初のスクショパス（あれば）
        thumbPath  : s.shots.length
          ? '../screenshots/' + fid + '/' + s.shots[0].fname
          : null
      }));
    }
  }
  // 時刻順にソートして globalSeqNo を付与
  result.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  result.forEach((s, i) => { s.globalSeqNo = i + 1; });
  return result;
}

// ─────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function shortLabel(s) {
  return s.replace(/^(BTN_CLICK:|INPUT_CHANGE:|SELECT_CHANGE:)/,'').slice(0,50);
}
function fmtTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP');
  } catch { return ts; }
}
function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  catch { return ts; }
}
function triggerLabel(tr) {
  if (!tr) return 'スクショ';
  if (tr === 'SCREEN_LOAD')    return '画面表示';
  if (tr === 'JS_ERROR')       return 'JSエラー';
  if (tr.includes('_BEFORE'))  return '操作前';
  if (tr.includes('_AFTER'))   return '操作後';
  return tr.slice(0, 20);
}
function triggerStyle(tr) {
  if (!tr)                     return 'border-color:#cbd5e1;';
  if (tr.includes('_BEFORE'))  return 'border-color:#f97316;';
  if (tr.includes('_AFTER'))   return 'border-color:#ef4444;';
  if (tr === 'SCREEN_LOAD')    return 'border-color:#93c5fd;';
  if (tr === 'JS_ERROR')       return 'border-color:#dc2626;';
  return 'border-color:#cbd5e1;';
}
function triggerHeaderStyle(tr) {
  if (!tr)                     return 'background:#f8fafc;color:#475569;';
  if (tr.includes('_BEFORE'))  return 'background:#fff7ed;color:#9a3412;';
  if (tr.includes('_AFTER'))   return 'background:#fff5f5;color:#991b1b;';
  if (tr === 'SCREEN_LOAD')    return 'background:#eff6ff;color:#1d4ed8;';
  if (tr === 'JS_ERROR')       return 'background:#fee2e2;color:#7f1d1d;';
  return 'background:#f8fafc;color:#475569;';
}

// ─────────────────────────────────────────────────────────────
// レンダリング：サイドバー
// ─────────────────────────────────────────────────────────────
function renderSidebar(fids) {
  const items = fids.map(fid => `
<div class="nav-item" onclick="showPage('${esc(fid)}')" id="nav-${esc(fid)}">
  <span id="nicon-${esc(fid)}">🟡</span>
  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${esc(fid)}</span>
</div>
<div class="nav-item nav-sub" onclick="showPage('flow_${esc(fid)}')" id="nav-flow-${esc(fid)}">
  <span>↳</span><span>遷移図</span>
</div>`).join('');

  return `
<nav id="sidebar">
  <div style="padding:20px 16px 14px;border-bottom:1px solid #1e293b;">
    <div style="font-size:15px;font-weight:700;color:#f1f5f9;">📋 画面レビュー資料</div>
    <div style="font-size:11px;color:#475569;margin-top:3px;" id="sidebar-date"></div>
  </div>
  <div style="padding:10px 0 4px;">
    <div class="nav-item active" onclick="showPage('dashboard')">🏠 ダッシュボード</div>
  </div>
  <div class="nav-group">作業管理</div>
  <div class="nav-item" onclick="showPage('timeline')">📊 作業タイムライン</div>
  <div class="nav-item" onclick="showPage('patterns');renderPatternList()">📌 作業パターン</div>
  <div class="nav-group">画面一覧（${fids.length}画面）</div>
  ${items}
  <div class="nav-group" style="margin-top:8px;">管理</div>
  <div class="nav-item" onclick="showPage('issues')">🐛 課題一覧</div>
  <div style="margin:14px;padding:12px;background:#1e293b;border-radius:8px;font-size:11px;color:#64748b;line-height:2.2;">
    ✅ 確認済 &nbsp; 🟡 確認中<br>🔴 課題あり &nbsp; ⬜ 未確認
  </div>
</nav>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：ダッシュボード
// ─────────────────────────────────────────────────────────────
function renderDashboard(fids, allLogs, allShots, issuesData) {
  const rows = fids.map(fid => {
    const n    = SCREEN_NAME_MAP[fid] || fid;
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [],
                   (issuesData.issues || []).filter(i => i.featureId === fid));
    return `<tr>
  <td class="mono" style="font-size:11px;">${esc(fid)}</td>
  <td><span onclick="showPage('${esc(fid)}')" style="color:#2563eb;cursor:pointer;text-decoration:underline;">${esc(n)}</span></td>
  <td><span class="badge badge-warn" id="db-badge-${esc(fid)}">🟡 確認中</span></td>
  <td id="db-ngc-${esc(fid)}">—</td>
  <td>${(allLogs[fid] || []).length}件 / ${seqs.length}seq</td>
  <td><button onclick="showPage('flow_${esc(fid)}')"
      style="font-size:11px;padding:3px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;cursor:pointer;color:#1d4ed8;">遷移図</button></td>
</tr>`;
  }).join('');

  return `
<div id="dashboard">
  <div style="margin-bottom:24px;">
    <h1 style="font-size:22px;font-weight:700;color:#0f172a;">レビュー進捗ダッシュボード</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;" id="dash-date"></p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
    <div class="stat-card"><div class="stat-label">総画面数</div>
      <div class="stat-num" style="color:#0f172a;">${fids.length}</div></div>
    <div class="stat-card"><div class="stat-label">確認済</div>
      <div class="stat-num" style="color:#16a34a;" id="db-ok">0</div></div>
    <div class="stat-card"><div class="stat-label">課題あり</div>
      <div class="stat-num" style="color:#dc2626;" id="db-ng">0</div></div>
    <div class="stat-card"><div class="stat-label">未確認</div>
      <div class="stat-num" style="color:#94a3b8;" id="db-pend">${fids.length}</div></div>
  </div>
  <div class="card">
    <div class="card-title">画面一覧</div>
    <table class="spec-table">
      <thead><tr><th>screenId</th><th>画面名</th><th>状態</th><th>課題数</th><th>ログ</th><th>遷移図</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：スクショブロック
// ─────────────────────────────────────────────────────────────
function renderSsBlock(shots) {
  if (!shots || !shots.length) {
    return '<div style="color:#94a3b8;font-size:12px;padding:8px;">スクリーンショットなし</div>';
  }
  return shots.map(ss => {
    const bc  = triggerStyle(ss.trigger);
    const hs  = triggerHeaderStyle(ss.trigger);
    const lb  = triggerLabel(ss.trigger);
    const rp  = '../screenshots/' + esc(ss.fid) + '/' + esc(ss.fname);
    return `<div style="margin-bottom:10px;border-radius:8px;border:2px solid;${bc}overflow:hidden;">
<div style="padding:5px 12px;font-size:11px;font-weight:700;${hs}">${lb}</div>
<div style="background:#f8fafc;cursor:pointer;text-align:center;"
     onclick="openSsModal('${rp}','${esc(lb)}')">
  <img src="${rp}" alt="${lb}"
       style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"
       onerror="this.parentElement.innerHTML='<div style=\\'padding:16px;color:#94a3b8;font-size:12px;\\'>画像未取得</div>'"/>
</div>
<div style="padding:3px 8px;font-size:10px;color:#94a3b8;font-family:monospace;
     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ss.fname)}</div>
</div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// レンダリング：コンソールログブロック（v3.0追加）
// ─────────────────────────────────────────────────────────────
function renderConsoleBlock(consoleLogs, sk) {
  if (!consoleLogs || !consoleLogs.length) {
    return `<div class="cl-empty">このseqでのコンソール出力なし</div>`;
  }
  const rows = consoleLogs.map(cl => {
    const args = (cl.args || []).map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ');
    const lvl   = cl.level || 'log';
    const time  = fmtTime(cl.ts);
    const stack = cl.stack ? `<div class="cl-stack">${esc(cl.stack)}</div>` : '';
    return `<div class="cl-entry cl-${esc(lvl)}">
  <span class="cl-badge cl-badge-${esc(lvl)}">${esc(lvl.toUpperCase())}</span>
  <span class="cl-time">${esc(time)}</span>
  <span class="cl-msg">${esc(args.slice(0, 300))}</span>
  ${stack}
</div>`;
  }).join('');

  const errCnt  = consoleLogs.filter(c => c.level === 'error').length;
  const warnCnt = consoleLogs.filter(c => c.level === 'warn').length;
  const badge   = errCnt
    ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;">${errCnt} ERROR</span>`
    : warnCnt
      ? `<span style="background:#fef9c3;color:#92400e;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;">${warnCnt} WARN</span>`
      : '';

  return `<div class="cl-block">
  <div class="cl-header" onclick="toggleConsole('${sk}')">
    <span>▶ Console Logs（${consoleLogs.length}件）</span>
    ${badge}
    <span id="cl-tog-${sk}" style="margin-left:auto;font-size:11px;color:#94a3b8;">クリックで展開</span>
  </div>
  <div class="cl-body" id="cl-body-${sk}" style="display:none;">
    ${rows}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：アクションログ 1件
// ─────────────────────────────────────────────────────────────
function renderActionLog(seq) {
  const sk       = esc(seq.featureId + '_seq' + seq.seqNo);
  const autoNgStr = seq.autoNG ? 'true' : 'false';

  const autoIssueHtml = (seq.issues || []).map(iss => {
    const isBug = iss.severity === 'Critical' || iss.severity === 'High';
    const cls   = isBug ? 'issue-note-bug' : 'issue-note-spec';
    const icon  = isBug ? '🐛' : '📝';
    return `<div class="${cls}">${icon} [${esc(iss.ruleId)}] ${esc(iss.description || '')}
<br><small style="opacity:.8;">提案: ${esc(iss.fixSuggestion || '')}</small></div>`;
  }).join('');

  const ssHtml = renderSsBlock(seq.shots);

  // コンソールログセクション（v3.0追加）
  const consoleHtml = renderConsoleBlock(seq.consoleLogs, sk);

  return `
<div class="action-log${seq.autoNG ? ' is-ng' : ''}" id="al-${sk}">
  <div class="al-header">
    <div class="al-header-cell">
      <div class="al-fieldlabel">seqNo</div>
      <div class="al-fieldvalue">${seq.seqNo}</div>
    </div>
    <div class="al-header-cell" style="flex:1;">
      <div class="al-fieldlabel">概要</div>
      <div class="al-fieldvalue">${esc(seq.summary)}</div>
    </div>
    <div class="al-header-cell">
      <div class="al-fieldlabel">操作日時</div>
      <div class="al-fieldvalue">${esc(fmtTs(seq.ts))}</div>
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
    ${ssHtml}
  </div>
  <div class="al-detail">
    <div class="al-row">
      <div class="al-label">操作内容</div>
      <div class="al-value">${esc(seq.opContent)}</div>
    </div>
    <div class="al-row">
      <div class="al-label">対象要素</div>
      <div class="al-value">${seq.target === '—'
        ? '<span style="color:#94a3b8;">—</span>'
        : esc(seq.target)}</div>
    </div>
    <div class="al-row">
      <div class="al-label">入力値</div>
      <div class="al-value">${seq.inputVal && seq.inputVal !== '—'
        ? `<span class="mono" style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;">${esc(seq.inputVal)}</span>`
        : '<span style="color:#94a3b8;">—</span>'}</div>
    </div>
    <div class="al-row">
      <div class="al-label">Console</div>
      <div class="al-value">${consoleHtml}</div>
    </div>
    <div class="al-row">
      <div class="al-label">判定</div>
      <div class="al-value">
        <button class="verdict-btn" onclick="toggleVerdict('${sk}')" title="クリックでOK/NG切替">
          <div class="toggle${seq.autoNG ? ' toggle-off' : ' toggle-on'}" id="vtog-${sk}"></div>
          <span class="${seq.autoNG ? 'verdict-text-ng' : 'verdict-text-ok'}" id="vlbl-${sk}">${seq.autoNG ? 'NG' : 'OK'}</span>
        </button>
        <span style="font-size:11px;color:#94a3b8;margin-left:8px;">クリックで切替</span>
        <input type="hidden" id="vauto-${sk}" value="${autoNgStr}">
      </div>
    </div>
    <div class="al-row">
      <div class="al-label">問題点課題</div>
      <div class="al-value">
        ${autoIssueHtml}
        <div id="issue-none-${sk}"${seq.autoNG ? ' style="display:none;"' : ''} style="color:#94a3b8;">なし</div>
        <div class="issue-form${seq.autoNG ? ' open' : ''}" id="iform-${sk}">
          <div class="issue-form-row">
            <span class="iff-label">種別</span>
            <select class="iff-select" id="ift-${sk}" onchange="saveIssue('${sk}')">
              <option value="不具合">🐛 不具合</option>
              <option value="仕様違い">📐 仕様違い</option>
              <option value="改善提案">💡 改善提案</option>
              <option value="未確認">❓ 未確認</option>
              <option value="その他">📌 その他</option>
            </select>
            <span class="iff-label" style="margin-left:8px;">優先度</span>
            <select class="iff-select" id="ifp-${sk}" onchange="saveIssue('${sk}')">
              <option value="高">🔴 高</option>
              <option value="中">🟡 中</option>
              <option value="低">🟢 低</option>
            </select>
            <span class="iff-label" style="margin-left:8px;">対応状態</span>
            <select class="iff-select" id="ifs-${sk}" onchange="saveIssue('${sk}')">
              <option value="未対応">⏸ 未対応</option>
              <option value="対応中">🔄 対応中</option>
              <option value="対応済">✅ 対応済</option>
              <option value="クローズ">🔒 クローズ</option>
            </select>
          </div>
          <div class="issue-form-row">
            <span class="iff-label">内容</span>
            <textarea class="iff-textarea" id="ifc-${sk}" rows="3"
              placeholder="課題・問題点の内容を記入してください..."
              oninput="saveIssue('${sk}')"></textarea>
          </div>
          <div class="issue-form-row">
            <span class="iff-label">備考</span>
            <input type="text" class="iff-input" id="ifm-${sk}"
              placeholder="担当者・期限など" oninput="saveIssue('${sk}')"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：画面ページ
// ─────────────────────────────────────────────────────────────
function renderScreenPage(fid, entries, shots, issuesData, consoleLogs) {
  const name    = SCREEN_NAME_MAP[fid] || fid;
  const fi      = (issuesData.issues || []).filter(i => i.featureId === fid);
  const cl      = consoleLogs[fid] || [];
  const seqs    = buildSequences(entries, shots, fi, cl);
  const firstTs = entries.length ? fmtTs(entries[0].ts) : '';
  const actHtml = seqs.length === 0
    ? '<p style="color:#94a3b8;font-size:13px;">ログが存在しません。</p>'
    : seqs.map(seq => {
        // featureId を seq に付与（renderActionLog が使用）
        seq.featureId = fid;
        return renderActionLog(seq);
      }).join('');

  return `
<div id="${esc(fid)}" class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;flex-wrap:wrap;gap:10px;">
    <div>
      <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;margin-bottom:3px;">${esc(fid)}</div>
      <h1 style="font-size:21px;font-weight:700;color:#0f172a;">${esc(name)}</h1>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">
        ログ取得: ${esc(firstTs)} &nbsp;|&nbsp; ${entries.length}件 / ${seqs.length}シーケンス
      </div>
    </div>
    <span class="badge badge-warn" id="sbadge-${esc(fid)}" style="font-size:13px;padding:6px 14px;">🟡 確認中</span>
  </div>
  <div class="card">
    <div class="card-title">画面概要</div>
    <table class="spec-table">
      <tbody>
        <tr><td style="width:120px;font-weight:600;color:#64748b;">featureId</td>
            <td class="mono">${esc(fid)}</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">画面名</td>
            <td>${esc(name)}</td></tr>
        <tr><td style="font-weight:600;color:#64748b;">ログ数</td>
            <td>${entries.length}件 / ${seqs.length}シーケンス / スクショ${(shots || []).length}枚</td></tr>
      </tbody>
    </table>
  </div>
  <div class="card">
    <div class="card-title">アクションレビュー（${seqs.length}シーケンス）</div>
    ${actHtml}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：画面遷移図ページ
// ─────────────────────────────────────────────────────────────
function renderFlowPage(featureId, seqs) {
  const name = SCREEN_NAME_MAP[featureId] || featureId;
  let flowHtml = '';
  for (let i = 0; i < seqs.length; i++) {
    const s  = seqs[i];
    const sk = esc(featureId + '_seq' + s.seqNo);
    const cls = i === 0 ? 'flow-box start'
              : i === seqs.length - 1 ? 'flow-box end'
              : 'flow-box';
    const ngStyle = s.autoNG ? 'border-color:#dc2626;background:#fff5f5;' : '';
    flowHtml += `<div class="${cls}" style="${ngStyle}"
     onclick="showPage('${esc(featureId)}');setTimeout(function(){scrollToActionLog('${esc(featureId)}',${s.seqNo});},300);">
  <div class="flow-seq">seq ${s.seqNo}</div>
  <div class="flow-screen">${esc((s.screenId || featureId).replace(/^MC_/,'').slice(0,12))}</div>
  <div class="flow-label">${esc(s.summary.slice(0, 18))}</div>
  <div id="fbox-${sk}" style="font-size:10px;margin-top:3px;">${s.autoNG
    ? '<span style="color:#dc2626;font-weight:700;">❌ NG</span>'
    : '<span style="color:#16a34a;font-weight:700;">✅ OK</span>'}</div>
</div>
${i < seqs.length - 1
  ? `<div class="flow-arrow" id="farr-${sk}">
  <svg width="36" height="20" viewBox="0 0 36 20">
    <line x1="0" y1="10" x2="28" y2="10" stroke="#16a34a" stroke-width="2"/>
    <polygon points="26,5 36,10 26,15" fill="#16a34a"/>
  </svg>
</div>` : ''}`;
  }

  let thumbHtml = '';
  for (const s of seqs) {
    const sk  = esc(featureId + '_seq' + s.seqNo);
    const img = s.shots.length
      ? `<img src="../screenshots/${esc(s.shots[0].fid)}/${esc(s.shots[0].fname)}"
           style="width:100%;height:90px;object-fit:cover;display:block;"
           onerror="this.style.display='none'">`
      : '<div style="width:100%;height:90px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;">No image</div>';
    thumbHtml += `<div class="thumb-card${s.autoNG ? ' is-ng' : ''}" id="thumb-${sk}"
     onclick="showPage('${esc(featureId)}');setTimeout(function(){scrollToActionLog('${esc(featureId)}',${s.seqNo});},300);">
  <div class="thumb-img-area">
    <div class="thumb-seq-badge">seq ${s.seqNo}</div>
    ${img}
  </div>
  <div class="thumb-info">
    <div class="thumb-screen-id">${esc(s.screenId)}</div>
    <div class="thumb-title">${esc(s.summary)}</div>
    <div class="thumb-action">
      操作: <span>${esc(s.opContent.slice(0, 20))}</span>
    </div>
  </div>
</div>`;
  }

  return `
<div id="flow_${esc(featureId)}" class="page">
  <div style="margin-bottom:22px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🗺️ 画面遷移図 — ${esc(name)}</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">操作フロー（上段）とスクリーンショット一覧（下段）</p>
  </div>
  <div class="card">
    <div class="card-title">操作フロー — ${esc(featureId)}</div>
    <div class="flow-canvas">
      <div class="flow-row">${flowHtml}</div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">スクリーンショット一覧</div>
    <div class="thumb-grid">${thumbHtml}</div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：作業タイムラインページ（v3.0追加）
// ─────────────────────────────────────────────────────────────
function renderTimelinePage(allSeqs, fids) {
  // JSON 埋め込み用に consoleLogs を除いた軽量データを生成
  const tlData = allSeqs.map(s => ({
    globalSeqNo : s.globalSeqNo,
    featureId   : s.featureId,
    screenName  : s.screenName,
    seqNo       : s.seqNo,
    traceId     : s.traceId,
    screenId    : s.screenId,
    ts          : s.ts,
    summary     : s.summary,
    opContent   : s.opContent,
    autoNG      : s.autoNG,
    thumbPath   : s.thumbPath,
    consoleErr  : (s.consoleLogs || []).filter(c => c.level === 'error').length,
    consoleWarn : (s.consoleLogs || []).filter(c => c.level === 'warn').length,
  }));

  const fidsJson  = JSON.stringify(fids);
  const colorsJson = JSON.stringify(
    Object.fromEntries(fids.map((fid, i) => [fid, FEATURE_COLORS[i % FEATURE_COLORS.length]]))
  );
  const tlDataJson = JSON.stringify(tlData);

  return `
<div id="timeline" class="page" style="display:none;">
  <div style="margin-bottom:20px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">📊 作業タイムライン</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">
      全画面横断の時系列表示 — クリックで選択、Shiftクリックで範囲選択
    </p>
  </div>

  <!-- フィルター -->
  <div class="card" style="margin-bottom:16px;padding:14px 18px;">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:12px;font-weight:700;color:#64748b;">画面フィルター:</span>
      <button onclick="tlFilterAll()" id="tlf-all"
        style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;cursor:pointer;">
        すべて表示
      </button>
      <div id="tl-filter-btns" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      <span style="margin-left:auto;font-size:12px;color:#64748b;" id="tl-total-label"></span>
    </div>
  </div>

  <!-- タイムラインエリア -->
  <div class="card" style="padding:0;overflow:hidden;">
    <div id="tl-container" style="overflow-x:auto;overflow-y:auto;max-height:460px;padding:20px;background:#f8fafc;">
      <div id="tl-row" style="display:flex;gap:10px;align-items:flex-start;min-width:max-content;"></div>
    </div>
  </div>

  <!-- 選択パネル（選択時に表示） -->
  <div id="tl-selection-panel" style="display:none;margin-top:16px;">
    <div class="card" style="border:2px solid #3b82f6;background:#eff6ff;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
        <div style="font-size:14px;font-weight:700;color:#1d4ed8;">
          📌 選択中: <span id="tl-sel-count">0</span> seq
        </div>
        <div id="tl-sel-summary" style="font-size:12px;color:#475569;flex:1;"></div>
        <button onclick="clearTlSelection()"
          style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid #94a3b8;background:white;cursor:pointer;">
          選択解除
        </button>
        <button onclick="openPatternModal()"
          style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:8px;
                 border:none;background:#3b82f6;color:white;cursor:pointer;">
          📌 作業パターンとして登録
        </button>
      </div>
      <div id="tl-sel-list" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
  </div>

  <!-- タイムラインデータ（JSON埋め込み） -->
  <script>
    var TL_DATA   = ${tlDataJson};
    var TL_FIDS   = ${fidsJson};
    var TL_COLORS = ${colorsJson};
    var tlSelected = [];     // 選択中 globalSeqNo の配列
    var tlLastIdx  = -1;     // Shift選択用の基点インデックス
    var tlVisible  = null;   // null = 全表示、配列 = フィルタ中の featureId

    // タイムライン初期化
    function initTimeline() {
      renderTlFilterBtns();
      renderTlCards();
    }

    // フィルターボタン生成
    function renderTlFilterBtns() {
      var el = document.getElementById('tl-filter-btns');
      el.innerHTML = TL_FIDS.map(function(fid) {
        var col = TL_COLORS[fid] || '#94a3b8';
        return '<button onclick="tlFilterFid(\'' + fid + '\')" id="tlf-' + fid + '" ' +
          'style="font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;' +
          'border:1px solid ' + col + ';background:white;color:' + col + ';">' +
          fid.replace('MC_','') + '</button>';
      }).join('');
    }

    function tlFilterAll() {
      tlVisible = null;
      renderTlCards();
    }
    function tlFilterFid(fid) {
      tlVisible = [fid];
      renderTlCards();
    }

    // タイムラインカード描画
    function renderTlCards() {
      var data = tlVisible
        ? TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId) >= 0; })
        : TL_DATA;
      var row = document.getElementById('tl-row');
      var lbl = document.getElementById('tl-total-label');
      if (lbl) lbl.textContent = data.length + ' seq';

      row.innerHTML = data.map(function(s, idx) {
        var col   = TL_COLORS[s.featureId] || '#94a3b8';
        var isSel = tlSelected.indexOf(s.globalSeqNo) >= 0;
        var ngMark = s.autoNG
          ? '<div style="color:#dc2626;font-weight:700;font-size:10px;">❌ NG</div>' : '';
        var errBadge = s.consoleErr
          ? '<span style="background:#fee2e2;color:#b91c1c;border-radius:3px;padding:0 4px;font-size:9px;">' + s.consoleErr + ' ERR</span>' : '';
        var warnBadge = s.consoleWarn
          ? '<span style="background:#fef9c3;color:#854d0e;border-radius:3px;padding:0 4px;font-size:9px;">' + s.consoleWarn + ' WRN</span>' : '';
        var thumb = s.thumbPath
          ? '<img src="' + s.thumbPath + '" style="width:100%;height:64px;object-fit:cover;display:block;" ' +
            'onerror="this.style.display=\'none\'">'
          : '<div style="width:100%;height:64px;background:#e2e8f0;display:flex;align-items:center;' +
            'justify-content:center;font-size:10px;color:#94a3b8;">No img</div>';
        var selStyle = isSel
          ? 'border:2px solid #3b82f6;background:#eff6ff;box-shadow:0 0 0 2px #93c5fd;'
          : 'border:2px solid ' + col + ';background:white;';
        return '<div class="tl-card" data-gseq="' + s.globalSeqNo + '" data-idx="' + idx + '" ' +
          'onclick="tlCardClick(event,' + s.globalSeqNo + ',' + idx + ')" ' +
          'style="' + selStyle + 'border-radius:8px;cursor:pointer;width:120px;flex-shrink:0;' +
          'overflow:hidden;transition:box-shadow .15s;">' +
          '<div style="background:' + col + ';padding:3px 6px;display:flex;justify-content:space-between;align-items:center;">' +
          '  <span style="color:white;font-size:10px;font-weight:700;">seq ' + s.globalSeqNo + '</span>' +
          '  <span style="color:white;font-size:9px;opacity:.85;">' + (s.featureId||'').replace('MC_','').slice(0,8) + '</span>' +
          '</div>' +
          thumb +
          '<div style="padding:5px 6px;">' +
          '  <div style="font-size:10px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(s.summary) + '</div>' +
          '  <div style="font-size:9px;color:#64748b;margin-top:2px;">' + escHtml(fmtTimeJs(s.ts)) + '</div>' +
          '  <div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap;">' + ngMark + errBadge + warnBadge + '</div>' +
          '</div></div>';
      }).join(
        '<div style="display:flex;align-items:center;padding:0 4px;">' +
        '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<line x1="0" y1="8" x2="10" y2="8" stroke="#cbd5e1" stroke-width="1.5"/>' +
        '<polygon points="8,4 16,8 8,12" fill="#cbd5e1"/>' +
        '</svg></div>'
      );
    }

    // タイムラインカードクリック
    function tlCardClick(evt, gseq, idx) {
      if (evt.shiftKey && tlLastIdx >= 0) {
        // Shift+クリック: 範囲選択
        var data = tlVisible
          ? TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId) >= 0; })
          : TL_DATA;
        var from = Math.min(tlLastIdx, idx);
        var to   = Math.max(tlLastIdx, idx);
        for (var i = from; i <= to; i++) {
          var g = data[i].globalSeqNo;
          if (tlSelected.indexOf(g) < 0) tlSelected.push(g);
        }
      } else if (evt.ctrlKey || evt.metaKey) {
        // Ctrl+クリック: 個別トグル
        var pos = tlSelected.indexOf(gseq);
        if (pos >= 0) tlSelected.splice(pos, 1);
        else tlSelected.push(gseq);
        tlLastIdx = idx;
      } else {
        // 通常クリック: 単選択
        tlSelected = [gseq];
        tlLastIdx  = idx;
      }
      renderTlCards();
      updateSelPanel();
    }

    function clearTlSelection() {
      tlSelected = [];
      tlLastIdx  = -1;
      renderTlCards();
      updateSelPanel();
    }

    // 選択パネル更新
    function updateSelPanel() {
      var panel = document.getElementById('tl-selection-panel');
      var cnt   = document.getElementById('tl-sel-count');
      var sum   = document.getElementById('tl-sel-summary');
      var list  = document.getElementById('tl-sel-list');
      if (tlSelected.length === 0) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'block';
      cnt.textContent = tlSelected.length;
      var selected = TL_DATA.filter(function(s){ return tlSelected.indexOf(s.globalSeqNo) >= 0; });
      selected.sort(function(a,b){ return a.globalSeqNo - b.globalSeqNo; });
      var fids2 = [...new Set(selected.map(function(s){ return s.featureId; }))];
      sum.textContent = 'seq ' + selected[0].globalSeqNo + ' ～ ' + selected[selected.length-1].globalSeqNo +
        ' ｜ 画面: ' + fids2.map(function(f){ return f.replace('MC_',''); }).join(', ');
      list.innerHTML = selected.map(function(s) {
        var col = TL_COLORS[s.featureId] || '#94a3b8';
        return '<div style="background:white;border:1px solid ' + col + ';border-radius:6px;' +
          'padding:4px 8px;font-size:11px;color:#334155;">' +
          '<span style="color:' + col + ';font-weight:700;">seq ' + s.globalSeqNo + '</span> ' +
          escHtml(s.featureId.replace('MC_','')) + ' — ' + escHtml(s.summary.slice(0,20)) + '</div>';
      }).join('');
    }

    // ユーティリティ
    function escHtml(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmtTimeJs(ts) {
      try {
        var d = new Date(ts);
        return d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      } catch(e) { return ts||''; }
    }
  </script>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：作業パターンページ（v3.0追加）
// ─────────────────────────────────────────────────────────────
function renderWorkPatternsPage() {
  return `
<div id="patterns" class="page" style="display:none;">
  <div style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <h1 style="font-size:21px;font-weight:700;color:#0f172a;">📌 作業パターン</h1>
      <button onclick="openPatternModal()"
        style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:8px;
               border:none;background:#3b82f6;color:white;cursor:pointer;margin-left:auto;">
        ＋ 新規パターン登録
      </button>
    </div>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">
      タイムラインでseqを選択してパターン登録。一覧は localStorage に永続保存。
    </p>
  </div>

  <!-- サマリーカード -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
    <div class="stat-card"><div class="stat-label">パターン数</div>
      <div class="stat-num" style="color:#0f172a;" id="wpt-total">0</div></div>
    <div class="stat-card"><div class="stat-label">OK</div>
      <div class="stat-num" style="color:#16a34a;" id="wpt-ok">0</div></div>
    <div class="stat-card"><div class="stat-label">NG</div>
      <div class="stat-num" style="color:#dc2626;" id="wpt-ng">0</div></div>
    <div class="stat-card"><div class="stat-label">未評価</div>
      <div class="stat-num" style="color:#94a3b8;" id="wpt-pend">0</div></div>
  </div>

  <!-- パターン一覧 -->
  <div id="pattern-list-area">
    <div class="card" style="color:#94a3b8;padding:32px;text-align:center;">
      まだ作業パターンが登録されていません。<br>
      タイムラインページでseqを選択し「作業パターンとして登録」をクリックしてください。
    </div>
  </div>
</div>

<!-- 作業パターン登録モーダル -->
<div id="wpt-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);
     z-index:1000;display:none;align-items:center;justify-content:center;">
  <div style="background:white;border-radius:16px;max-width:600px;width:90%;padding:28px;
              max-height:90vh;overflow-y:auto;position:relative;">
    <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:20px;">📌 作業パターン登録</h2>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">
        パターン名 <span style="color:#dc2626;">*</span>
      </label>
      <input id="wpt-name" type="text" placeholder="例: 初期表示、加工ID切り替え"
        style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:14px;box-sizing:border-box;">
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">説明</label>
      <textarea id="wpt-desc" rows="3" placeholder="このパターンの操作内容・目的を記入"
        style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">画面モード</label>
        <select id="wpt-mode"
          style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;">
          <option value="">選択してください</option>
          <option value="閲覧">閲覧</option>
          <option value="編集">編集</option>
          <option value="新規">新規</option>
          <option value="混在">混在（複数画面）</option>
          <option value="その他">その他</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">全体評価</label>
        <select id="wpt-status"
          style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;">
          <option value="未評価">⬜ 未評価</option>
          <option value="OK">✅ OK</option>
          <option value="NG">❌ NG</option>
        </select>
      </div>
    </div>

    <div id="wpt-ng-area" style="display:none;margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">
        NG内容 <span style="color:#dc2626;">*</span>
      </label>
      <textarea id="wpt-ng-content" rows="3" placeholder="NG の内容・問題点を記入"
        style="width:100%;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:13px;
               box-sizing:border-box;resize:vertical;background:#fff5f5;"></textarea>
      <div style="margin-top:8px;">
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">優先度</label>
        <select id="wpt-ng-priority"
          style="width:100%;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:13px;background:#fff5f5;">
          <option value="高">🔴 高</option>
          <option value="中">🟡 中</option>
          <option value="低">🟢 低</option>
        </select>
      </div>
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:8px;">
        対象seq（<span id="wpt-modal-seqcnt">0</span>件）
      </div>
      <div id="wpt-modal-seqlist" style="display:flex;gap:6px;flex-wrap:wrap;max-height:120px;overflow-y:auto;"></div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="closePatternModal()"
        style="padding:8px 20px;border-radius:8px;border:1px solid #cbd5e1;background:white;cursor:pointer;font-size:13px;">
        キャンセル
      </button>
      <button onclick="savePattern()"
        style="padding:8px 20px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:13px;font-weight:700;">
        💾 保存
      </button>
    </div>
  </div>
</div>

<script>
  // ── 作業パターン localStorage ──────────────────────────────────
  var WPT_KEY = 'wpt_v3_machining';

  function loadPatterns() {
    try { return JSON.parse(localStorage.getItem(WPT_KEY)) || []; }
    catch(e) { return []; }
  }
  function savePatterns(patterns) {
    try { localStorage.setItem(WPT_KEY, JSON.stringify(patterns)); } catch(e) {}
  }
  function genPatternId() {
    return 'WP-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  }

  // ── モーダル制御 ──────────────────────────────────────────────
  function openPatternModal(editId) {
    var modal = document.getElementById('wpt-modal');
    modal.style.display = 'flex';

    if (editId) {
      // 編集モード
      var pats = loadPatterns();
      var p    = pats.find(function(x){ return x.id === editId; });
      if (!p) return;
      modal.dataset.editId = editId;
      document.getElementById('wpt-name').value        = p.name || '';
      document.getElementById('wpt-desc').value        = p.description || '';
      document.getElementById('wpt-mode').value        = p.screenMode || '';
      document.getElementById('wpt-status').value      = p.overallStatus || '未評価';
      document.getElementById('wpt-ng-content').value  = p.ngContent || '';
      document.getElementById('wpt-ng-priority').value = p.ngPriority || '中';
      toggleNgArea();
      renderModalSeqList(p.seqs || []);
    } else {
      // 新規登録モード（タイムラインの選択 seq を使用）
      delete modal.dataset.editId;
      document.getElementById('wpt-name').value   = '';
      document.getElementById('wpt-desc').value   = '';
      document.getElementById('wpt-mode').value   = '';
      document.getElementById('wpt-status').value = '未評価';
      document.getElementById('wpt-ng-content').value  = '';
      document.getElementById('wpt-ng-priority').value = '中';
      toggleNgArea();
      var seqData = typeof tlSelected !== 'undefined'
        ? TL_DATA.filter(function(s){ return tlSelected.indexOf(s.globalSeqNo) >= 0; })
            .sort(function(a,b){ return a.globalSeqNo - b.globalSeqNo; })
        : [];
      renderModalSeqList(seqData);
    }
  }

  function closePatternModal() {
    document.getElementById('wpt-modal').style.display = 'none';
  }

  function toggleNgArea() {
    var status = document.getElementById('wpt-status').value;
    var area   = document.getElementById('wpt-ng-area');
    area.style.display = status === 'NG' ? 'block' : 'none';
  }

  function renderModalSeqList(seqs) {
    var cnt = document.getElementById('wpt-modal-seqcnt');
    var lst = document.getElementById('wpt-modal-seqlist');
    cnt.textContent = seqs.length;
    if (seqs.length === 0) {
      lst.innerHTML = '<span style="color:#94a3b8;font-size:12px;">seqが選択されていません。タイムラインで選択してください。</span>';
      return;
    }
    lst.innerHTML = seqs.map(function(s) {
      var col = (typeof TL_COLORS !== 'undefined' && TL_COLORS[s.featureId]) || '#94a3b8';
      var fid = s.featureId || s.screenId || '?';
      var gsn = s.globalSeqNo || s.seqNo;
      return '<div style="background:white;border:1px solid ' + col + ';border-radius:5px;' +
        'padding:3px 7px;font-size:11px;color:#334155;">' +
        '<span style="color:' + col + ';font-weight:700;">seq ' + gsn + '</span> ' +
        String(fid).replace('MC_','') + ' — ' + escHtml(String(s.summary||'').slice(0,18)) + '</div>';
    }).join('');
  }

  // ── パターン保存 ──────────────────────────────────────────────
  function savePattern() {
    var name   = document.getElementById('wpt-name').value.trim();
    var status = document.getElementById('wpt-status').value;
    if (!name) {
      alert('パターン名を入力してください。');
      document.getElementById('wpt-name').focus();
      return;
    }
    if (status === 'NG' && !document.getElementById('wpt-ng-content').value.trim()) {
      alert('NG の場合は NG内容 を入力してください。');
      document.getElementById('wpt-ng-content').focus();
      return;
    }

    var modal = document.getElementById('wpt-modal');
    var seqData = typeof tlSelected !== 'undefined' && !modal.dataset.editId
      ? TL_DATA.filter(function(s){ return tlSelected.indexOf(s.globalSeqNo) >= 0; })
          .sort(function(a,b){ return a.globalSeqNo - b.globalSeqNo; })
      : (function(){
          // 編集時は既存seqを保持
          var pats  = loadPatterns();
          var editId = modal.dataset.editId;
          var old   = pats.find(function(x){ return x.id === editId; });
          return old ? old.seqs : [];
        })();

    var pats    = loadPatterns();
    var editId  = modal.dataset.editId;
    var pattern = {
      id           : editId || genPatternId(),
      name         : name,
      description  : document.getElementById('wpt-desc').value.trim(),
      screenMode   : document.getElementById('wpt-mode').value,
      overallStatus: status,
      ngContent    : document.getElementById('wpt-ng-content').value.trim(),
      ngPriority   : document.getElementById('wpt-ng-priority').value,
      seqs         : seqData,
      updatedAt    : new Date().toISOString(),
      createdAt    : editId
        ? (pats.find(function(x){ return x.id === editId; }) || {}).createdAt || new Date().toISOString()
        : new Date().toISOString()
    };

    if (editId) {
      var idx = pats.findIndex(function(x){ return x.id === editId; });
      if (idx >= 0) pats[idx] = pattern; else pats.push(pattern);
    } else {
      pats.push(pattern);
    }

    savePatterns(pats);
    closePatternModal();
    if (typeof clearTlSelection === 'function') clearTlSelection();

    // パターンページに遷移して一覧更新
    showPage('patterns');
    renderPatternList();
  }

  // ── パターン一覧描画 ──────────────────────────────────────────
  function renderPatternList() {
    var pats = loadPatterns();
    var area = document.getElementById('pattern-list-area');
    if (!area) return;

    // サマリー更新
    var okCnt   = pats.filter(function(p){ return p.overallStatus === 'OK'; }).length;
    var ngCnt   = pats.filter(function(p){ return p.overallStatus === 'NG'; }).length;
    var pendCnt = pats.filter(function(p){ return p.overallStatus !== 'OK' && p.overallStatus !== 'NG'; }).length;
    var tot = document.getElementById('wpt-total');  if(tot) tot.textContent = pats.length;
    var ok  = document.getElementById('wpt-ok');     if(ok)  ok.textContent  = okCnt;
    var ng  = document.getElementById('wpt-ng');     if(ng)  ng.textContent  = ngCnt;
    var pen = document.getElementById('wpt-pend');   if(pen) pen.textContent = pendCnt;

    if (pats.length === 0) {
      area.innerHTML = '<div class="card" style="color:#94a3b8;padding:32px;text-align:center;">' +
        'まだ作業パターンが登録されていません。<br>' +
        'タイムラインページでseqを選択し「作業パターンとして登録」をクリックしてください。</div>';
      return;
    }

    area.innerHTML = pats.map(function(p, pi) {
      var stIcon  = p.overallStatus === 'OK' ? '✅' : p.overallStatus === 'NG' ? '❌' : '⬜';
      var stColor = p.overallStatus === 'OK' ? '#16a34a' : p.overallStatus === 'NG' ? '#dc2626' : '#94a3b8';
      var stBg    = p.overallStatus === 'OK' ? '#f0fdf4' : p.overallStatus === 'NG' ? '#fff5f5' : '#f8fafc';
      var modeTag = p.screenMode
        ? '<span style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:4px;' +
          'padding:1px 7px;font-size:10px;font-weight:700;">' + escHtml(p.screenMode) + '</span>' : '';
      var ngSection = p.overallStatus === 'NG' && p.ngContent
        ? '<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:10px 14px;' +
          'margin-top:10px;font-size:12px;color:#991b1b;">' +
          '<span style="font-weight:700;">❌ NG内容: </span>' + escHtml(p.ngContent) +
          (p.ngPriority ? ' <span style="background:#fecaca;border-radius:3px;padding:1px 5px;font-size:10px;margin-left:6px;">' +
            '優先度：' + escHtml(p.ngPriority) + '</span>' : '') +
          '</div>' : '';
      var seqCount = (p.seqs||[]).length;
      var fidsInPat = [...new Set((p.seqs||[]).map(function(s){ return s.featureId||''; }).filter(Boolean))];
      var fidTags   = fidsInPat.map(function(fid) {
        var col = (typeof TL_COLORS !== 'undefined' && TL_COLORS[fid]) || '#94a3b8';
        return '<span style="background:' + col + '22;border:1px solid ' + col + ';color:' + col + ';' +
          'border-radius:4px;padding:1px 6px;font-size:10px;">' + escHtml(fid.replace('MC_','')) + '</span>';
      }).join(' ');
      var seqList   = (p.seqs||[]).map(function(s) {
        var col = (typeof TL_COLORS !== 'undefined' && TL_COLORS[s.featureId]) || '#94a3b8';
        return '<span style="background:white;border:1px solid ' + col + ';border-radius:4px;' +
          'padding:1px 7px;font-size:10px;">seq ' + (s.globalSeqNo||s.seqNo) + '</span>';
      }).join(' ');
      var updAt = p.updatedAt
        ? new Date(p.updatedAt).toLocaleString('ja-JP',{dateStyle:'short',timeStyle:'short'}) : '';

      return '<div class="card" style="margin-bottom:14px;border-left:4px solid ' + stColor + ';background:' + stBg + ';">' +
        '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '  <div style="flex:1;min-width:200px;">' +
        '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '      <span style="font-size:16px;font-weight:700;color:#0f172a;">' + stIcon + ' ' + escHtml(p.name) + '</span>' +
        '      ' + modeTag +
        '    </div>' +
        (p.description ? '<p style="font-size:13px;color:#475569;margin:0 0 6px;">' + escHtml(p.description) + '</p>' : '') +
        '    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '      ' + fidTags +
        '      <span style="font-size:11px;color:#64748b;">' + seqCount + ' seq</span>' +
        '      <span style="font-size:10px;color:#94a3b8;">' + escHtml(updAt) + '</span>' +
        '    </div>' +
        (seqCount > 0 ? '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">' + seqList + '</div>' : '') +
        ngSection +
        '  </div>' +
        '  <div style="display:flex;gap:8px;flex-shrink:0;">' +
        '    <button onclick="openPatternModal(\'' + p.id + '\')" ' +
        '      style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #94a3b8;' +
        '             background:white;cursor:pointer;">✏️ 編集</button>' +
        '    <button onclick="deletePattern(\'' + p.id + '\')" ' +
        '      style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #fecaca;' +
        '             background:#fff5f5;color:#dc2626;cursor:pointer;">🗑 削除</button>' +
        '  </div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ── パターン削除 ──────────────────────────────────────────────
  function deletePattern(id) {
    if (!confirm('このパターンを削除しますか？')) return;
    var pats = loadPatterns().filter(function(p){ return p.id !== id; });
    savePatterns(pats);
    renderPatternList();
  }

  // wpt-status 変更時に NG エリアを表示切替
  var wptStatus = document.getElementById('wpt-status');
  if (wptStatus) {
    wptStatus.addEventListener('change', toggleNgArea);
  }
</script>`;
}

// ─────────────────────────────────────────────────────────────
// レンダリング：課題一覧ページ
// ─────────────────────────────────────────────────────────────
function renderIssuesPage() {
  return `
<div id="issues" class="page">
  <div style="margin-bottom:22px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🐛 課題一覧</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">全画面の不具合・仕様不足 — NGシーケンスを自動集約</p>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
    <select id="iss-filter-type"  onchange="renderIssueTable()"
      style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">種別: すべて</option>
      <option value="不具合">🐛 不具合</option>
      <option value="仕様違い">📐 仕様違い</option>
      <option value="改善提案">💡 改善提案</option>
    </select>
    <select id="iss-filter-status" onchange="renderIssueTable()"
      style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">状態: すべて</option>
      <option value="未対応">⏸ 未対応</option>
      <option value="対応中">🔄 対応中</option>
      <option value="対応済">✅ 対応済</option>
    </select>
    <select id="iss-filter-prio" onchange="renderIssueTable()"
      style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">優先度: すべて</option>
      <option value="高">🔴 高</option>
      <option value="中">🟡 中</option>
      <option value="低">🟢 低</option>
    </select>
    <span style="margin-left:auto;align-self:center;font-size:12px;color:#64748b;" id="iss-count-lbl"></span>
  </div>
  <div id="iss-table-area">
    <div class="card" style="color:#94a3b8;text-align:center;padding:32px;">
      NGシーケンスを確認中...
    </div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────
function renderCSS() {
  return `<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;display:flex;min-height:100vh;}
#sidebar{width:240px;min-height:100vh;background:#0f172a;position:fixed;top:0;left:0;overflow-y:auto;z-index:100;}
#main-content{margin-left:240px;flex:1;min-height:100vh;}
.page{display:none;padding:32px 36px;}
.page.active{display:block;}
#dashboard{padding:32px 36px;}
.nav-group{padding:6px 16px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-top:8px;}
.nav-item{padding:8px 16px;font-size:12px;color:#94a3b8;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .15s;}
.nav-item:hover,.nav-item.active{background:#1e293b;color:#f1f5f9;}
.nav-sub{padding:5px 16px 5px 32px;font-size:11px;color:#64748b;}
.nav-sub:hover{background:#1e293b;color:#94a3b8;}
.card{background:white;border-radius:12px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px;}
.card-title{font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;}
.stat-card{background:white;border-radius:12px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.stat-label{font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;}
.stat-num{font-size:32px;font-weight:700;line-height:1;}
.badge{display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;}
.badge-ok{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
.badge-ng{background:#fff5f5;color:#dc2626;border:1px solid #fecaca;}
.badge-warn{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;}
.mono{font-family:'JetBrains Mono','Fira Code',monospace;}
.spec-table{width:100%;border-collapse:collapse;font-size:13px;}
.spec-table th{background:#f8fafc;padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;}
.spec-table td{padding:8px 12px;border-bottom:1px solid #f1f5f9;}
.spec-table tr:hover td{background:#f8fafc;}
/* アクションログ */
.action-log{border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px;overflow:hidden;transition:border-color .2s;}
.action-log.is-ng{border-color:#fecaca;background:#fffafa;}
.al-header{display:flex;gap:0;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
.al-header-cell{padding:10px 16px;border-right:1px solid #e2e8f0;}
.al-header-cell:last-child{border-right:none;}
.al-fieldlabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:3px;}
.al-fieldvalue{font-size:13px;font-weight:600;color:#0f172a;}
.al-meta{display:flex;gap:16px;padding:6px 16px;background:#fafafa;border-bottom:1px solid #f1f5f9;}
.al-meta-cell{display:flex;gap:6px;align-items:center;}
.al-ss{padding:16px;}
.al-detail{padding:0 16px 16px;}
.al-row{display:flex;gap:0;padding:8px 0;border-bottom:1px solid #f8fafc;align-items:flex-start;}
.al-row:last-child{border-bottom:none;}
.al-label{width:80px;font-size:11px;font-weight:700;color:#94a3b8;padding-top:2px;flex-shrink:0;}
.al-value{flex:1;font-size:13px;color:#334155;}
/* 判定ボタン */
.verdict-btn{display:inline-flex;align-items:center;gap:8px;border:none;background:none;cursor:pointer;padding:4px 10px;border-radius:8px;transition:background .2s;}
.verdict-btn:hover{background:#f1f5f9;}
.toggle{width:36px;height:20px;border-radius:10px;position:relative;transition:background .2s;}
.toggle-on{background:#16a34a;}
.toggle-off{background:#ef4444;}
.toggle::after{content:'';position:absolute;width:14px;height:14px;background:white;border-radius:50%;top:3px;transition:left .2s;}
.toggle-on::after{left:19px;}
.toggle-off::after{left:3px;}
.verdict-text-ok{font-size:14px;font-weight:700;color:#16a34a;}
.verdict-text-ng{font-size:14px;font-weight:700;color:#ef4444;}
/* 課題フォーム */
.issue-note-bug{background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:#991b1b;}
.issue-note-spec{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:#1e40af;}
.issue-form{display:none;margin-top:10px;background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px;}
.issue-form.open{display:block;}
.issue-form-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;}
.issue-form-row:last-child{margin-bottom:0;}
.iff-label{font-size:11px;font-weight:700;color:#64748b;white-space:nowrap;}
.iff-select{font-size:12px;border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px;background:white;}
.iff-textarea{flex:1;min-width:0;font-size:13px;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;resize:vertical;}
.iff-input{flex:1;min-width:0;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;padding:5px 10px;}
/* Console ログ表示（v3.0追加） */
.cl-block{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:white;}
.cl-header{padding:7px 12px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#475569;user-select:none;}
.cl-header:hover{background:#f1f5f9;}
.cl-body{padding:8px;background:#1e293b;max-height:260px;overflow-y:auto;}
.cl-empty{padding:7px 12px;font-size:12px;color:#94a3b8;background:#f8fafc;border-radius:8px;}
.cl-entry{display:flex;gap:8px;align-items:flex-start;padding:4px 6px;border-radius:5px;margin-bottom:3px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;}
.cl-log  {background:rgba(255,255,255,.04);}
.cl-info {background:rgba(59,130,246,.1);}
.cl-warn {background:rgba(251,191,36,.12);}
.cl-error{background:rgba(239,68,68,.15);}
.cl-debug{background:rgba(148,163,184,.08);}
.cl-badge{padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;flex-shrink:0;margin-top:1px;}
.cl-badge-log  {background:#334155;color:#94a3b8;}
.cl-badge-info {background:#1d4ed8;color:white;}
.cl-badge-warn {background:#92400e;color:#fef9c3;}
.cl-badge-error{background:#991b1b;color:#fee2e2;}
.cl-badge-debug{background:#374151;color:#9ca3af;}
.cl-time{color:#475569;font-size:10px;flex-shrink:0;margin-top:1px;}
.cl-msg {color:#e2e8f0;word-break:break-all;flex:1;}
.cl-stack{margin-top:4px;padding:4px 8px;background:rgba(0,0,0,.3);border-radius:4px;
          font-size:10px;color:#94a3b8;width:100%;word-break:break-all;}
/* 遷移図 */
.flow-canvas{overflow-x:auto;padding:10px 0 20px;}
.flow-row{display:flex;align-items:center;gap:0;min-width:max-content;}
.flow-box{border:2px solid #3b82f6;border-radius:10px;padding:10px 14px;background:white;cursor:pointer;
          text-align:center;min-width:100px;max-width:130px;transition:box-shadow .2s;position:relative;}
.flow-box:hover{box-shadow:0 4px 12px rgba(59,130,246,.3);}
.flow-box.start{border-color:#16a34a;background:#f0fdf4;}
.flow-box.end  {border-color:#ef4444;background:#fff5f5;}
.flow-seq{font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:3px;}
.flow-screen{font-size:10px;font-weight:700;color:#334155;margin-bottom:2px;}
.flow-label{font-size:11px;color:#64748b;word-break:break-all;}
.flow-arrow{display:flex;align-items:center;}
/* サムネイル */
.thumb-grid{display:flex;flex-wrap:wrap;gap:12px;}
.thumb-card{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;
            width:160px;transition:box-shadow .2s;}
.thumb-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);}
.thumb-card.is-ng{border-color:#fecaca;background:#fffafa;}
.thumb-img-area{position:relative;}
.thumb-seq-badge{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:white;
                 border-radius:5px;padding:1px 7px;font-size:10px;font-weight:700;z-index:1;}
.thumb-info{padding:8px 10px;}
.thumb-screen-id{font-size:10px;color:#94a3b8;margin-bottom:2px;}
.thumb-title{font-size:12px;font-weight:600;color:#334155;margin-bottom:3px;}
.thumb-action{font-size:11px;color:#64748b;}
/* スクショモーダル */
.ss-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;
          align-items:center;justify-content:center;}
.ss-modal-inner{background:white;border-radius:14px;max-width:900px;width:100%;max-height:90vh;
                overflow-y:auto;padding:24px;position:relative;}
.ss-modal-close{position:absolute;top:14px;right:16px;font-size:20px;cursor:pointer;
                color:#94a3b8;background:none;border:none;}
/* タイムラインカード */
.tl-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)!important;}
</style>`;
}

// ─────────────────────────────────────────────────────────────
// クライアントスクリプト
// ─────────────────────────────────────────────────────────────
function renderScript(fids, allLogs, allShots, issuesData) {
  const meta = {};
  for (const fid of fids) {
    const fi   = (issuesData.issues || []).filter(i => i.featureId === fid);
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi);
    for (const s of seqs) {
      const k = fid + '_seq' + s.seqNo;
      meta[k] = { fid, seqNo: s.seqNo, screenId: s.screenId, summary: s.summary, ts: s.ts, autoNG: s.autoNG };
    }
  }

  return `<script>
var META = ${JSON.stringify(meta)};
var FIDS = ${JSON.stringify(fids)};
var LSP  = "rev3_";

// localStorage ラッパー
function lsg(k){try{return JSON.parse(localStorage.getItem(LSP+k))||{};}catch(e){return {};}}
function lss(k,d){try{localStorage.setItem(LSP+k,JSON.stringify(d));}catch(e){}}

// 初期化
document.addEventListener("DOMContentLoaded",function(){
  var today=new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"});
  var sdate=document.getElementById("sidebar-date");
  if(sdate) sdate.textContent=today+" 更新";
  var ddate=document.getElementById("dash-date");
  if(ddate) ddate.textContent=today+" 時点";
  Object.keys(META).forEach(function(k){ restoreVerdict(k); });
  updateDashboard();
  showPage("dashboard");
});

// ── ページ切替 ───────────────────────────────────────────────
function showPage(id){
  document.querySelectorAll(".page").forEach(function(p){ p.style.display="none"; p.classList.remove("active"); });
  var el=document.getElementById(id);
  if(el){ el.style.display="block"; el.classList.add("active"); }
  document.querySelectorAll(".nav-item").forEach(function(n){ n.classList.remove("active"); });
  var nav=document.getElementById("nav-"+id);
  if(nav) nav.classList.add("active");
  // タイムラインページ: 遅延初期化
  if(id==="timeline" && typeof initTimeline==="function"){ setTimeout(initTimeline,50); }
  // パターンページ: 一覧更新
  if(id==="patterns" && typeof renderPatternList==="function"){ setTimeout(renderPatternList,50); }
}

// ── Console ログ 開閉 ─────────────────────────────────────────
function toggleConsole(sk){
  var body=document.getElementById("cl-body-"+sk);
  var tog =document.getElementById("cl-tog-"+sk);
  if(!body) return;
  if(body.style.display==="none"){
    body.style.display="block";
    if(tog) tog.textContent="クリックで閉じる";
  } else {
    body.style.display="none";
    if(tog) tog.textContent="クリックで展開";
  }
}

// ── OK/NG 判定 ───────────────────────────────────────────────
function toggleVerdict(k){
  var saved=lsg(k); var m=META[k]||{};
  var curNG=saved.verdict?saved.verdict==="NG":m.autoNG;
  var nv=curNG?"OK":"NG";
  saved.verdict=nv; lss(k,saved);
  applyVerdict(k,nv);
  updateDashboard();
  renderIssueTable();
}

function applyVerdict(k,v){
  var ng=v==="NG";
  var tog=document.getElementById("vtog-"+k);
  var lbl=document.getElementById("vlbl-"+k);
  var frm=document.getElementById("iform-"+k);
  var none=document.getElementById("issue-none-"+k);
  var al=document.getElementById("al-"+k);
  var fbox=document.getElementById("fbox-"+k);
  var tv=document.getElementById("tv-"+k);
  var tc=document.getElementById("thumb-"+k);
  if(tog){tog.className=ng?"toggle toggle-off":"toggle toggle-on";}
  if(lbl){lbl.textContent=ng?"NG":"OK";lbl.className=ng?"verdict-text-ng":"verdict-text-ok";}
  if(frm){frm.classList[ng?"add":"remove"]("open");}
  if(none){none.style.display=ng?"none":"block";}
  if(al){al.classList[ng?"add":"remove"]("is-ng");}
  if(fbox){fbox.innerHTML=ng?'<span style="color:#dc2626;font-weight:700;">❌ NG</span>':'<span style="color:#16a34a;font-weight:700;">✅ OK</span>';}
  if(tv){tv.innerHTML=ng?'<span style="color:#dc2626;font-weight:700;">❌ NG</span>':'<span style="color:#16a34a;font-weight:700;">✅ OK</span>';}
  if(tc){tc.classList[ng?"add":"remove"]("is-ng");}
  var flArrow=document.getElementById("farr-"+k);
  if(flArrow){var line=flArrow.querySelector("line");var poly=flArrow.querySelector("polygon");var col=ng?"#94a3b8":"#16a34a";if(line)line.setAttribute("stroke",col);if(poly)poly.setAttribute("fill",col);}
  updateScreenBadge(k.split("_seq")[0]);
}

function restoreVerdict(k){
  var saved=lsg(k); var m=META[k]||{};
  var v=saved.verdict||(m.autoNG?"NG":"OK");
  applyVerdict(k,v);
  var iff=["ift","ifp","ifs","ifc","ifm"];
  iff.forEach(function(pf){
    var el=document.getElementById(pf+"-"+k);
    if(el&&saved[pf]) el.value=saved[pf];
  });
}

function saveIssue(k){
  var saved=lsg(k);
  ["ift","ifp","ifs","ifc","ifm"].forEach(function(pf){
    var el=document.getElementById(pf+"-"+k);
    if(el) saved[pf]=el.value;
  });
  lss(k,saved);
  renderIssueTable();
}

// ── ダッシュボード更新 ────────────────────────────────────────
function updateDashboard(){
  var ok=0,ng=0,pend=0;
  FIDS.forEach(function(fid){
    var allNg=false,anyKey=false;
    Object.keys(META).forEach(function(k){
      if(META[k].fid!==fid) return;
      anyKey=true;
      var s=lsg(k); var v=s.verdict||(META[k].autoNG?"NG":"OK");
      if(v==="NG") allNg=true;
    });
    if(!anyKey){ pend++; return; }
    var saved=lsg(fid+"_screen"); var sv=saved.status||"";
    if(sv==="OK") ok++;
    else if(allNg){ ng++; }
    else { pend++; }
  });
  var ok2=document.getElementById("db-ok");   if(ok2) ok2.textContent=ok;
  var ng2=document.getElementById("db-ng");   if(ng2) ng2.textContent=ng;
  var pe2=document.getElementById("db-pend"); if(pe2) pe2.textContent=pend;
}

function updateScreenBadge(fid){
  var hasNG=false;
  Object.keys(META).forEach(function(k){
    if(META[k].fid!==fid) return;
    var s=lsg(k); var v=s.verdict||(META[k].autoNG?"NG":"OK");
    if(v==="NG") hasNG=true;
  });
  var b=document.getElementById("sbadge-"+fid);
  var db=document.getElementById("db-badge-"+fid);
  var ngc=document.getElementById("db-ngc-"+fid);
  var ngcnt=Object.keys(META).filter(function(k){
    if(META[k].fid!==fid) return false;
    var s=lsg(k); return (s.verdict||(META[k].autoNG?"NG":"OK"))==="NG";
  }).length;
  if(b){ b.className="badge "+(hasNG?"badge-ng":"badge-ok"); b.textContent=hasNG?"🔴 課題あり":"✅ 確認済"; }
  if(db){ db.className="badge "+(hasNG?"badge-ng":"badge-ok"); db.textContent=hasNG?"🔴 課題あり":"✅ 確認済"; }
  if(ngc) ngc.textContent=ngcnt>0?ngcnt+"件":"—";
}

// ── 課題一覧描画 ──────────────────────────────────────────────
function renderIssueTable(){
  var ft=document.getElementById("iss-filter-type")?.value||"";
  var fs=document.getElementById("iss-filter-status")?.value||"";
  var fp=document.getElementById("iss-filter-prio")?.value||"";
  var rows=[];
  Object.keys(META).forEach(function(k){
    var m=META[k]||{}; var s=lsg(k);
    var v=s.verdict||(m.autoNG?"NG":"OK");
    if(v!=="NG") return;
    var ift=s.ift||"不具合"; var ifp=s.ifp||"中"; var ifs=s.ifs||"未対応";
    var ifc=s.ifc||""; var ifm=s.ifm||"";
    if(ft&&ift!==ft) return;
    if(fs&&ifs!==fs) return;
    if(fp&&ifp!==fp) return;
    rows.push({k,fid:m.fid,seqNo:m.seqNo,summary:m.summary,ts:m.ts,ift,ifp,ifs,ifc,ifm});
  });
  var lbl=document.getElementById("iss-count-lbl");
  if(lbl) lbl.textContent=rows.length+"件";
  var area=document.getElementById("iss-table-area");
  if(!area) return;
  if(rows.length===0){ area.innerHTML='<div class="card" style="color:#94a3b8;text-align:center;padding:32px;">該当する課題はありません。</div>'; return; }
  var prio={高:0,中:1,低:2}; rows.sort(function(a,b){ return (prio[a.ifp]||1)-(prio[b.ifp]||1); });
  var html='<div class="card"><table class="spec-table"><thead><tr><th>seq</th><th>画面</th><th>操作</th><th>種別</th><th>優先度</th><th>状態</th><th>内容</th><th>備考</th></tr></thead><tbody>';
  html+=rows.map(function(r){
    var pc=r.ifp==="高"?"#dc2626":r.ifp==="中"?"#d97706":"#16a34a";
    return "<tr><td>"+r.seqNo+"</td><td style='font-size:11px;'>"+esc2(r.fid)+"</td><td>"+esc2(r.summary.slice(0,24))+"</td>"+
    "<td>"+esc2(r.ift)+"</td>"+
    "<td style='color:"+pc+";font-weight:700;'>"+esc2(r.ifp)+"</td>"+
    "<td>"+esc2(r.ifs)+"</td>"+
    "<td>"+esc2(r.ifc.slice(0,60))+"</td>"+
    "<td style='font-size:11px;color:#64748b;'>"+esc2(r.ifm)+"</td></tr>";
  }).join("");
  html+="</tbody></table></div>";
  area.innerHTML=html;
}

function esc2(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

// ── スクショモーダル ─────────────────────────────────────────
function openSsModal(src,title){
  var m=document.getElementById("ss-modal");
  var t=document.getElementById("modal-title");
  var s=document.getElementById("modal-ss");
  if(!m) return;
  m.style.display="flex";
  if(t) t.textContent=title;
  if(s) s.innerHTML='<img src="'+src+'" style="max-width:100%;display:block;margin:0 auto;" onerror="this.parentElement.innerHTML=\\'<div style=\\"padding:32px;color:#94a3b8;text-align:center;\\">画像を読み込めません</div>\\'">';
}
function closeModal(evt){
  if(evt&&evt.target!==document.getElementById("ss-modal")) return;
  var m=document.getElementById("ss-modal");
  if(m) m.style.display="none";
}

// ── アクションログへスクロール ────────────────────────────────
function scrollToActionLog(fid,seqNo){
  var el=document.getElementById("al-"+fid+"_seq"+seqNo);
  if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
}

// 初期レンダリング
document.addEventListener("DOMContentLoaded",function(){ renderIssueTable(); });
<\/script>`;
}

// ─────────────────────────────────────────────────────────────
// HTML 組み立て
// ─────────────────────────────────────────────────────────────
function buildHtml(fids, allLogs, allShots, issData, allConsoleLogs) {
  const allSeqs = buildAllSeqs(fids, allLogs, allShots, issData, allConsoleLogs);

  const screenPages = fids.map(fid =>
    renderScreenPage(fid, allLogs[fid] || [], allShots[fid] || [], issData, allConsoleLogs)
  ).join('\n');

  const flowPages = fids.map(fid => {
    const fi   = (issData.issues || []).filter(i => i.featureId === fid);
    const cl   = allConsoleLogs[fid] || [];
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi, cl);
    return renderFlowPage(fid, seqs);
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>画面レビュー資料 — Machining System v3.0</title>
${renderCSS()}
</head>
<body>

${renderSidebar(fids)}

<div id="main-content">
${renderDashboard(fids, allLogs, allShots, issData)}
${screenPages}
${flowPages}
${renderTimelinePage(allSeqs, fids)}
${renderWorkPatternsPage()}
${renderIssuesPage()}
</div>

<!-- スクショモーダル -->
<div id="ss-modal" class="ss-modal" onclick="closeModal(event)">
  <div class="ss-modal-inner">
    <button class="ss-modal-close" onclick="document.getElementById('ss-modal').style.display='none'">✕</button>
    <div id="modal-title" style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;"></div>
    <div id="modal-ss" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;
         min-height:200px;display:flex;align-items:center;justify-content:center;"></div>
  </div>
</div>

${renderScript(fids, allLogs, allShots, issData)}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
function main() {
  const allLogs        = loadLogs();           // .console.jsonl は除外済み
  const allConsoleLogs = loadConsoleLogs();     // .console.jsonl のみ
  const allShots       = loadScreenshots();
  const issData        = loadIssues();
  const fids           = Object.keys(allLogs).sort();

  if (!fids.length) {
    console.warn('[generate-review v3.0] ログファイルが見つかりません。');
  }

  console.log('[generate-review v3.0] 画面:', fids.join(', ') || 'なし');

  // コンソールログのサマリーを出力
  const clFids = Object.keys(allConsoleLogs);
  if (clFids.length) {
    console.log('[generate-review v3.0] コンソールログ読込:', clFids.map(f =>
      `${f}(${allConsoleLogs[f].length}件)`).join(', '));
  }

  const html = buildHtml(fids, allLogs, allShots, issData, allConsoleLogs);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`[generate-review v3.0] 完了: ${OUT_FILE} (${kb} KB)`);
}

main();
