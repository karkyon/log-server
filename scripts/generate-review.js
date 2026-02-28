#!/usr/bin/env node
// scripts/generate-review.js  v3.2
// ============================================================
// 変更履歴:
//   v3.0 - .console除外 / consoleLogs統合 / タイムライン / 作業パターン
//   v3.1 - [修正] SyntaxError: Unexpected string
//                 → <script>ブロックを renderTimelinePage / renderWorkPatternsPage から除去
//                   全JS を renderScript() 1箇所に集約
//          [修正] ReferenceError: tlFilterAll/renderPatternList/openPatternModal is not defined
//                 → 上記集約により解消
//          [修正] safeJson() ヘルパー追加
//                 → JSON中に </script> が含まれると script タグが壊れる問題を防止
//          [修正] openSsModal() で innerHTML + onerror 属性を使わず DOM API に変更
//                 → 属性値の二重エスケープによる SyntaxError を解消
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

const FEATURE_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
];
function featureColor(fid, fids) {
  const idx = fids.indexOf(fid);
  return FEATURE_COLORS[idx % FEATURE_COLORS.length];
}

// ─────────────────────────────────────────────────────────────
// safeJson: JSON埋め込みを script タグ内で安全にする
// </script> がJSONに含まれているとブラウザがscriptタグを早期終了してしまう
// </ を <\/ にエスケープして防止する
// ─────────────────────────────────────────────────────────────
function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

// ─────────────────────────────────────────────────────────────
// データ読み込み
// ─────────────────────────────────────────────────────────────
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
function buildSequences(entries, screenshots, fidIssues, consoleLogs) {
  consoleLogs = consoleLogs || [];
  const sorted = [...entries].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const traceMap = {};
  for (const e of sorted) {
    if (!e.traceId) continue;
    (traceMap[e.traceId] = traceMap[e.traceId] || []).push(e);
  }
  const ssMap = {};
  for (const ss of (screenshots || [])) {
    const m = ss.fname.match(/(TR-\d+-[a-z0-9]+)/i);
    const tid = m ? m[1] : '';
    if (tid) (ssMap[tid] = ssMap[tid] || []).push(ss);
  }
  const issMap = {};
  for (const iss of (fidIssues || [])) {
    if (iss.relatedTraceId) (issMap[iss.relatedTraceId] = issMap[iss.relatedTraceId] || []).push(iss);
  }
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
      summary = main.screenName || '画面表示'; opContent = summary + ' — 初期状態'; target = '—'; inputVal = '—';
    } else if (main.type === 'UI_CLICK') {
      summary = shortLabel(main.label || ''); opContent = summary;
      target = main.elementId || '—';
      const iv = main.inputValues || {};
      inputVal = iv.newValue || iv.selectedValue || (iv.buttonLabel ? '—（ボタン）' : '—');
    } else if (main.type === 'ERROR') {
      summary = 'エラー発生'; opContent = String(main.message || '').slice(0, 80); target = '—'; inputVal = '—';
    } else if (main.type === 'BACKEND') {
      summary = main.processName || 'バックエンド処理';
      opContent = summary + ' — ' + (main.status || '');
      target = main.processName || '—';
      inputVal = main.rowCount != null ? main.rowCount + '件' : '—';
    }
    const be = grp.find(x => x.type === 'BACKEND');
    if (be && main.type === 'UI_CLICK') opContent += '（結果: ' + (be.rowCount ?? '?') + '件）';
    seqs.push({
      seqNo      : no,
      traceId    : e.traceId,
      screenId   : main.screenId || main.featureId || '',
      ts         : main.ts || e.ts,
      summary, opContent, target, inputVal,
      shots      : ssMap[e.traceId] || [],
      issues     : issMap[e.traceId] || [],
      autoNG     : hasErr || (issMap[e.traceId] || []).some(i => i.severity === 'Critical' || i.severity === 'High'),
      consoleLogs: (consoleByTrace[e.traceId] || []).sort((a, b) => new Date(a.ts) - new Date(b.ts)),
      context    : (grp.find(x => x.context) || {}).context || {}
    });
  }
  return seqs;
}

function buildAllSeqs(fids, allLogs, allShots, issData, allConsoleLogs) {
  const result = [];
  for (const fid of fids) {
    const fi   = (issData.issues || []).filter(i => i.featureId === fid);
    const cl   = allConsoleLogs[fid] || [];
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi, cl);
    for (const s of seqs) {
      result.push(Object.assign({}, s, {
        featureId  : fid,
        screenName : SCREEN_NAME_MAP[fid] || fid,
        thumbPath  : s.shots.length ? ('../screenshots/' + fid + '/' + s.shots[0].fname) : null
      }));
    }
  }
  result.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  result.forEach((s, i) => { s.globalSeqNo = i + 1; });
  return result;
}

// ─────────────────────────────────────────────────────────────
// ユーティリティ（サーバサイド）
// ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function shortLabel(s) { return s.replace(/^(BTN_CLICK:|INPUT_CHANGE:|SELECT_CHANGE:)/,'').slice(0,50); }
function fmtTs(ts) {
  if (!ts) return '—';
  try { const d = new Date(ts); return d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP'); }
  catch { return ts; }
}
function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  catch { return ts; }
}
function triggerLabel(tr) {
  if (!tr) return 'スクショ';
  if (tr === 'SCREEN_LOAD') return '画面表示';
  if (tr === 'JS_ERROR')    return 'JSエラー';
  if (tr.includes('_BEFORE')) return '操作前';
  if (tr.includes('_AFTER'))  return '操作後';
  return tr.slice(0, 20);
}
function triggerStyle(tr) {
  if (!tr) return 'border-color:#cbd5e1;';
  if (tr.includes('_BEFORE')) return 'border-color:#f97316;';
  if (tr.includes('_AFTER'))  return 'border-color:#ef4444;';
  if (tr === 'SCREEN_LOAD')   return 'border-color:#93c5fd;';
  if (tr === 'JS_ERROR')      return 'border-color:#dc2626;';
  return 'border-color:#cbd5e1;';
}
function triggerHeaderStyle(tr) {
  if (!tr) return 'background:#f8fafc;color:#475569;';
  if (tr.includes('_BEFORE')) return 'background:#fff7ed;color:#9a3412;';
  if (tr.includes('_AFTER'))  return 'background:#fff5f5;color:#991b1b;';
  if (tr === 'SCREEN_LOAD')   return 'background:#eff6ff;color:#1d4ed8;';
  if (tr === 'JS_ERROR')      return 'background:#fee2e2;color:#7f1d1d;';
  return 'background:#f8fafc;color:#475569;';
}

// ─────────────────────────────────────────────────────────────
// レンダリング
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
  <div class="nav-item" onclick="showPage('patterns')">📌 作業パターン</div>
  <div class="nav-group">画面一覧（${fids.length}画面）</div>
  ${items}
  <div class="nav-group" style="margin-top:8px;">管理</div>
  <div class="nav-item" onclick="showPage('issues')">🐛 課題一覧</div>
</nav>`;
}

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
<div id="dashboard" class="page">
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

function renderSsBlock(shots) {
  if (!shots || !shots.length) return '<div style="color:#94a3b8;font-size:12px;padding:8px;">スクリーンショットなし</div>';
  return shots.map(ss => {
    const bc = triggerStyle(ss.trigger);
    const hs = triggerHeaderStyle(ss.trigger);
    const lb = triggerLabel(ss.trigger);
    const rp = '../screenshots/' + esc(ss.fid) + '/' + esc(ss.fname);
    return `<div style="margin-bottom:10px;border-radius:8px;border:2px solid;${bc}overflow:hidden;">
<div style="padding:5px 12px;font-size:11px;font-weight:700;${hs}">${lb}</div>
<div style="background:#f8fafc;cursor:pointer;text-align:center;" onclick="openSsModal('${rp}','${esc(lb)}')">
  <img src="${rp}" alt="${lb}" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"
       onerror="this.style.display='none'"/>
</div>
<div style="padding:3px 8px;font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ss.fname)}</div>
</div>`;
  }).join('');
}

function renderConsoleBlock(consoleLogs, sk) {
  if (!consoleLogs || !consoleLogs.length) return '<div class="cl-empty">このseqでのコンソール出力なし</div>';
  const rows = consoleLogs.map(cl => {
    const args  = (cl.args || []).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
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
    <span>▶ Console Logs（${consoleLogs.length}件）</span>${badge}
    <span id="cl-tog-${sk}" style="margin-left:auto;font-size:11px;color:#94a3b8;">クリックで展開</span>
  </div>
  <div class="cl-body" id="cl-body-${sk}" style="display:none;">${rows}</div>
</div>`;
}

function renderActionLog(seq) {
  const sk        = esc(seq.featureId + '_seq' + seq.seqNo);
  const autoNgStr = seq.autoNG ? 'true' : 'false';
  const autoIssueHtml = (seq.issues || []).map(iss => {
    const isBug = iss.severity === 'Critical' || iss.severity === 'High';
    return `<div class="${isBug ? 'issue-note-bug' : 'issue-note-spec'}">${isBug ? '🐛' : '📝'} [${esc(iss.ruleId)}] ${esc(iss.description || '')}
<br><small style="opacity:.8;">提案: ${esc(iss.fixSuggestion || '')}</small></div>`;
  }).join('');
  return `
<div class="action-log${seq.autoNG ? ' is-ng' : ''}" id="al-${sk}">
  <div class="al-header">
    <div class="al-header-cell"><div class="al-fieldlabel">seqNo</div><div class="al-fieldvalue">${seq.seqNo}</div></div>
    <div class="al-header-cell" style="flex:1;"><div class="al-fieldlabel">概要</div><div class="al-fieldvalue">${esc(seq.summary)}</div></div>
    <div class="al-header-cell"><div class="al-fieldlabel">操作日時</div><div class="al-fieldvalue">${esc(fmtTs(seq.ts))}</div></div>
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
    ${renderSsBlock(seq.shots)}
  </div>
  <div class="al-detail">
    <div class="al-row"><div class="al-label">操作内容</div><div class="al-value">${esc(seq.opContent)}</div></div>
    <div class="al-row"><div class="al-label">対象要素</div><div class="al-value">${seq.target === '—' ? '<span style="color:#94a3b8;">—</span>' : esc(seq.target)}</div></div>
    <div class="al-row"><div class="al-label">入力値</div><div class="al-value">${seq.inputVal && seq.inputVal !== '—' ? `<span class="mono" style="background:#f1f5f9;padding:2px 8px;border-radius:4px;">${esc(seq.inputVal)}</span>` : '<span style="color:#94a3b8;">—</span>'}</div></div>
    <div class="al-row"><div class="al-label">Console</div><div class="al-value">${renderConsoleBlock(seq.consoleLogs, sk)}</div></div>
    <div class="al-row">
      <div class="al-label">判定</div>
      <div class="al-value">
        <button class="verdict-btn" onclick="toggleVerdict('${sk}')">
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
              <option value="不具合">🐛 不具合</option><option value="仕様違い">📐 仕様違い</option>
              <option value="改善提案">💡 改善提案</option><option value="未確認">❓ 未確認</option>
              <option value="その他">📌 その他</option>
            </select>
            <span class="iff-label" style="margin-left:8px;">優先度</span>
            <select class="iff-select" id="ifp-${sk}" onchange="saveIssue('${sk}')">
              <option value="高">🔴 高</option><option value="中">🟡 中</option><option value="低">🟢 低</option>
            </select>
            <span class="iff-label" style="margin-left:8px;">対応状態</span>
            <select class="iff-select" id="ifs-${sk}" onchange="saveIssue('${sk}')">
              <option value="未対応">⏸ 未対応</option><option value="対応中">🔄 対応中</option>
              <option value="対応済">✅ 対応済</option><option value="クローズ">🔒 クローズ</option>
            </select>
          </div>
          <div class="issue-form-row">
            <span class="iff-label">内容</span>
            <textarea class="iff-textarea" id="ifc-${sk}" rows="3" placeholder="課題・問題点..." oninput="saveIssue('${sk}')"></textarea>
          </div>
          <div class="issue-form-row">
            <span class="iff-label">備考</span>
            <input type="text" class="iff-input" id="ifm-${sk}" placeholder="担当者・期限など" oninput="saveIssue('${sk}')"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function renderScreenPage(fid, entries, shots, issuesData, allConsoleLogs) {
  const name    = SCREEN_NAME_MAP[fid] || fid;
  const fi      = (issuesData.issues || []).filter(i => i.featureId === fid);
  const cl      = allConsoleLogs[fid] || [];
  const seqs    = buildSequences(entries, shots, fi, cl);
  const firstTs = entries.length ? fmtTs(entries[0].ts) : '';
  const actHtml = seqs.length === 0
    ? '<p style="color:#94a3b8;font-size:13px;">ログが存在しません。</p>'
    : seqs.map(seq => { seq.featureId = fid; return renderActionLog(seq); }).join('');
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

function renderFlowPage(featureId, seqs) {
  const name    = SCREEN_NAME_MAP[featureId]||featureId;
  const TL_COLS = 6; // 1行あたりの最大ノード数（調整可）

  // ── ノード & 矢印を items 配列に蓄積 ──────────────────────────
  const items = []; // {nodeHtml, arrowHtml}
  for (let i = 0; i < seqs.length; i++) {
    const s   = seqs[i];
    const sk  = featureId + '_seq' + s.seqNo;
    const esk = esc(sk);
    const efid = esc(featureId);

    const isStart = i === 0;
    const isEnd   = i === seqs.length - 1;
    const cls = isStart ? 'flow-box start' : (isEnd ? 'flow-box end' : 'flow-box');

    // 遷移ラベル（次のseqとの差分）
    const nextSeq   = seqs[i + 1];
    const arrowLbl  = nextSeq ? esc((nextSeq.opContent || '').slice(0, 14)) : '';
    const isOkTrans = nextSeq && !nextSeq.autoNG;
    const lbl2cls   = isOkTrans ? 'flow-arrow-label ok' : 'flow-arrow-label';

    // ノードHTML（flow-node + flow-box）— FLW-02: サムネイル追加, TIM-04: BOX中心に線が来るよう構造整理
    const shotObj = s.shots && s.shots[0];
    const shotPath = shotObj ? ('../screenshots/' + esc(featureId) + '/' + esc(shotObj.fname)) : null;
    const thumbInBox = shotPath
      ? '<div class="flow-box-thumb"><img src="' + shotPath + '" loading="lazy" alt="seq' + s.seqNo + '"></div>'
      : '<div class="flow-box-thumb"><span class="flow-box-thumb-none">📷</span></div>';

    const nodeHtml =
      '<div class="flow-node">' +
        '<div class="' + cls + (s.autoNG ? ' is-ng' : '') + '" ' +
          'id="fbox-' + esk + '" ' +
          'onclick="showPage(\'' + efid + '\');setTimeout(function(){scrollToActionLog(\'' + efid + '\',' + s.seqNo + ');},300);">' +
          thumbInBox +
          '<div class="flow-box-content">' +
            '<div class="flow-box-screen-id">' + esc(s.screenId) + '</div>' +
            '<div class="flow-box-label">' + esc((s.summary || '').slice(0, 16)) + '</div>' +
            '<div class="flow-box-sub">' + esc((s.opContent || '').slice(0, 16)) + '</div>' +
            '<div class="flow-node-verdict" id="fv-' + esk + '">' +
              (s.autoNG
                ? '<span style="color:#dc2626;font-size:10px;font-weight:700;">❌ NG</span>'
                : '<span style="color:#16a34a;font-size:10px;font-weight:700;">✅ OK</span>'
              ) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flow-node-seq">seq ' + s.seqNo + '</div>' +
      '</div>';

    // 矢印HTML（最終seqには矢印なし）
    const arrowHtml = !isEnd
      ? '<div class="flow-arrow" id="farrow-' + esk + '">' +
          '<div class="' + lbl2cls + '" id="falbl-' + esk + '">' + arrowLbl + '</div>' +
          '<div class="flow-arrow-line"></div>' +
        '</div>'
      : '';

    items.push({ nodeHtml, arrowHtml });
  }

  // ── 蛇行レイアウト構築 ──────────────────────────────────────
  // 偶数行(0,2...): LTR (flex-direction:row)
  // 奇数行(1,3...): RTL (flex-direction:row-reverse) ← CSS で反転
  let serpentineHtml = '';
  for (let r = 0; r * TL_COLS < items.length; r++) {
    const chunk     = items.slice(r * TL_COLS, (r + 1) * TL_COLS);
    const isRtl     = r % 2 === 1;
    const isLastRow = (r + 1) * TL_COLS >= items.length;

    // 行内のノード + 行内矢印（最後のノード以外）
    let rowInner = '';
    for (let c = 0; c < chunk.length; c++) {
      rowInner += chunk[c].nodeHtml;
      if (c < chunk.length - 1) {
        // 同一行内の矢印
        rowInner += chunk[c].arrowHtml;
      }
      // 行末ノードの矢印は U-ターンコネクタが代替 → 省略
    }

    serpentineHtml += '<div class="flow-row' + (isRtl ? ' rtl' : '') + '">' + rowInner + '</div>';

    // U-ターンコネクタ（最終行以外）
    if (!isLastRow) {
      // 偶数行末は右側、奇数行末は左側に U ターン
      const uturnCls = isRtl ? 'flow-uturn uturn-left' : 'flow-uturn uturn-right';
      serpentineHtml +=
        '<div class="' + uturnCls + '"><div class="flow-uturn-line"></div></div>';
    }
  }

  // ── サムネイル一覧 ───────────────────────────────────────────
  let thumbHtml = '';
  for (const s of seqs) {
    const sk   = featureId + '_seq' + s.seqNo;
    const esk  = esc(sk);
    const efid = esc(featureId);
    const sht  = s.shots && s.shots[0];
    const imgSrc = sht ? '../screenshots/' + efid + '/' + esc(sht.fname) : '';
    const imgHtml = imgSrc
      ? '<img src="' + imgSrc + '" ' +
          'style="width:100%;height:120px;object-fit:cover;border-radius:6px;" ' +
          'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" />' +
          '<div style="display:none;align-items:center;justify-content:center;height:120px;' +
            'color:#94a3b8;font-size:12px;">No img</div>'
      : '<div style="display:flex;align-items:center;justify-content:center;height:120px;' +
          'color:#94a3b8;font-size:12px;">No img</div>';

    thumbHtml +=
      '<div class="thumb-card ' + (s.autoNG ? 'is-ng' : '') + '" id="thumb-' + esk + '" ' +
        'onclick="showPage(\'' + efid + '\');' +
          'setTimeout(function(){scrollToActionLog(\'' + efid + '\',' + s.seqNo + ');},300);">' +
        '<div class="thumb-img-area">' +
          '<div class="thumb-seq-badge">seq ' + s.seqNo + '</div>' +
          imgHtml +
        '</div>' +
        '<div class="thumb-info">' +
          '<div class="thumb-screen-id">' + esc(s.screenId) + '</div>' +
          '<div class="thumb-title">' + esc(s.summary) + '</div>' +
          '<div class="thumb-action">' +
            '操作: <span>' + esc((s.opContent || '').slice(0, 20)) + '</span>' +
            '&nbsp;' +
            '<span id="tv-' + esk + '">' +
              (s.autoNG
                ? '<span style="color:#dc2626;font-weight:700;">❌ NG</span>'
                : '<span style="color:#16a34a;font-weight:700;">✅ OK</span>'
              ) +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  return `
<div id="flow_${esc(featureId)}" class="page">
  <div style="margin-bottom:22px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🗺️ 画面遷移図 — ${esc(name)}</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">${seqs.length} seq | 操作フロー（上段）とスクリーンショット一覧（下段）</p>
  </div>

  <div class="card">
    <div class="card-title">操作フロー — ${esc(featureId)}</div>
    <div id="flow-canvas-${esc(featureId)}" class="flow-canvas" style="min-height:200px;"></div>
    <div class="flow-legend">
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#16a34a;background:#f0fdf4;"></div>開始
      </div>
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#3b82f6;background:white;"></div>通常
      </div>
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#dc2626;background:#fff5f5;"></div>終端/NG
      </div>
      <div style="margin-left:auto;font-size:11px;color:#94a3b8;">
        ※ ボックスをクリックするとアクションレビューにジャンプします
      </div>
    </div>
  </div>
</div>`;
}

// タイムラインページ（HTML のみ、script タグなし）
function renderTimelinePage() {
  return `
<div id="timeline" class="page" style="display:none;">
  <div style="margin-bottom:20px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">📊 作業タイムライン</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">全画面横断の時系列表示 — クリックで選択、Shiftクリックで範囲選択</p>
  </div>
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
  <div class="card" style="padding:0;overflow:hidden;">
    <div id="tl-container" style="padding:20px;background:#f8fafc;">
      <div id="tl-serpentine"></div>
    </div>
  </div>
  <div id="tl-selection-panel" style="display:none;margin-top:16px;">
    <div class="card" style="border:2px solid #3b82f6;background:#eff6ff;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
        <div style="font-size:14px;font-weight:700;color:#1d4ed8;">📌 選択中: <span id="tl-sel-count">0</span> seq</div>
        <div id="tl-sel-summary" style="font-size:12px;color:#475569;flex:1;"></div>
        <button onclick="clearTlSelection()"
          style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid #94a3b8;background:white;cursor:pointer;">選択解除</button>
    '      \'    <button data-id="\'+p.id+\'" data-action="edit"\'+',
          style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;">
          📌 作業パターンとして登録
        </button>
      </div>
      <div id="tl-sel-list" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
  </div>
</div>`;
}

// 作業パターンページ（HTML のみ、script タグなし）
function renderWorkPatternsPage() {
  return `
<div id="patterns" class="page" style="display:none;">
  <div style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <h1 style="font-size:21px;font-weight:700;color:#0f172a;">📌 作業パターン</h1>
    '      \'    <button data-id="\'+p.id+\'" data-action="edit"\'+',
        style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;margin-left:auto;">
        ＋ 新規パターン登録
      </button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
    <div class="stat-card"><div class="stat-label">パターン数</div><div class="stat-num" style="color:#0f172a;" id="wpt-total">0</div></div>
    <div class="stat-card"><div class="stat-label">OK</div><div class="stat-num" style="color:#16a34a;" id="wpt-ok">0</div></div>
    <div class="stat-card"><div class="stat-label">NG</div><div class="stat-num" style="color:#dc2626;" id="wpt-ng">0</div></div>
    <div class="stat-card"><div class="stat-label">未評価</div><div class="stat-num" style="color:#94a3b8;" id="wpt-pend">0</div></div>
  </div>
  <div id="pattern-list-area">
    <div class="card" style="color:#94a3b8;padding:32px;text-align:center;">
      タイムラインページでseqを選択し「作業パターンとして登録」をクリックしてください。
    </div>
  </div>
</div>

<!-- 作業パターン登録モーダル -->
<div id="wpt-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;">
  <div style="background:white;border-radius:16px;max-width:600px;width:90%;padding:28px;max-height:90vh;overflow-y:auto;position:relative;">
    <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:20px;">📌 作業パターン登録</h2>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">パターン名 <span style="color:#dc2626;">*</span></label>
      <input id="wpt-name" type="text" placeholder="例: 初期表示、加工ID切り替え"
        style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:14px;box-sizing:border-box;">
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">説明</label>
      <textarea id="wpt-desc" rows="3" placeholder="このパターンの操作内容・目的"
        style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">画面モード</label>
        <select id="wpt-mode" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;">
          <option value="">選択してください</option>
          <option value="閲覧">閲覧</option>
          <option value="編集">編集</option>
          <option value="新規">新規</option>
          <option value="認証">🔐 認証</option>
          <option value="帳票出力">🖨 帳票出力</option>
          <option value="認証">🔐 認証</option>
          <option value="帳票出力">🖨 帳票出力</option>
          <option value="混在">混在（複数画面）</option>
          <option value="その他">その他</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">全体評価</label>
        <select id="wpt-status" onchange="toggleNgArea()"
          style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:13px;">
          <option value="未評価">⬜ 未評価</option><option value="OK">✅ OK</option><option value="NG">❌ NG</option>
        </select>
      </div>
    </div>
    <div id="wpt-ng-area" style="display:none;margin-bottom:14px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">NG内容 <span style="color:#dc2626;">*</span></label>
      <textarea id="wpt-ng-content" rows="3" placeholder="NG の内容・問題点"
        style="width:100%;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;resize:vertical;background:#fff5f5;"></textarea>
      <div style="margin-top:8px;">
        <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">優先度</label>
        <select id="wpt-ng-priority" style="width:100%;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:13px;background:#fff5f5;">
          <option value="高">🔴 高</option><option value="中">🟡 中</option><option value="低">🟢 低</option>
        </select>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:8px;">対象seq（<span id="wpt-modal-seqcnt">0</span>件）</div>
      <div id="wpt-modal-seqlist" style="display:flex;gap:6px;flex-wrap:wrap;max-height:120px;overflow-y:auto;"></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="closePatternModal()"
        style="padding:8px 20px;border-radius:8px;border:1px solid #cbd5e1;background:white;cursor:pointer;font-size:13px;">キャンセル</button>
      <button onclick="savePattern()"
        style="padding:8px 20px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:13px;font-weight:700;">💾 保存</button>
    </div>
  </div>
</div>`;
}

function renderIssuesPage() {
  return `
<div id="issues" class="page">
  <div style="margin-bottom:22px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🐛 課題一覧</h1>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
    <select id="iss-filter-type" onchange="renderIssueTable()" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">種別: すべて</option><option value="不具合">🐛 不具合</option>
      <option value="仕様違い">📐 仕様違い</option><option value="改善提案">💡 改善提案</option>
    </select>
    <select id="iss-filter-status" onchange="renderIssueTable()" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">状態: すべて</option><option value="未対応">⏸ 未対応</option>
      <option value="対応中">🔄 対応中</option><option value="対応済">✅ 対応済</option>
    </select>
    <select id="iss-filter-prio" onchange="renderIssueTable()" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-size:12px;">
      <option value="">優先度: すべて</option><option value="高">🔴 高</option>
      <option value="中">🟡 中</option><option value="低">🟢 低</option>
    </select>
    <span style="margin-left:auto;align-self:center;font-size:12px;color:#64748b;" id="iss-count-lbl"></span>
  </div>
  <div id="iss-table-area"><div class="card" style="color:#94a3b8;text-align:center;padding:32px;">確認中...</div></div>
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
.action-log{border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px;overflow:hidden;}
.action-log.is-ng{border-color:#fecaca;background:#fffafa;}
.al-header{display:flex;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
.al-header-cell{padding:10px 16px;border-right:1px solid #e2e8f0;}
.al-header-cell:last-child{border-right:none;}
.al-fieldlabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:3px;}
.al-fieldvalue{font-size:13px;font-weight:600;color:#0f172a;}
.al-meta{display:flex;gap:16px;padding:6px 16px;background:#fafafa;border-bottom:1px solid #f1f5f9;}
.al-meta-cell{display:flex;gap:6px;align-items:center;}
.al-ss{padding:16px;}
.al-detail{padding:0 16px 16px;}
.al-row{display:flex;padding:8px 0;border-bottom:1px solid #f8fafc;align-items:flex-start;}
.al-row:last-child{border-bottom:none;}
.al-label{width:80px;font-size:11px;font-weight:700;color:#94a3b8;padding-top:2px;flex-shrink:0;}
.al-value{flex:1;font-size:13px;color:#334155;}
.verdict-btn{display:inline-flex;align-items:center;gap:8px;border:none;background:none;cursor:pointer;padding:4px 10px;border-radius:8px;}
.verdict-btn:hover{background:#f1f5f9;}
.toggle{width:36px;height:20px;border-radius:10px;position:relative;}
.toggle-on{background:#16a34a;}
.toggle-off{background:#ef4444;}
.toggle::after{content:'';position:absolute;width:14px;height:14px;background:white;border-radius:50%;top:3px;}
.toggle-on::after{left:19px;}
.toggle-off::after{left:3px;}
.verdict-text-ok{font-size:14px;font-weight:700;color:#16a34a;}
.verdict-text-ng{font-size:14px;font-weight:700;color:#ef4444;}
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
.cl-block{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;}
.cl-header{padding:7px 12px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#475569;user-select:none;}
.cl-header:hover{background:#f1f5f9;}
.cl-body{padding:8px;background:#1e293b;max-height:260px;overflow-y:auto;}
.cl-empty{padding:7px 12px;font-size:12px;color:#94a3b8;background:#f8fafc;border-radius:8px;}
.cl-entry{display:flex;gap:8px;align-items:flex-start;padding:4px 6px;border-radius:5px;margin-bottom:3px;font-family:monospace;font-size:11px;}
.cl-log{background:rgba(255,255,255,.04);}
.cl-info{background:rgba(59,130,246,.1);}
.cl-warn{background:rgba(251,191,36,.12);}
.cl-error{background:rgba(239,68,68,.15);}
.cl-debug{background:rgba(148,163,184,.08);}
.cl-badge{padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;flex-shrink:0;margin-top:1px;}
.cl-badge-log{background:#334155;color:#94a3b8;}
.cl-badge-info{background:#1d4ed8;color:white;}
.cl-badge-warn{background:#92400e;color:#fef9c3;}
.cl-badge-error{background:#991b1b;color:#fee2e2;}
.cl-badge-debug{background:#374151;color:#9ca3af;}
.cl-time{color:#475569;font-size:10px;flex-shrink:0;margin-top:1px;}
.cl-msg{color:#e2e8f0;word-break:break-all;flex:1;}
.cl-stack{margin-top:4px;padding:4px 8px;background:rgba(0,0,0,.3);border-radius:4px;font-size:10px;color:#94a3b8;width:100%;word-break:break-all;}
.flow-canvas{padding:16px 24px 32px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;}
.flow-row{display:flex;align-items:center;gap:0;flex-wrap:nowrap;justify-content:space-between;}
.flow-row.rtl{flex-direction:row-reverse;}
.flow-uturn{height:44px;width:100%;margin:0;display:block;overflow:visible;position:relative;}
.flow-node{display:flex;flex-direction:column;align-items:center;flex-shrink:0;position:relative;}
.flow-node-seq{font-size:10px;color:#94a3b8;font-weight:600;position:absolute;top:calc(100% + 2px);left:0;width:100%;text-align:center;}
.flow-box{border:2px solid #3b82f6;border-radius:10px;background:white;cursor:pointer;text-align:center;width:120px;overflow:hidden;transition:box-shadow .18s,transform .18s;}
.flow-box:hover{box-shadow:0 4px 14px rgba(59,130,246,.35);transform:translateY(-1px);}
.flow-box.start{border-color:#16a34a;background:#f0fdf4;}
.flow-box.end{border-color:#ef4444;background:#fff5f5;}
.flow-box.is-ng{border-color:#ef4444!important;background:#fff5f5!important;}
.flow-box-thumb{width:100%;height:60px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;overflow:hidden;display:flex;align-items:center;justify-content:center;}
.flow-box-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.flow-box-thumb-none{font-size:18px;color:#cbd5e1;}
.flow-box-content{padding:6px 6px 7px;}
.flow-box-screen-id{font-size:9px;font-family:'JetBrains Mono',monospace;color:#94a3b8;letter-spacing:.4px;margin-bottom:2px;}
.flow-box-label{font-size:11px;font-weight:700;color:#1e293b;line-height:1.3;}
.flow-box-sub{font-size:9px;color:#64748b;margin-top:2px;line-height:1.3;}
.flow-node-verdict{font-size:10px;margin-top:3px;min-height:16px;}
.flow-arrow{display:flex;align-items:center;flex:1 1 0;min-width:40px;position:relative;}
.flow-arrow-line{width:100%;height:3px;background:#475569;position:relative;}
.flow-arrow-line::after{content:'';position:absolute;right:-1px;top:50%;transform:translateY(-50%);border:7px solid transparent;border-left-color:#475569;border-right:none;}
.flow-row.rtl .flow-arrow-line::after{right:auto;left:-1px;border-left:none;border-right-color:#475569;}
.flow-arrow-label{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:9px;color:#2563eb;font-weight:600;background:white;border:1px solid #bfdbfe;border-radius:4px;padding:2px 5px;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:1;}
.flow-arrow-label.ok{color:#16a34a;border-color:#bbf7d0;background:#f0fdf4;}
.flow-arrow-label.ng{color:#dc2626;border-color:#fecaca;background:#fff5f5;}
.flow-legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:11px;color:#64748b;}
.flow-legend-item{display:flex;align-items:center;gap:6px;}
.flow-legend-box{width:20px;height:14px;border-radius:3px;border:2px solid;}
.thumb-grid{display:flex;flex-wrap:wrap;gap:12px;}
.thumb-card{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;width:160px;}
.thumb-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);}
.thumb-card.is-ng{border-color:#fecaca;background:#fffafa;}
.thumb-img-area{position:relative;}
.thumb-seq-badge{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:white;border-radius:5px;padding:1px 7px;font-size:10px;font-weight:700;z-index:1;}
.thumb-info{padding:8px 10px;}
.thumb-screen-id{font-size:10px;color:#94a3b8;margin-bottom:2px;}
.thumb-title{font-size:12px;font-weight:600;color:#334155;margin-bottom:3px;}
.thumb-action{font-size:11px;color:#64748b;}
.ss-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;align-items:center;justify-content:center;}
.ss-modal-inner{background:white;border-radius:14px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;position:relative;}
.ss-modal-close{position:absolute;top:14px;right:16px;font-size:20px;cursor:pointer;color:#94a3b8;background:none;border:none;}
.tl-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)!important;}
.tl-row{display:flex;align-items:center;gap:0;flex-wrap:nowrap;justify-content:space-between;}
.tl-row.rtl{flex-direction:row-reverse;}
.tl-arrow{display:flex;align-items:center;flex:1 1 0;min-width:30px;}
.tl-arrow-line{width:100%;height:3px;background:#475569;position:relative;}
.tl-arrow-line::after{content:'';position:absolute;right:-1px;top:50%;transform:translateY(-50%);border:7px solid transparent;border-left-color:#475569;border-right:none;}
.tl-row.rtl .tl-arrow-line::after{right:auto;left:-1px;border-left:none;border-right-color:#475569;}
.tl-uturn{height:44px;width:100%;position:relative;}
</style>`;
}

// ─────────────────────────────────────────────────────────────
// renderScript: 全JS を1つの<script>ブロックに集約
// ─────────────────────────────────────────────────────────────
function renderScript(fids, allLogs, allShots, issuesData, allSeqs) {
  // META（seq 判定復元用）
  const meta = {};
  for (const fid of fids) {
    const fi   = (issuesData.issues || []).filter(i => i.featureId === fid);
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi);
    for (const s of seqs) {
      const k = fid + '_seq' + s.seqNo;
      meta[k] = { fid, seqNo: s.seqNo, screenId: s.screenId, summary: s.summary, ts: s.ts, autoNG: s.autoNG };
    }
  }

  // タイムラインデータ（軽量版）
  const tlData = (allSeqs || []).map(s => ({
    globalSeqNo : s.globalSeqNo,
    featureId   : s.featureId,
    screenName  : s.screenName,
    seqNo       : s.seqNo,
    traceId     : s.traceId,
    screenId    : s.screenId,
    ts          : s.ts,
    summary     : s.summary,
    autoNG      : s.autoNG,
    thumbPath   : s.thumbPath,
    consoleErr  : (s.consoleLogs || []).filter(c => c.level === 'error').length,
    consoleWarn : (s.consoleLogs || []).filter(c => c.level === 'warn').length,
  }));

  const colors = Object.fromEntries(fids.map((fid, i) => [fid, FEATURE_COLORS[i % FEATURE_COLORS.length]]));

  // safeJson で </script> を安全にエスケープ
  const metaJs    = safeJson(meta);
  const fidsJs    = safeJson(fids);
  const tlDataJs  = safeJson(tlData);
  const colorsJs  = safeJson(colors);

  // JS は通常の文字列連結で組み立て（テンプレートリテラル内に危険なパターンを含めない）
  const lines = [
    '// =========================================================',
    '// 画面レビュー v3.1 インタラクティブ制御',
    '// =========================================================',
    '',
    '// ── データ ──────────────────────────────────────────────',
    'var META     = ' + metaJs + ';',
    'var FIDS     = ' + fidsJs + ';',
    'var TL_DATA  = ' + tlDataJs + ';',
    'var TL_COLORS= ' + colorsJs + ';',
    'var LSP      = "rev31_";',
    '',
    '// タイムライン状態',
    'var tlSelected = [];',
    'var tlLastIdx  = -1;',
    'var tlVisible  = null;',
    '',
    '// ── localStorage ─────────────────────────────────────────',
    'function lsg(k){try{return JSON.parse(localStorage.getItem(LSP+k))||{};}catch(e){return {};}}',
    'function lss(k,d){try{localStorage.setItem(LSP+k,JSON.stringify(d));}catch(e){}}',
    '',
    '// ── 初期化 ───────────────────────────────────────────────',
    'document.addEventListener("DOMContentLoaded",function(){',
    '  var today=new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"});',
    '  var s1=document.getElementById("sidebar-date"); if(s1) s1.textContent=today+" 更新";',
    '  var s2=document.getElementById("dash-date"); if(s2) s2.textContent=today+" 時点";',
    '  Object.keys(META).forEach(function(k){ restoreVerdict(k); });',
    '  updateDashboard();',
    '  showPage("dashboard");',
    '});',
    '',
    '// ── ページ切替 ───────────────────────────────────────────',
    'function showPage(id){',
    '  document.querySelectorAll(".page").forEach(function(p){ p.style.display="none"; p.classList.remove("active"); });',
    '  var el=document.getElementById(id);',
    '  if(el){ el.style.display="block"; el.classList.add("active"); }',
    '  document.querySelectorAll(".nav-item").forEach(function(n){ n.classList.remove("active"); });',
    '  var nav=document.getElementById("nav-"+id); if(nav) nav.classList.add("active");',
    '  if(id==="timeline"){ setTimeout(initTimeline,50); }',
    '  if(id==="patterns"){ setTimeout(renderPatternList,50); }',
  '  if(id.indexOf("flow_")===0){ var _fid=id.slice(5); setTimeout(function(){if(window.initFlowPage)initFlowPage(_fid);},50); }',
    '}',
    '',
    '// ── Console 開閉 ─────────────────────────────────────────',
    'function toggleConsole(sk){',
    '  var b=document.getElementById("cl-body-"+sk);',
    '  var t=document.getElementById("cl-tog-"+sk);',
    '  if(!b) return;',
    '  var open=b.style.display==="none";',
    '  b.style.display=open?"block":"none";',
    '  if(t) t.textContent=open?"クリックで閉じる":"クリックで展開";',
    '}',
    '',
    '// ── OK/NG ─────────────────────────────────────────────────',
    'function toggleVerdict(k){',
    '  var saved=lsg(k); var m=META[k]||{};',
    '  var curNG=saved.verdict?saved.verdict==="NG":m.autoNG;',
    '  var nv=curNG?"OK":"NG";',
    '  saved.verdict=nv; lss(k,saved);',
    '  applyVerdict(k,nv);',
    '  updateDashboard(); renderIssueTable();',
    '}',
    'function applyVerdict(k,v){',
    '  var ng=v==="NG";',
    '  var g=function(id){ return document.getElementById(id); };',
    '  var tog=g("vtog-"+k); var lbl=g("vlbl-"+k); var frm=g("iform-"+k);',
    '  var none=g("issue-none-"+k); var al=g("al-"+k); var fv=g("fv-"+k);',
    '  var tv=g("tv-"+k); var tc=g("thumb-"+k);',
    '  if(tog) tog.className=ng?"toggle toggle-off":"toggle toggle-on";',
    '  if(lbl){ lbl.textContent=ng?"NG":"OK"; lbl.className=ng?"verdict-text-ng":"verdict-text-ok"; }',
    '  if(frm) frm.classList[ng?"add":"remove"]("open");',
    '  if(none) none.style.display=ng?"none":"block";',
    '  if(al) al.classList[ng?"add":"remove"]("is-ng");',
    '  var ng_html=\'<span style="color:#dc2626;font-weight:700;">\u274c NG\u003c/span>\';',
    '  var ok_html=\'<span style="color:#16a34a;font-weight:700;">\u2705 OK\u003c/span>\';',
    '  if(fv) fv.innerHTML=ng?ng_html:ok_html;',
    '  if(tv) tv.innerHTML=ng?ng_html:ok_html;',
    '  if(tc) tc.classList[ng?"add":"remove"]("is-ng");',
    '  var fa=g("farr-"+k);',
    '  if(fa){ var ln=fa.querySelector("line"); var pl=fa.querySelector("polygon"); var c=ng?"#94a3b8":"#16a34a";',
    '    if(ln) ln.setAttribute("stroke",c); if(pl) pl.setAttribute("fill",c); }',
    '  updateScreenBadge(k.split("_seq")[0]);',
    '}',
    'function restoreVerdict(k){',
    '  var saved=lsg(k); var m=META[k]||{};',
    '  applyVerdict(k, saved.verdict||(m.autoNG?"NG":"OK"));',
    '  ["ift","ifp","ifs","ifc","ifm"].forEach(function(pf){',
    '    var el=document.getElementById(pf+"-"+k);',
    '    if(el&&saved[pf]) el.value=saved[pf];',
    '  });',
    '}',
    'function saveIssue(k){',
    '  var saved=lsg(k);',
    '  ["ift","ifp","ifs","ifc","ifm"].forEach(function(pf){',
    '    var el=document.getElementById(pf+"-"+k); if(el) saved[pf]=el.value;',
    '  });',
    '  lss(k,saved); renderIssueTable();',
    '}',
    '',
    '// ── ダッシュボード更新 ────────────────────────────────────',
    'function updateDashboard(){',
    '  var ok=0,ng=0,pend=0;',
    '  FIDS.forEach(function(fid){',
    '    var anyNG=false,anyKey=false;',
    '    Object.keys(META).forEach(function(k){',
    '      if(META[k].fid!==fid) return;',
    '      anyKey=true;',
    '      var s=lsg(k); if((s.verdict||(META[k].autoNG?"NG":"OK"))==="NG") anyNG=true;',
    '    });',
    '    if(!anyKey){ pend++; return; }',
    '    if(anyNG) ng++; else pend++;',
    '  });',
    '  var eo=document.getElementById("db-ok"); if(eo) eo.textContent=ok;',
    '  var en=document.getElementById("db-ng"); if(en) en.textContent=ng;',
    '  var ep=document.getElementById("db-pend"); if(ep) ep.textContent=pend;',
    '}',
    'function updateScreenBadge(fid){',
    '  var hasNG=false, cnt=0;',
    '  Object.keys(META).forEach(function(k){',
    '    if(META[k].fid!==fid) return;',
    '    if((lsg(k).verdict||(META[k].autoNG?"NG":"OK"))==="NG"){ hasNG=true; cnt++; }',
    '  });',
    '  var b=document.getElementById("sbadge-"+fid);',
    '  var db=document.getElementById("db-badge-"+fid);',
    '  var nc=document.getElementById("db-ngc-"+fid);',
    '  var cls=hasNG?"badge badge-ng":"badge badge-ok";',
    '  var txt=hasNG?"\ud83d\udd34 \u8ab2\u984c\u3042\u308a":"\u2705 \u78ba\u8a8d\u6e08";',
    '  if(b){ b.className=cls; b.textContent=txt; }',
    '  if(db){ db.className=cls; db.textContent=txt; }',
    '  if(nc) nc.textContent=cnt>0?cnt+"\u4ef6":"—";',
    '}',
    '',
    '// ── スクショモーダル（DOM API を使用、innerHTML+onerror 不使用）──',
    'function openSsModal(src,title){',
    '  var m=document.getElementById("ss-modal");',
    '  var t=document.getElementById("modal-title");',
    '  var s=document.getElementById("modal-ss");',
    '  if(!m) return;',
    '  m.style.display="flex";',
    '  if(t) t.textContent=title;',
    '  if(s){',
    '    s.innerHTML="";',
    '    var img=document.createElement("img");',
    '    img.src=src;',
    '    img.style.cssText="max-width:100%;display:block;margin:0 auto;";',
    '    img.onerror=function(){',
    '      s.innerHTML=\'<div style="padding:32px;color:#94a3b8;text-align:center;">\u753b\u50cf\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u003c/div>\';',
    '    };',
    '    s.appendChild(img);',
    '  }',
    '}',
    'function closeModal(evt){',
    '  var m=document.getElementById("ss-modal");',
    '  if(!m) return;',
    '  if(!evt||evt.target===m) m.style.display="none";',
    '}',
    '',
    '// ── アクションログへスクロール ────────────────────────────',
    'function scrollToActionLog(fid,seqNo){',
    '  var el=document.getElementById("al-"+fid+"_seq"+seqNo);',
    '  if(el) el.scrollIntoView({behavior:"smooth",block:"start"});',
    '}',
    '',
    '// ── 課題一覧 ──────────────────────────────────────────────',
    'function renderIssueTable(){',
    '  var ft=document.getElementById("iss-filter-type");',
    '  var fs=document.getElementById("iss-filter-status");',
    '  var fp=document.getElementById("iss-filter-prio");',
    '  var ft2=ft?ft.value:""; var fs2=fs?fs.value:""; var fp2=fp?fp.value:"";',
    '  var rows=[];',
    '  Object.keys(META).forEach(function(k){',
    '    var m=META[k]||{}; var s=lsg(k);',
    '    var v=s.verdict||(m.autoNG?"NG":"OK");',
    '    if(v!=="NG") return;',
    '    var ift=s.ift||"\u4e0d\u5177\u5408"; var ifp=s.ifp||"\u4e2d"; var ifs=s.ifs||"\u672a\u5bfe\u5fdc";',
    '    if(ft2&&ift!==ft2) return;',
    '    if(fs2&&ifs!==fs2) return;',
    '    if(fp2&&ifp!==fp2) return;',
    '    rows.push({k,fid:m.fid,seqNo:m.seqNo,summary:m.summary,ift,ifp,ifs,ifc:s.ifc||"",ifm:s.ifm||""});',
    '  });',
    '  var lbl=document.getElementById("iss-count-lbl"); if(lbl) lbl.textContent=rows.length+"\u4ef6";',
    '  var area=document.getElementById("iss-table-area"); if(!area) return;',
    '  if(!rows.length){ area.innerHTML=\'<div class="card" style="color:#94a3b8;text-align:center;padding:32px;">\u8a72\u5f53\u306a\u3057</div>\'; return; }',
    '  var pc={"\u9ad8":0,"\u4e2d":1,"\u4f4e":2};',
    '  rows.sort(function(a,b){ return (pc[a.ifp]||1)-(pc[b.ifp]||1); });',
    '  var h=\'<div class="card"><table class="spec-table"><thead><tr>\'+',
    '    \'<th>seq</th><th>\u753b\u9762</th><th>\u6982\u8981</th><th>\u7a2e\u5225</th><th>\u512a\u5148\u5ea6</th><th>\u72b6\u614b</th><th>\u5185\u5bb9</th><th>\u5099\u8003</th><th style="text-align:center;width:52px;">\u7de8\u96c6</th></tr></thead><tbody>\';',
    '  rows.forEach(function(r){',
    '    var c=r.ifp==="\u9ad8"?"#dc2626":r.ifp==="\u4e2d"?"#d97706":"#16a34a";',
    '    h+=\'<tr><td>\'+r.seqNo+\'</td><td style="font-size:11px;">\'+escH(r.fid)+\'</td>\'+',
    '      \'<td>\'+escH(r.summary.slice(0,30))+\'</td><td>\'+escH(r.ift)+\'</td>\'+',
    '      \'<td style="color:\'+c+\';font-weight:700;">\'+escH(r.ifp)+\'</td>\'+',
    '      \'<td>\'+escH(r.ifs)+\'</td><td>\'+escH(r.ifc.slice(0,60))+\'</td>\'+',
    '      \'<td style="font-size:11px;color:#64748b;">\'+escH(r.ifm)+\'</td>\'+',
    '      \'<td style="text-align:center;"><button data-iss-k="\'+r.k+\'" data-action="iss-edit" style="font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid #94a3b8;background:white;cursor:pointer;">\u270f\ufe0f</button></td></tr>\';',
    '  });',
    '  area.innerHTML=h+"</tbody></table></div>";',
    '  var _ta=document.getElementById("iss-table-area");',
    '  if(_ta&&!_ta._d){ _ta._d=true; _ta.addEventListener("click",function(e){',
    '    var b=e.target.closest("button[data-action=\'iss-edit\']"); if(b) openIssueEditModal(b.dataset.issK); }); }',
    '}',
    'document.addEventListener("DOMContentLoaded",renderIssueTable);',
    'var _issK=null;',
    'function openIssueEditModal(k){',
    '  _issK=k; var memo=(_lm()[k]||{}); var m=document.getElementById("iss-edit-modal"); if(!m) return;',
    '  var meta=META[k]||{};',
    '  document.getElementById("iem-title").value=memo.title||(meta.summary||k);',
    '  document.getElementById("iem-type").value=memo.type||(lsg(k).ift||"\u4e0d\u5177\u5408");',
    '  document.getElementById("iem-status").value=memo.status||(lsg(k).ifs||"\u672a\u5bfe\u5fdc");',
    '  document.getElementById("iem-prio").value=memo.prio||(lsg(k).ifp||"\u4e2d");',
    '  document.getElementById("iem-desc").value=memo.desc||(lsg(k).ifc||"");',
    '  m.style.display="flex";',
    '}',
    'function closeIssueEditModal(){ var m=document.getElementById("iss-edit-modal"); if(m) m.style.display="none"; _issK=null; }',
    'function _lm(){ try{return JSON.parse(localStorage.getItem("tlog_iss_memo")||"{}");}catch(e){return {};} }',
    'function _sm(o){ try{localStorage.setItem("tlog_iss_memo",JSON.stringify(o));}catch(e){} }',
    'function saveIssueEdit(){',
    '  if(!_issK) return;',
    '  var o=_lm(); var s=lsg(_issK);',
    '  o[_issK]={ title:document.getElementById("iem-title").value, type:document.getElementById("iem-type").value,',
    '    status:document.getElementById("iem-status").value, prio:document.getElementById("iem-prio").value,',
    '    desc:document.getElementById("iem-desc").value, updatedAt:new Date().toISOString() };',
    '  s.ift=o[_issK].type; s.ifs=o[_issK].status; s.ifp=o[_issK].prio; s.ifc=o[_issK].desc;',
    '  ssg(_issK,s); _sm(o); closeIssueEditModal(); renderIssueTable();',
    '}',
    'function initPatternArea(){',
    '  var a=document.getElementById("pattern-list-area");',
    '  if(!a||a._d) return; a._d=true;',
    '  a.addEventListener("click",function(e){',
    '    var b=e.target.closest("button[data-action]"); if(!b) return;',
    '    if(b.dataset.action==="edit")   openPatternModal(b.dataset.id);',
    '    if(b.dataset.action==="delete") deletePattern(b.dataset.id);',
    '  });',
    '}',
    'document.addEventListener("DOMContentLoaded",initPatternArea);',
    '',
    '// ── ユーティリティ ────────────────────────────────────────',
    'function escH(s){',
    '  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");',
    '}',
    'function fmtTJ(ts){',
    '  try{ return new Date(ts).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }',
    '  catch(e){ return ts||""; }',
    '}',
    '',
    '// ── タイムライン ─────────────────────────────────────────',
    'function initTimeline(){',
    '  renderTlFilterBtns();',
    '  renderTlCards();',
    '}',
    'function renderTlFilterBtns(){',
    '  var el=document.getElementById("tl-filter-btns"); if(!el) return;',
    '  el.innerHTML=Object.keys(TL_COLORS).map(function(fid){',
    '    var col=TL_COLORS[fid];',
    '    return \'<button data-fid="\'+fid+\'" onclick="tlFilterFid(this.dataset.fid)"\'+',
    '      \' style="font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;\'+',
    '      \'border:1px solid \'+col+\';background:white;color:\'+col+\';"> \'+fid.replace("MC_","")+" </button>";',
    '  }).join("");',
    '}',
    '// リサイズで再描画（タイムライン表示中のみ）',
    'var _tlResizeTimer=null;',
    'window.addEventListener("resize",function(){',
    '  if(document.getElementById("timeline")&&',
    '     document.getElementById("timeline").style.display!=="none"){',
    '    clearTimeout(_tlResizeTimer);',
    '    _tlResizeTimer=setTimeout(renderTlCards,150);',
    '  }',
    '});',
    '',
    'function tlFilterAll(){ tlVisible=null; renderTlCards(); }',
    'function tlFilterFid(fid){ tlVisible=[fid]; renderTlCards(); }',
    'function renderTlCards(){',
    '  var cont=document.getElementById("tl-serpentine"); if(!cont) return;',
    '  var containerEl=document.getElementById("tl-container");',
    '  var containerW=containerEl ? Math.max(containerEl.offsetWidth-40, 300) : 900;',
    '  var SLOT=180;',
    '  var TL_COLS=Math.max(1, Math.floor(containerW/SLOT));',
    '  var data=tlVisible?TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId)>=0; }):TL_DATA;',
    '  var lbl=document.getElementById("tl-total-label"); if(lbl) lbl.textContent=data.length+" seq";',
    '  var cards=data.map(function(s,idx){',
    '    var col=TL_COLORS[s.featureId]||"#94a3b8";',
    '    var isSel=tlSelected.indexOf(s.globalSeqNo)>=0;',
    '    var bdr=isSel?',
    '      "border:2px solid #3b82f6;background:#eff6ff;box-shadow:0 0 0 2px #93c5fd;"',
    '      :"border:2px solid "+col+";background:white;";',
    '    var ng=s.autoNG?\'<div style="color:#dc2626;font-weight:700;font-size:10px;">❌ NG</div>\':"";',
    '    var eBdg=s.consoleErr?\'<span style="background:#fee2e2;color:#b91c1c;border-radius:3px;padding:0 4px;font-size:9px;">\'+s.consoleErr+\' ERR</span>\':"";',
    '    var wBdg=s.consoleWarn?\'<span style="background:#fef9c3;color:#854d0e;border-radius:3px;padding:0 4px;font-size:9px;">\'+s.consoleWarn+\' WRN</span>\':"";',
    '    var th=s.thumbPath',
    '      ?\'<img src="\'+s.thumbPath+\'" style="width:100%;height:64px;object-fit:cover;display:block;" onerror="this.style.display=\\\'none\\\'">\' ',
    '      :\'<div style="width:100%;height:64px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;">No img</div>\';',
    '    return \'<div class="tl-card" onclick="tlCardClick(event,\'+s.globalSeqNo+\',\'+idx+\')"\'+',
    '      \' style="\'+bdr+\'border-radius:8px;cursor:pointer;width:120px;flex-shrink:0;overflow:hidden;">\'+',
    '      \'<div style="background:\'+col+\';padding:3px 6px;display:flex;justify-content:space-between;">\'+',
    '      \'  <span style="color:white;font-size:10px;font-weight:700;">seq \'+s.globalSeqNo+\'</span>\'+',
    '      \'  <span style="color:white;font-size:9px;opacity:.85;">\'+String(s.featureId||"").replace("MC_","").slice(0,8)+\'</span>\'+',
    '      \'</div>\'+th+',
    '      \'<div style="padding:5px 6px;">\'+',
    '      \'  <div style="font-size:10px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\'+escH(s.summary)+\'</div>\'+',
    '      \'  <div style="font-size:9px;color:#64748b;margin-top:2px;">\'+fmtTJ(s.ts)+\'</div>\'+',
    '      \'  <div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap;">\'+ng+eBdg+wBdg+\'</div>\'+',
    '      \'</div></div>\';',
    '  });',
    '  var sep=\'<div class="tl-arrow"><div class="tl-arrow-line"></div></div>\';',
    '  var html="";',
    '  for(var r=0; r*TL_COLS<cards.length; r++){',
    '    var chunk=cards.slice(r*TL_COLS, (r+1)*TL_COLS);',
    '    var isRtl=r%2===1;',
    '    var isLast=(r+1)*TL_COLS>=cards.length;',
    '    html+=\'<div class="tl-row\'+(isRtl?\' rtl\':\'\')+\'">\'+chunk.join(sep)+\'</div>\';',
    '    if(!isLast){',
    '      var xc=isRtl?60:(containerW-60);',
    '      var sw=3,arr=8,lh=28;',
    '      html+=\'<div class="tl-uturn">\'+',
    '        \'<div style="position:absolute;left:\'+(xc-1)+\'px;top:2px;width:\'+sw+\'px;height:\'+lh+\'px;background:#475569;"></div>\'+',
    '        \'<div style="position:absolute;left:\'+(xc-arr)+\'px;top:\'+(lh+2)+\'px;width:0;height:0;\'+',
    '        \'border-left:\'+arr+\'px solid transparent;border-right:\'+arr+\'px solid transparent;\'+',
    '        \'border-top:\'+arr+\'px solid #475569;"></div>\'+',
    '        \'</div>\';',
    '    }',
    '  }',
    '  cont.innerHTML=html;',
    '}',
    'function tlCardClick(evt,gseq,idx){',
    '  var data=tlVisible?TL_DATA.filter(function(s){return tlVisible.indexOf(s.featureId)>=0;}):TL_DATA;',
    '  if(evt.shiftKey&&tlLastIdx>=0){',
    '    var fr=Math.min(tlLastIdx,idx),to=Math.max(tlLastIdx,idx);',
    '    for(var i=fr;i<=to;i++){ var g=data[i].globalSeqNo; if(tlSelected.indexOf(g)<0) tlSelected.push(g); }',
    '  } else if(evt.ctrlKey||evt.metaKey){',
    '    var pos=tlSelected.indexOf(gseq);',
    '    if(pos>=0) tlSelected.splice(pos,1); else tlSelected.push(gseq);',
    '    tlLastIdx=idx;',
    '  } else { tlSelected=[gseq]; tlLastIdx=idx; }',
    '  renderTlCards(); updateSelPanel();',
    '}',
    'function clearTlSelection(){ tlSelected=[]; tlLastIdx=-1; renderTlCards(); updateSelPanel(); }',
    'function updateSelPanel(){',
    '  var panel=document.getElementById("tl-selection-panel");',
    '  var cnt=document.getElementById("tl-sel-count");',
    '  var sum=document.getElementById("tl-sel-summary");',
    '  var list=document.getElementById("tl-sel-list");',
    '  if(tlSelected.length===0){ if(panel) panel.style.display="none"; return; }',
    '  if(panel) panel.style.display="block";',
    '  var sel=TL_DATA.filter(function(s){return tlSelected.indexOf(s.globalSeqNo)>=0;});',
    '  sel.sort(function(a,b){return a.globalSeqNo-b.globalSeqNo;});',
    '  var uFids=[]; sel.forEach(function(s){ if(uFids.indexOf(s.featureId)<0) uFids.push(s.featureId); });',
    '  if(cnt) cnt.textContent=sel.length;',
    '  if(sum) sum.textContent="seq "+sel[0].globalSeqNo+" ～ "+sel[sel.length-1].globalSeqNo+',
    '    " | "+uFids.map(function(f){return f.replace("MC_","");}).join(", ");',
    '  if(list) list.innerHTML=sel.map(function(s){',
    '    var col=TL_COLORS[s.featureId]||"#94a3b8";',
    '    return \'<div style="background:white;border:1px solid \'+col+\';border-radius:6px;padding:4px 8px;font-size:11px;">\'+',
    '      \'<span style="color:\'+col+\';font-weight:700;">seq \'+s.globalSeqNo+\'</span> \'+',
    '      escH(s.featureId.replace("MC_",""))+" — "+escH(s.summary.slice(0,20))+"</div>";',
    '  }).join("");',
    '}',
    '',
    '// ── 作業パターン ─────────────────────────────────────────',
    'var WPT_KEY="wpt_v31";',
    'function loadPatterns(){ try{return JSON.parse(localStorage.getItem(WPT_KEY))||[];}catch(e){return [];} }',
    'function savePatterns(p){ try{localStorage.setItem(WPT_KEY,JSON.stringify(p));}catch(e){} }',
    'function genPatternId(){ return "WP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6).toUpperCase(); }',
    '',
    'function openPatternModal(editId){',
    '  var modal=document.getElementById("wpt-modal"); if(!modal) return;',
    '  modal.style.display="flex";',
    '  if(editId){',
    '    modal.dataset.editId=editId;',
    '    var p=loadPatterns().find(function(x){return x.id===editId;}); if(!p) return;',
    '    document.getElementById("wpt-name").value=p.name||"";',
    '    document.getElementById("wpt-desc").value=p.description||"";',
    '    document.getElementById("wpt-mode").value=p.screenMode||"";',
    '    document.getElementById("wpt-status").value=p.overallStatus||"\u672a\u8a55\u4fa1";',
    '    document.getElementById("wpt-ng-content").value=p.ngContent||"";',
    '    document.getElementById("wpt-ng-priority").value=p.ngPriority||"\u4e2d";',
    '    toggleNgArea();',
    '    renderModalSeqList(p.seqs||[]);',
    '  } else {',
    '    delete modal.dataset.editId;',
    '    document.getElementById("wpt-name").value="";',
    '    document.getElementById("wpt-desc").value="";',
    '    document.getElementById("wpt-mode").value="";',
    '    document.getElementById("wpt-status").value="\u672a\u8a55\u4fa1";',
    '    document.getElementById("wpt-ng-content").value="";',
    '    document.getElementById("wpt-ng-priority").value="\u4e2d";',
    '    toggleNgArea();',
    '    var seqs=TL_DATA.filter(function(s){return tlSelected.indexOf(s.globalSeqNo)>=0;});',
    '    seqs.sort(function(a,b){return a.globalSeqNo-b.globalSeqNo;});',
    '    renderModalSeqList(seqs);',
    '  }',
    '}',
    'function closePatternModal(){ var m=document.getElementById("wpt-modal"); if(m) m.style.display="none"; }',
    'function toggleNgArea(){',
    '  var st=document.getElementById("wpt-status");',
    '  var ar=document.getElementById("wpt-ng-area");',
    '  if(st&&ar) ar.style.display=st.value==="NG"?"block":"none";',
    '}',
    'function renderModalSeqList(seqs){',
    '  var cnt=document.getElementById("wpt-modal-seqcnt"); if(cnt) cnt.textContent=seqs.length;',
    '  var lst=document.getElementById("wpt-modal-seqlist"); if(!lst) return;',
    '  if(!seqs.length){ lst.innerHTML=\'<span style="color:#94a3b8;font-size:12px;">\u672a\u9078\u629e</span>\'; return; }',
    '  lst.innerHTML=seqs.map(function(s){',
    '    var col=TL_COLORS[s.featureId]||"#94a3b8";',
    '    return \'<div style="background:white;border:1px solid \'+col+\';border-radius:5px;padding:3px 7px;font-size:11px;">\'+',
    '      \'<span style="color:\'+col+\';font-weight:700;">seq \'+(s.globalSeqNo||s.seqNo)+\'</span> \'+',
    '      String(s.featureId||"").replace("MC_","")+" — "+escH(String(s.summary||"").slice(0,18))+"</div>";',
    '  }).join("");',
    '}',
    'function savePattern(){',
    '  var name=document.getElementById("wpt-name").value.trim();',
    '  var status=document.getElementById("wpt-status").value;',
    '  if(!name){ alert("\u30d1\u30bf\u30fc\u30f3\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002"); return; }',
    '  if(status==="NG"&&!document.getElementById("wpt-ng-content").value.trim()){',
    '    alert("NG \u306e\u5834\u5408\u306f NG\u5185\u5bb9 \u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002"); return;',
    '  }',
    '  var modal=document.getElementById("wpt-modal");',
    '  var editId=modal.dataset.editId||"";',
    '  var seqData=editId',
    '    ?(loadPatterns().find(function(x){return x.id===editId;})||{}).seqs||[]',
    '    :TL_DATA.filter(function(s){return tlSelected.indexOf(s.globalSeqNo)>=0;}).sort(function(a,b){return a.globalSeqNo-b.globalSeqNo;});',
    '  var pats=loadPatterns();',
    '  var pat={',
    '    id:editId||genPatternId(),',
    '    name:name,',
    '    description:document.getElementById("wpt-desc").value.trim(),',
    '    screenMode:document.getElementById("wpt-mode").value,',
    '    overallStatus:status,',
    '    ngContent:document.getElementById("wpt-ng-content").value.trim(),',
    '    ngPriority:document.getElementById("wpt-ng-priority").value,',
    '    seqs:seqData,',
    '    updatedAt:new Date().toISOString(),',
    '    createdAt:editId?(pats.find(function(x){return x.id===editId;})||{}).createdAt||new Date().toISOString():new Date().toISOString()',
    '  };',
    '  if(editId){ var idx=pats.findIndex(function(x){return x.id===editId;}); if(idx>=0) pats[idx]=pat; else pats.push(pat); }',
    '  else pats.push(pat);',
    '  savePatterns(pats);',
    '  closePatternModal();',
    '  clearTlSelection();',
    '  showPage("patterns");',
    '  renderPatternList();',
    '}',
    'function renderPatternList(){',
    '  var pats=loadPatterns();',
    '  var area=document.getElementById("pattern-list-area"); if(!area) return;',
    '  var ok=pats.filter(function(p){return p.overallStatus==="OK";}).length;',
    '  var ng=pats.filter(function(p){return p.overallStatus==="NG";}).length;',
    '  var pe=pats.filter(function(p){return p.overallStatus!=="OK"&&p.overallStatus!=="NG";}).length;',
    '  var tt=document.getElementById("wpt-total"); if(tt) tt.textContent=pats.length;',
    '  var wok=document.getElementById("wpt-ok");  if(wok) wok.textContent=ok;',
    '  var wng=document.getElementById("wpt-ng");  if(wng) wng.textContent=ng;',
    '  var wpe=document.getElementById("wpt-pend");if(wpe) wpe.textContent=pe;',
    '  if(!pats.length){ area.innerHTML=\'<div class="card" style="color:#94a3b8;padding:32px;text-align:center;">\u672a\u767b\u9332</div>\'; return; }',
    '  area.innerHTML=pats.map(function(p){',
    '    var stI=p.overallStatus==="OK"?"\u2705":p.overallStatus==="NG"?"\u274c":"\u2b1c";',
    '    var stC=p.overallStatus==="OK"?"#16a34a":p.overallStatus==="NG"?"#dc2626":"#94a3b8";',
    '    var stB=p.overallStatus==="OK"?"#f0fdf4":p.overallStatus==="NG"?"#fff5f5":"#f8fafc";',
    '    var mT=p.screenMode?\'<span style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:4px;padding:1px 7px;font-size:10px;">\'+escH(p.screenMode)+"</span>":"";',
    '    var ngS=(p.overallStatus==="NG"&&p.ngContent)',
    '      ?\'<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:10px;margin-top:8px;font-size:12px;color:#991b1b;">\'+',
    '        \'<b>NG\u5185\u5bb9: </b>\'+escH(p.ngContent)+',
    '        (p.ngPriority?\'<span style="background:#fecaca;border-radius:3px;padding:1px 5px;font-size:10px;margin-left:6px;">\u512a\u5148\u5ea6\uff1a\'+escH(p.ngPriority)+"</span>":"")+',
    '        "</div>":"";',
    '    var fds=[]; (p.seqs||[]).forEach(function(s){if(s.featureId&&fds.indexOf(s.featureId)<0)fds.push(s.featureId);});',
    '    var fT=fds.map(function(f){var c=TL_COLORS[f]||"#94a3b8"; return \'<span style="background:\'+c+\'22;border:1px solid \'+c+\';color:\'+c+\';border-radius:4px;padding:1px 6px;font-size:10px;">\'+escH(f.replace("MC_",""))+"</span>";}).join(" ");',
    '    var sL=(p.seqs||[]).map(function(s){var c=TL_COLORS[s.featureId]||"#94a3b8"; return \'<span style="background:white;border:1px solid \'+c+\';border-radius:4px;padding:1px 7px;font-size:10px;">seq \'+(s.globalSeqNo||s.seqNo)+"</span>";}).join(" ");',
    '    var upd=p.updatedAt?new Date(p.updatedAt).toLocaleString("ja-JP",{dateStyle:"short",timeStyle:"short"}):"";',
    '    return \'<div class="card" style="margin-bottom:14px;border-left:4px solid \'+stC+\';background:\'+stB+\';">\'+',
    '      \'<div style="display:flex;align-items:flex-start;gap:12px;">\'+',
    '      \'  <div style="flex:1;">\'+',
    '      \'    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">\'+',
    '      \'      <span style="font-size:15px;font-weight:700;color:#0f172a;">\'+stI+" "+escH(p.name)+"</span>"+mT+',
    '      \'    </div>\'+',
    '      (p.description?\'<p style="font-size:13px;color:#475569;margin:0 0 6px;">\'+escH(p.description)+"</p>":"")+',
    '      \'    <div style="display:flex;gap:8px;flex-wrap:wrap;">\'+fT+',
    '      \'      <span style="font-size:11px;color:#64748b;">\'+((p.seqs||[]).length)+\' seq</span>\'+',
    '      \'      <span style="font-size:10px;color:#94a3b8;">\'+escH(upd)+"</span>"+',
    '      \'    </div>\'+',
    '      (sL?\'<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">\'+sL+"</div>":"")+',
    '      ngS+',
    '      \'  </div>\'+',
    '      \'  <div style="display:flex;gap:8px;flex-shrink:0;">\'+',
    '      \'    <button data-id="\'+p.id+\'" onclick="openPatternModal(this.dataset.id)"\'+',
    '      \'      style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #94a3b8;background:white;cursor:pointer;">\u270f\ufe0f \u7de8\u96c6</button>\'+',
    '      \'    <button data-id="\'+p.id+\'" onclick="deletePattern(this.dataset.id)"\'+',
    '      \'      style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;cursor:pointer;">\ud83d\uddd1 \u524a\u9664</button>\'+',
    '      \'  </div>\'+',
    '      \'</div></div>\';',
    '  }).join("");',
    '}',
    'function deletePattern(id){',
    '  if(!confirm("\u3053\u306e\u30d1\u30bf\u30fc\u30f3\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")) return;',
    '  savePatterns(loadPatterns().filter(function(p){return p.id!==id;}));',
    '  renderPatternList();',
    '}',
  ];

  return '<script>\n' + lines.join('\n') + '\n<\/script>';
}

// ─────────────────────────────────────────────────────────────
// HTML 組み立て
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// renderFlowScript: initFlowPage を独立templateリテラルで出力
// lines配列を使わないのでクォートエスケープ問題を完全回避
// ─────────────────────────────────────────────────────────────
function renderFlowScript() {
  return `<script>
(function(){
'use strict';
function initFlowPage(fid){
  var canvas=document.getElementById('flow-canvas-'+fid);
  if(!canvas) return;
  var dat=(window.FLOW_PAGE_DATA||{})[fid];
  if(!dat) return;
  var W=canvas.offsetWidth||900;
  var cW=Math.max(W-48,180);
  var SLOT=180;
  var COLS=Math.max(1,Math.floor(cW/SLOT));
  if(canvas._cols===COLS) return;
  canvas._cols=COLS;
  var seqs=dat.seqs;
  var fid2=dat.fid;
  function fbox(s,isStart,isEnd){
    var cls='flow-box'+(isStart?' start':isEnd?' end':'')+(s.autoNG?' is-ng':'');
    var sk=fid2+'_seq'+s.seqNo;
    var th=s.thumbPath
      ? '<div class="flow-box-thumb"><img src="'+s.thumbPath+'" loading="lazy"></div>'
      : '<div class="flow-box-thumb"><span class="flow-box-thumb-none">\u{1F4F7}</span></div>';
    var verdict=s.autoNG
      ? '<span style="color:#dc2626;font-size:10px;font-weight:700;">\u274C NG</span>'
      : '<span style="color:#16a34a;font-size:10px;font-weight:700;">\u2705 OK</span>';
    return '<div class="flow-node">'
      +'<div class="'+cls+'" id="fbox-'+sk+'" data-fid="'+fid2+'" data-seq="'+s.seqNo+'">'
      +th
      +'<div class="flow-box-content">'
      +'<div class="flow-box-screen-id">'+(s.screenId||'')+'</div>'
      +'<div class="flow-box-label">'+(s.summary||'')+'</div>'
      +'<div class="flow-box-sub">'+(s.opContent||'')+'</div>'
      +'<div class="flow-node-verdict" id="fv-'+sk+'">'+verdict+'</div>'
      +'</div></div>'
      +'<div class="flow-node-seq">seq '+s.seqNo+'</div>'
      +'</div>';
  }
  function farrow(ns){
    if(!ns) return '';
    var lbl=(ns.opContent||'').slice(0,14);
    var lc='flow-arrow-label'+(ns.autoNG?' ng':' ok');
    return '<div class="flow-arrow">'
      +'<div class="'+lc+'">'+lbl+'</div>'
      +'<div class="flow-arrow-line"></div>'
      +'</div>';
  }
  function uturnConnector(isRtl,cW){
    // space-between でBOXが等間隔配置されるため端BOX中心は常に固定
    // LTR右端BOX中心: cW-60  RTL左端BOX中心: 60
    var xc=isRtl?60:(cW-60);
    var sw=3,arr=8,lh=34;
    return '<div class="flow-uturn">'
      +'<div style="position:absolute;left:'+(xc-1)+'px;top:2px;width:'+sw+'px;height:'+lh+'px;background:#475569;"></div>'
      +'<div style="position:absolute;left:'+(xc-arr)+'px;top:'+(lh+2)+'px;width:0;height:0;'
      +'border-left:'+arr+'px solid transparent;border-right:'+arr+'px solid transparent;'
      +'border-top:'+arr+'px solid #475569;"></div>'
      +'</div>';
  }
  if(!canvas._ev){
    canvas._ev=true;
    canvas.addEventListener('click',function(e){
      var b=e.target.closest('[data-fid]');
      if(!b) return;
      var f=b.getAttribute('data-fid');
      var n=parseInt(b.getAttribute('data-seq'),10);
      if(window.showPage) showPage(f);
      setTimeout(function(){if(window.scrollToActionLog) scrollToActionLog(f,n);},300);
    });
  }
  var html2='';
  var totalW=canvas.offsetWidth||900;
  for(var row=0;row*COLS<seqs.length;row++){
    var chunk=seqs.slice(row*COLS,(row+1)*COLS);
    var isRtl=row%2===1;
    var isLast=(row+1)*COLS>=seqs.length;
    var inner='';
    for(var ci=0;ci<chunk.length;ci++){
      var si2=row*COLS+ci;
      var s=chunk[ci];
      var ns=seqs[si2+1]||null;
      var isStart=si2===0;
      var isEnd=si2===seqs.length-1;
      inner+=fbox(s,isStart,isEnd);
      if(ci<chunk.length-1) inner+=farrow(ns);
    }
    html2+='<div class="flow-row'+(isRtl?' rtl':'')+'" >'+inner+'</div>';
    if(!isLast) html2+=uturnConnector(isRtl,cW);
  }
  canvas.innerHTML=html2;
  Object.keys(window.META||{}).forEach(function(k){
    if(k.indexOf(fid2)===0 && window.restoreVerdict) restoreVerdict(k);
  });
}
window.initFlowPage=initFlowPage;
window.addEventListener('resize',function(){
  document.querySelectorAll('.page.active').forEach(function(p){
    if(p.id && p.id.indexOf('flow_')===0){
      var fid=p.id.slice(5);
      var c=document.getElementById('flow-canvas-'+fid);
      if(c){ c._cols=null; initFlowPage(fid); }
    }
  });
});
})();
<\/script>`;
}

function buildHtml(fids, allLogs, allShots, issData, allConsoleLogs) {
  const allSeqs = buildAllSeqs(fids, allLogs, allShots, issData, allConsoleLogs);

  const screenPages = fids.map(fid =>
    renderScreenPage(fid, allLogs[fid] || [], allShots[fid] || [], issData, allConsoleLogs)
  ).join('\n');

  const flowPages = fids.map(fid => {
    const fi   = (issData.issues || []).filter(i => i.featureId === fid);
    const cl   = allConsoleLogs[fid] || [];
    const seqs = buildSequences(allLogs[fid] || [], allShots[fid] || [], fi, cl);
    seqs.forEach(s => { s.featureId = fid; });
    return renderFlowPage(fid, seqs);
  }).join('\n');

  // FLOW_PAGE_DATA生成
  const flowPageDataEntries = fids.map(fid => {
    const fi = (issData.issues||[]).filter(i=>i.featureId===fid);
    const cl = allConsoleLogs[fid]||[];
    const seqs = buildSequences(allLogs[fid]||[], allShots[fid]||[], fi, cl);
    const light = seqs.map(s=>({
      seqNo: s.seqNo,
      screenId: s.screenId,
      summary: (s.summary||'').slice(0,16),
      opContent: (s.opContent||'').slice(0,16),
      autoNG: s.autoNG,
      thumbPath: s.shots&&s.shots[0] ? ('../screenshots/'+fid+'/'+s.shots[0].fname) : null
    }));
    return [fid, {fid, seqs: light}];
  });
  const flowDataScript = '<script>window.FLOW_PAGE_DATA='+
    JSON.stringify(Object.fromEntries(flowPageDataEntries)).replace(/<\//g,'<\\/')+
    ';<\/script>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>画面レビュー資料 — Machining System v3.1</title>
${renderCSS()}
</head>
<body>
${renderSidebar(fids)}
<div id="main-content">
${renderDashboard(fids, allLogs, allShots, issData)}
${screenPages}
${flowPages}
${renderTimelinePage()}
${renderWorkPatternsPage()}
${renderIssuesPage()}
</div>
<!-- スクショモーダル -->
<div id="ss-modal" class="ss-modal" onclick="closeModal(event)">
  <div class="ss-modal-inner">
    <button class="ss-modal-close" onclick="document.getElementById('ss-modal').style.display='none'">✕</button>
    <div id="modal-title" style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;"></div>
    <div id="modal-ss" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;min-height:200px;display:flex;align-items:center;justify-content:center;"></div>
  </div>
</div>
${flowDataScript}
${renderFlowScript()}
${renderScript(fids, allLogs, allShots, issData, allSeqs)}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
function main() {
  const allLogs        = loadLogs();
  const allConsoleLogs = loadConsoleLogs();
  const allShots       = loadScreenshots();
  const issData        = loadIssues();
  const fids           = Object.keys(allLogs).sort();

  if (!fids.length) console.warn('[generate-review v3.1] ログファイルが見つかりません。');
  console.log('[generate-review v3.1] 画面:', fids.join(', ') || 'なし');

  const clFids = Object.keys(allConsoleLogs);
  if (clFids.length) {
    console.log('[generate-review v3.1] コンソールログ:', clFids.map(f => f + '(' + allConsoleLogs[f].length + '件)').join(', '));
  }

  const html = buildHtml(fids, allLogs, allShots, issData, allConsoleLogs);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log('[generate-review v3.1] 完了: ' + OUT_FILE + ' (' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB)');
}

main();