#!/usr/bin/env node
// scripts/generate-review.js  v2.0
// ============================================================
// アクションレビューHTML自動生成スクリプト
//
// 新機能(v2.0):
//  ・画面遷移図: seqフロー(上段) + サムネイル一覧(下段)
//  ・判定ボタン: OK/NG クリック切替、NGは赤表示
//  ・NG時 課題入力フォーム: 種別/優先度/対応状態/内容/備考
//  ・localStorage 永続化
//  ・課題一覧ページ: NGシーケンスを自動集約 + フィルター + 進捗管理
//
// 入力:
//   logs/features/{featureId}.jsonl
//   logs/screenshots/{featureId}/
//   docs/issues/issues.json (任意)
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

// ─────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtTs(ts) {
  try {
    const d   = new Date(ts);
    const jst = new Date(d.getTime() + 9*3600*1000);
    const p   = n => String(n).padStart(2,'0');
    return jst.getUTCFullYear()+'/'+p(jst.getUTCMonth()+1)+'/'+p(jst.getUTCDate())
          +' '+p(jst.getUTCHours())+':'+p(jst.getUTCMinutes());
  } catch { return String(ts||''); }
}
function shortLabel(label) {
  if (!label) return '';
  const m = label.match(/^([A-Z_]+):(.+)$/);
  if (!m) return label.slice(0,40);
  const [,t,n] = m;
  if (t==='BTN_CLICK')     return n+'ボタン押下';
  if (t==='INPUT_CHANGE')  return n+' 入力';
  if (t==='SELECT_CHANGE') return n+' 選択';
  return label.slice(0,40);
}
function triggerLabel(tr) {
  if (!tr) return '';
  if (tr.includes('_BEFORE'))  return '📸 BEFORE — 操作直前';
  if (tr.includes('_AFTER'))   return '📸 AFTER — 操作結果';
  if (tr==='SCREEN_LOAD')      return '🖥 SCREEN_LOAD — 初期表示';
  if (tr==='JS_ERROR')         return '🚨 ERROR — エラー発生時';
  return '📷 '+tr;
}
function triggerStyle(tr) {
  if (!tr) return 'border-color:#cbd5e1;';
  if (tr.includes('_BEFORE')) return 'border-color:#f97316;';
  if (tr.includes('_AFTER'))  return 'border-color:#ef4444;';
  if (tr==='SCREEN_LOAD')     return 'border-color:#93c5fd;';
  if (tr==='JS_ERROR')        return 'border-color:#dc2626;';
  return 'border-color:#cbd5e1;';
}
function triggerHeaderStyle(tr) {
  if (!tr) return 'background:#f8fafc;color:#475569;';
  if (tr.includes('_BEFORE')) return 'background:#fff7ed;color:#9a3412;';
  if (tr.includes('_AFTER'))  return 'background:#fff5f5;color:#991b1b;';
  if (tr==='SCREEN_LOAD')     return 'background:#eff6ff;color:#1d4ed8;';
  if (tr==='JS_ERROR')        return 'background:#fee2e2;color:#7f1d1d;';
  return 'background:#f8fafc;color:#475569;';
}

// ─────────────────────────────────────────────────────────────
// データ読み込み
// ─────────────────────────────────────────────────────────────
function loadLogs() {
  if (!fs.existsSync(LOGS_DIR)) return {};
  const result = {};
  for (const f of fs.readdirSync(LOGS_DIR).filter(f=>f.endsWith('.jsonl'))) {
    const fid = path.basename(f,'.jsonl');
    if (fid==='UNKNOWN') continue;
    const entries = [];
    for (const line of fs.readFileSync(path.join(LOGS_DIR,f),'utf8').split('\n').filter(Boolean)) {
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
      const base  = fname.replace(/\.(jpg|jpeg|png)$/i,'');
      const parts = base.split('_');
      const ti    = parts.findIndex(p=>/^TR-/.test(p));
      const trigger = ti>=2 ? parts.slice(2,ti).join('_') : '';
      const traceId = ti>=0 ? parts.slice(ti).join('-') : '';
      map[fid].push({ fname, fid, trigger, traceId });
    }
  }
  return map;
}

function loadIssues() {
  if (!fs.existsSync(ISSUES_FILE)) return { issues:[] };
  try { return JSON.parse(fs.readFileSync(ISSUES_FILE,'utf8')); } catch { return { issues:[] }; }
}

// ─────────────────────────────────────────────────────────────
// シーケンス構築
// ─────────────────────────────────────────────────────────────
function buildSequences(entries, screenshots, fidIssues) {
  const sorted = [...entries].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  const traceMap = {};
  for (const e of sorted) {
    if (!e.traceId) continue;
    (traceMap[e.traceId] = traceMap[e.traceId]||[]).push(e);
  }
  const ssMap = {};
  for (const ss of (screenshots||[])) {
    const m = ss.fname.match(/(TR-\d+-[a-z0-9]+)/i);
    const tid = m ? m[1] : '';
    if (tid) (ssMap[tid] = ssMap[tid]||[]).push(ss);
  }
  const issMap = {};
  for (const iss of (fidIssues||[])) {
    if (iss.relatedTraceId) (issMap[iss.relatedTraceId]=issMap[iss.relatedTraceId]||[]).push(iss);
  }

  const seen = [], seqs = [];
  let no = 0;
  for (const e of sorted) {
    if (!e.traceId||seen.includes(e.traceId)) continue;
    seen.push(e.traceId);
    const grp = traceMap[e.traceId]||[e];
    const main= grp.find(x=>x.type==='SCREEN_LOAD')
              ||grp.find(x=>x.type==='UI_CLICK')
              ||grp.find(x=>x.type==='ERROR')
              ||grp.find(x=>x.type==='BACKEND')
              ||grp[0];
    if (!main) continue;
    no++;
    let summary='', opContent='', target='', inputVal='';
    const hasErr = grp.some(x=>x.type==='ERROR');
    if (main.type==='SCREEN_LOAD') {
      summary=main.screenName||'画面表示'; opContent=summary+' — 初期状態'; target='—'; inputVal='—';
    } else if (main.type==='UI_CLICK') {
      summary=shortLabel(main.label||''); opContent=summary;
      target=main.elementId||'—';
      const iv=main.inputValues||{};
      inputVal=iv.newValue||iv.selectedValue||(iv.buttonLabel?'—（ボタン）':'—');
    } else if (main.type==='ERROR') {
      summary='エラー発生'; opContent=String(main.message||'').slice(0,80); target='—'; inputVal='—';
    } else if (main.type==='BACKEND') {
      summary=main.processName||'バックエンド処理';
      opContent=summary+' — '+(main.status||'');
      target=main.processName||'—';
      inputVal=main.rowCount!=null?main.rowCount+'件':'—';
    }
    const be=grp.find(x=>x.type==='BACKEND');
    if (be&&main.type==='UI_CLICK') opContent+='（結果: '+(be.rowCount??'?')+'件）';
    seqs.push({
      seqNo:no, traceId:main.traceId,
      screenId:main.screenId||main.featureId, featureId:main.featureId,
      ts:main.ts, summary, opContent, target, inputVal,
      autoNG:hasErr,
      issues:issMap[main.traceId]||[],
      shots:ssMap[main.traceId]||[],
    });
  }
  return seqs;
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────
function renderCSS() {
  return `
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');
*,*::before,*::after{box-sizing:border-box;}
*{font-family:'Noto Sans JP',sans-serif;}
code,.mono{font-family:'JetBrains Mono',monospace;}
:root{--sidebar-w:260px;}

/* SIDEBAR */
#sidebar{width:var(--sidebar-w);min-height:100vh;position:fixed;top:0;left:0;background:#0f172a;overflow-y:auto;z-index:100;}
#main-content{margin-left:var(--sidebar-w);min-height:100vh;background:#f1f5f9;}
.nav-item{display:flex;align-items:center;gap:8px;padding:8px 16px 8px 20px;font-size:13px;color:#94a3b8;border-left:3px solid transparent;cursor:pointer;transition:all .15s;}
.nav-item:hover{color:#f1f5f9;background:#1e293b;border-left-color:#3b82f6;}
.nav-item.active{color:#fff;background:#1e3a8a;border-left-color:#60a5fa;font-weight:600;}
.nav-item.nav-sub{padding-left:32px;font-size:11px;}
.nav-group{padding:14px 16px 4px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#475569;font-weight:700;}

/* BADGE */
.badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;}
.badge-ok{background:#dcfce7;color:#166534;}
.badge-ng{background:#fee2e2;color:#991b1b;}
.badge-warn{background:#fef3c7;color:#92400e;}
.badge-pend{background:#f1f5f9;color:#475569;}

/* CARD */
.card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:24px 28px;margin-bottom:16px;}
.card-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:18px;}

/* TABLE */
.spec-table{width:100%;border-collapse:collapse;font-size:13.5px;}
.spec-table th{background:#f8fafc;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;}
.spec-table td{padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;}
.spec-table tr:last-child td{border-bottom:none;}
.spec-table tr:hover td{background:#fafbff;}

/* SS PLACEHOLDER */
.ss-box{border:2px dashed #cbd5e1;border-radius:8px;background:#f8fafc;min-height:90px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.ss-placeholder{color:#94a3b8;font-size:12px;text-align:center;padding:14px;}

/* ACTION LOG */
.action-log{margin-bottom:20px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);border-left:3px solid transparent;transition:border-left-color .2s;}
.action-log.is-ng{border-left-color:#ef4444;}
.al-header{display:grid;grid-template-columns:100px 1fr 180px;background:#f8fafc;border:1px solid #e2e8f0;border-bottom:none;}
.al-header-cell{padding:10px 14px;border-right:1px solid #e2e8f0;}
.al-header-cell:last-child{border-right:none;}
.al-meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #e2e8f0;border-top:none;border-bottom:none;background:#fafbff;}
.al-meta-cell{display:grid;grid-template-columns:80px 1fr;align-items:center;padding:7px 14px;border-right:1px solid #e2e8f0;gap:8px;}
.al-meta-cell:last-child{border-right:none;}
.al-ss{border:1px solid #e2e8f0;border-top:none;border-bottom:none;padding:12px 14px;background:white;}
.al-detail{border:1px solid #e2e8f0;border-top:none;}
.al-row{display:grid;grid-template-columns:110px 1fr;border-bottom:1px solid #f1f5f9;}
.al-row:last-child{border-bottom:none;}
.al-label{padding:10px 14px;background:#f8fafc;color:#64748b;font-weight:600;font-size:13px;border-right:1px solid #e2e8f0;display:flex;align-items:flex-start;padding-top:12px;}
.al-value{padding:10px 14px;color:#1e293b;background:white;font-size:13.5px;}
.al-fieldlabel{font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.8px;line-height:1;margin-bottom:3px;}
.al-fieldvalue{font-weight:600;color:#0f172a;font-size:13.5px;}

/* VERDICT TOGGLE */
.verdict{display:inline-flex;align-items:center;gap:10px;}
.toggle{width:46px;height:25px;border-radius:13px;position:relative;flex-shrink:0;transition:background .2s;cursor:pointer;}
.toggle::after{content:'';position:absolute;top:3px;width:19px;height:19px;background:white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:all .2s;}
.toggle-on{background:#22c55e;}.toggle-on::after{right:3px;left:auto;}
.toggle-off{background:#ef4444;}.toggle-off::after{left:3px;right:auto;}
.verdict-btn{display:inline-flex;align-items:center;gap:10px;background:none;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer;transition:all .15s;user-select:none;}
.verdict-btn:hover{background:#f8fafc;border-color:#94a3b8;}
.verdict-text-ok{font-size:15px;font-weight:700;color:#16a34a;}
.verdict-text-ng{font-size:15px;font-weight:700;color:#dc2626;}

/* ISSUE FORM */
.issue-form{background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-top:10px;display:none;}
.issue-form.open{display:block;}
.issue-form-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
.issue-form-row:last-child{margin-bottom:0;}
.iff-label{font-size:11px;font-weight:700;color:#64748b;white-space:nowrap;}
.iff-select{font-size:12px;padding:4px 8px;border:1px solid #fca5a5;border-radius:6px;background:white;cursor:pointer;color:#334155;}
.iff-select:focus{outline:2px solid #ef4444;outline-offset:1px;}
.iff-textarea{flex:1;min-width:180px;font-size:13px;padding:7px 10px;border:1px solid #fca5a5;border-radius:6px;background:white;resize:vertical;color:#334155;font-family:'Noto Sans JP',sans-serif;}
.iff-textarea:focus{outline:2px solid #ef4444;outline-offset:1px;}
.iff-input{flex:1;font-size:12px;padding:5px 8px;border:1px solid #fca5a5;border-radius:6px;background:white;color:#334155;}
.iff-input:focus{outline:2px solid #ef4444;outline-offset:1px;}
.issue-note-bug{background:#fff5f5;border-left:3px solid #dc2626;border-radius:4px;padding:7px 12px;font-size:13px;color:#7f1d1d;margin-top:6px;}
.issue-note-spec{background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;padding:7px 12px;font-size:13px;color:#78350f;margin-top:6px;}
.issue-filter-sel{font-size:12px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer;}

/* FLOW DIAGRAM */
.flow-canvas{overflow-x:auto;padding:32px 24px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;}
.flow-row{display:flex;align-items:center;gap:0;flex-wrap:nowrap;min-width:max-content;}
.flow-node{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;}
.flow-box{width:140px;border:2px solid #3b82f6;border-radius:10px;background:white;padding:12px 10px;text-align:center;cursor:pointer;transition:all .18s;box-shadow:0 2px 8px rgba(59,130,246,.12);}
.flow-box:hover{background:#eff6ff;border-color:#1d4ed8;transform:translateY(-2px);box-shadow:0 6px 16px rgba(59,130,246,.2);}
.flow-box.start{border-color:#16a34a;background:#f0fdf4;box-shadow:0 2px 8px rgba(22,163,74,.15);}
.flow-box.start:hover{background:#dcfce7;border-color:#15803d;}
.flow-box.end{border-color:#dc2626;background:#fff5f5;box-shadow:0 2px 8px rgba(220,38,38,.12);}
.flow-box.modal{border-style:dashed;border-color:#7c3aed;background:#faf5ff;}
.flow-box.is-ng{border-color:#ef4444 !important;background:#fff5f5 !important;}
.flow-box-screen-id{font-size:9px;font-family:'JetBrains Mono',monospace;color:#94a3b8;letter-spacing:.4px;margin-bottom:2px;}
.flow-box-label{font-size:12px;font-weight:700;color:#1e293b;line-height:1.3;}
.flow-box-sub{font-size:10px;color:#64748b;margin-top:2px;line-height:1.3;}
.flow-node-verdict{font-size:10px;margin-top:2px;min-height:16px;}
.flow-node-seq{font-size:10px;color:#94a3b8;font-weight:600;}
.flow-arrow{display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;width:80px;position:relative;}
.flow-arrow-line{width:100%;height:2px;background:#94a3b8;position:relative;}
.flow-arrow-line::after{content:'';position:absolute;right:-1px;top:50%;transform:translateY(-50%);border:6px solid transparent;border-left-color:#94a3b8;border-right:none;}
.flow-arrow-label{font-size:10px;color:#2563eb;font-weight:600;background:white;border:1px solid #bfdbfe;border-radius:4px;padding:2px 6px;white-space:nowrap;margin-bottom:6px;max-width:120px;text-align:center;line-height:1.3;}
.flow-arrow-label.ok{color:#16a34a;border-color:#bbf7d0;background:#f0fdf4;}
.flow-arrow-label.ng{color:#dc2626;border-color:#fecaca;background:#fff5f5;}
.flow-legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:11px;color:#64748b;}
.flow-legend-item{display:flex;align-items:center;gap:6px;}
.flow-legend-box{width:20px;height:14px;border-radius:3px;border:2px solid;}

/* THUMBNAIL */
.thumb-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
.thumb-section-title::after{content:'';flex:1;height:1px;background:#e2e8f0;}
.thumb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;}
.thumb-card{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:white;transition:box-shadow .15s,transform .15s;cursor:pointer;}
.thumb-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-2px);}
.thumb-card.is-ng{border-color:#fecaca;}
.thumb-img-area{background:#f1f5f9;border-bottom:1px solid #e2e8f0;min-height:110px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;}
.thumb-img-area img{width:100%;display:block;object-fit:cover;}
.thumb-seq-badge{position:absolute;top:6px;left:6px;background:#0f172a;color:white;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;}
.thumb-info{padding:10px 12px;}
.thumb-screen-id{font-size:9px;font-family:'JetBrains Mono',monospace;color:#94a3b8;margin-bottom:2px;}
.thumb-title{font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px;line-height:1.3;}
.thumb-action{font-size:10px;color:#64748b;border-top:1px solid #f1f5f9;margin-top:6px;padding-top:6px;display:flex;align-items:center;gap:4px;}

/* MODAL */
.ss-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;align-items:center;justify-content:center;padding:24px;}
.ss-modal.open{display:flex;}
.ss-modal-inner{background:white;border-radius:14px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;position:relative;}
.ss-modal-close{position:absolute;top:14px;right:16px;font-size:20px;cursor:pointer;color:#94a3b8;background:none;border:none;}
.ss-modal-close:hover{color:#1e293b;}

/* PAGE */
.page{display:none;padding:32px 36px;}
.page.active{display:block;}
#dashboard{padding:32px 36px;}
.stat-card{background:white;border-radius:12px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.stat-label{font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;}
.stat-num{font-size:32px;font-weight:700;line-height:1;}
</style>`;
}

// ─────────────────────────────────────────────────────────────
// スクリーンショットブロック
// ─────────────────────────────────────────────────────────────
function renderSsBlock(shots) {
  if (!shots||!shots.length) {
    return '<div style="color:#94a3b8;font-size:12px;padding:8px;">スクリーンショットなし</div>';
  }
  return shots.map(ss => {
    const bc = triggerStyle(ss.trigger);
    const hs = triggerHeaderStyle(ss.trigger);
    const lb = triggerLabel(ss.trigger);
    const rp = '../screenshots/'+esc(ss.fid)+'/'+esc(ss.fname);
    return `<div style="margin-bottom:10px;border-radius:8px;border:2px solid;${bc}overflow:hidden;">
<div style="padding:5px 12px;font-size:11px;font-weight:700;${hs}">${lb}</div>
<div style="background:#f8fafc;cursor:pointer;text-align:center;" onclick="openSsModal('${rp}','${esc(lb)}')">
  <img src="${rp}" alt="${lb}" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"
       onerror="this.parentElement.innerHTML='<div style=\\'padding:16px;color:#94a3b8;font-size:12px;\\'>画像未取得</div>'"/>
</div>
<div style="padding:3px 8px;font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ss.fname)}</div>
</div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// アクションログ 1件
// ─────────────────────────────────────────────────────────────
function renderActionLog(seq) {
  const sk = esc(seq.featureId+'_seq'+seq.seqNo);
  const autoNgStr = seq.autoNG ? 'true' : 'false';

  // analyze-logs.js 自動検出 issues
  const autoIssueHtml = seq.issues.map(iss => {
    const isBug = iss.severity==='Critical'||iss.severity==='High';
    const cls   = isBug ? 'issue-note-bug' : 'issue-note-spec';
    const icon  = isBug ? '🐛' : '📝';
    return `<div class="${cls}">${icon} [${esc(iss.ruleId)}] ${esc(iss.description||'')}
<br><small style="opacity:.8;">提案: ${esc(iss.fixSuggestion||'')}</small></div>`;
  }).join('');

  const ssHtml = renderSsBlock(seq.shots);

  return `
<div class="action-log${seq.autoNG?' is-ng':''}" id="al-${sk}">
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
      <div class="al-value">${seq.target==='—'?'<span style="color:#94a3b8;">—</span>':esc(seq.target)}</div>
    </div>
    <div class="al-row">
      <div class="al-label">入力値</div>
      <div class="al-value">${seq.inputVal&&seq.inputVal!=='—'
        ?`<span class="mono" style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;">${esc(seq.inputVal)}</span>`
        :'<span style="color:#94a3b8;">—</span>'}</div>
    </div>
    <div class="al-row">
      <div class="al-label">判定</div>
      <div class="al-value">
        <button class="verdict-btn" onclick="toggleVerdict('${sk}')" title="クリックでOK/NG切替">
          <div class="toggle${seq.autoNG?' toggle-off':' toggle-on'}" id="vtog-${sk}"></div>
          <span class="${seq.autoNG?'verdict-text-ng':'verdict-text-ok'}" id="vlbl-${sk}">${seq.autoNG?'NG':'OK'}</span>
        </button>
        <span style="font-size:11px;color:#94a3b8;margin-left:8px;">クリックで切替</span>
        <input type="hidden" id="vauto-${sk}" value="${autoNgStr}">
      </div>
    </div>
    <div class="al-row">
      <div class="al-label">問題点課題</div>
      <div class="al-value">
        ${autoIssueHtml}
        <div id="issue-none-${sk}"${seq.autoNG?' style="display:none;"':''} style="color:#94a3b8;">なし</div>
        <div class="issue-form${seq.autoNG?' open':''}" id="iform-${sk}">
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
// 画面遷移図ページ
// ─────────────────────────────────────────────────────────────
function renderFlowPage(featureId, seqs) {
  const name = SCREEN_NAME_MAP[featureId]||featureId;

  // フローノード & 矢印
  let flowHtml = '';
  for (let i=0;i<seqs.length;i++) {
    const s   = seqs[i];
    const sk  = esc(featureId+'_seq'+s.seqNo);
    const cls = i===0 ? 'flow-box start' : (i===seqs.length-1 ? 'flow-box end' : 'flow-box');
    flowHtml += `
<div class="flow-node">
  <div class="${cls}" id="fbox-${sk}" onclick="scrollToThumb('${esc(featureId)}','${s.seqNo}')">
    <div class="flow-box-screen-id">${esc(s.screenId)}</div>
    <div class="flow-box-label">${esc(s.summary)}</div>
    <div class="flow-box-sub">${esc(s.opContent.slice(0,18))}</div>
    <div class="flow-node-verdict" id="fv-${sk}"><span style="color:#16a34a;font-size:10px;font-weight:700;">✅ OK</span></div>
  </div>
  <div class="flow-node-seq">seq ${s.seqNo}</div>
</div>`;
    if (i<seqs.length-1) {
      const next = seqs[i+1];
      const lb = (next.target&&next.target!=='—' ? next.target : next.summary).slice(0,14);
      flowHtml += `
<div class="flow-arrow" id="farrow-${sk}">
  <div class="flow-arrow-label" id="falbl-${sk}">${esc(lb)}</div>
  <div class="flow-arrow-line"></div>
</div>`;
    }
  }

  // サムネグリッド
  let thumbHtml = '';
  for (const s of seqs) {
    const sk = esc(featureId+'_seq'+s.seqNo);
    const ss = s.shots[0];
    const imgHtml = ss
      ? `<img src="../screenshots/${esc(ss.fid)}/${esc(ss.fname)}" alt="seq${s.seqNo}"
              style="width:100%;display:block;object-fit:cover;max-height:120px;"
              onerror="this.parentElement.innerHTML='<div class=\\'ss-placeholder\\'>📷 ${esc(ss.fname.slice(0,20))}...</div>'">`
      : `<div class="ss-placeholder">📷 seq${s.seqNo}.png</div>`;
    thumbHtml += `
<div class="thumb-card${s.autoNG?' is-ng':''}" id="thumb-${sk}"
     onclick="showPage('${esc(featureId)}');setTimeout(function(){scrollToActionLog('${esc(featureId)}',${s.seqNo});},300);">
  <div class="thumb-img-area">
    <div class="thumb-seq-badge">seq ${s.seqNo}</div>
    ${imgHtml}
  </div>
  <div class="thumb-info">
    <div class="thumb-screen-id">${esc(s.screenId)}</div>
    <div class="thumb-title">${esc(s.summary)}</div>
    <div class="thumb-action">
      操作: <span>${esc(s.opContent.slice(0,20))}</span>
      &nbsp;
      <span id="tv-${sk}">${s.autoNG
        ?'<span style="color:#dc2626;font-weight:700;">❌ NG</span>'
        :'<span style="color:#16a34a;font-weight:700;">✅ OK</span>'
      }</span>
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
    <div class="flow-legend">
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#16a34a;background:#f0fdf4;"></div>開始画面
      </div>
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#3b82f6;background:white;"></div>通常画面
      </div>
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#dc2626;background:#fff5f5;"></div>終端画面
      </div>
      <div class="flow-legend-item">
        <div class="flow-legend-box" style="border-color:#7c3aed;border-style:dashed;background:#faf5ff;"></div>モーダル・ダイアログ
      </div>
      <div class="flow-legend-item">
        <div style="width:28px;height:2px;background:#16a34a;position:relative;margin-top:6px;">
          <div style="position:absolute;right:-1px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left-color:#16a34a;"></div>
        </div>
        <span style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:3px;padding:1px 5px;font-size:10px;color:#16a34a;margin-left:4px;">OK遷移</span>
      </div>
      <div class="flow-legend-item">
        <div style="width:28px;height:2px;background:#94a3b8;position:relative;margin-top:6px;">
          <div style="position:absolute;right:-1px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left-color:#94a3b8;"></div>
        </div>
        <span style="background:#fff5f5;border:1px solid #fecaca;border-radius:3px;padding:1px 5px;font-size:10px;color:#dc2626;margin-left:4px;">NG / 通常</span>
      </div>
      <div style="margin-left:auto;font-size:11px;color:#94a3b8;">※ ボックスをクリックするとアクションレビューにジャンプします</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">スクリーンショット一覧</div>
    <div class="thumb-grid">${thumbHtml}</div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// 画面ページ
// ─────────────────────────────────────────────────────────────
function renderScreenPage(fid, entries, shots, issuesData) {
  const name = SCREEN_NAME_MAP[fid]||fid;
  const fi   = (issuesData.issues||[]).filter(i=>i.featureId===fid);
  const seqs = buildSequences(entries, shots, fi);
  const firstTs = entries.length ? fmtTs(entries[0].ts) : '';

  const actHtml = seqs.length===0
    ? '<p style="color:#94a3b8;font-size:13px;">ログが存在しません。</p>'
    : seqs.map(renderActionLog).join('');

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
            <td>${entries.length}件 / ${seqs.length}シーケンス / スクショ${(shots||[]).length}枚</td></tr>
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
// サイドバー
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
// ダッシュボード
// ─────────────────────────────────────────────────────────────
function renderDashboard(fids, allLogs, allShots, issuesData) {
  const rows = fids.map(fid => {
    const n    = SCREEN_NAME_MAP[fid]||fid;
    const seqs = buildSequences(allLogs[fid]||[], allShots[fid]||[],
                   (issuesData.issues||[]).filter(i=>i.featureId===fid));
    return `<tr>
  <td class="mono" style="font-size:11px;">${esc(fid)}</td>
  <td><span onclick="showPage('${esc(fid)}')" style="color:#2563eb;cursor:pointer;text-decoration:underline;">${esc(n)}</span></td>
  <td><span class="badge badge-warn" id="db-badge-${esc(fid)}">🟡 確認中</span></td>
  <td id="db-ngc-${esc(fid)}">—</td>
  <td>${(allLogs[fid]||[]).length}件 / ${seqs.length}seq</td>
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
// 課題一覧ページ（動的）
// ─────────────────────────────────────────────────────────────
function renderIssuesPage() {
  return `
<div id="issues" class="page">
  <div style="margin-bottom:22px;">
    <h1 style="font-size:21px;font-weight:700;color:#0f172a;">🐛 課題一覧</h1>
    <p style="font-size:13px;color:#64748b;margin-top:4px;">全画面の不具合・仕様不足 — NGシーケンスを自動集約</p>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
    <select class="issue-filter-sel" id="fi-type"   onchange="renderIssueTable()">
      <option value="">種別: すべて</option>
      <option value="不具合">🐛 不具合</option>
      <option value="仕様違い">📐 仕様違い</option>
      <option value="改善提案">💡 改善提案</option>
      <option value="未確認">❓ 未確認</option>
      <option value="その他">📌 その他</option>
    </select>
    <select class="issue-filter-sel" id="fi-status" onchange="renderIssueTable()">
      <option value="">状態: すべて</option>
      <option value="未対応">⏸ 未対応</option>
      <option value="対応中">🔄 対応中</option>
      <option value="対応済">✅ 対応済</option>
      <option value="クローズ">🔒 クローズ</option>
    </select>
    <select class="issue-filter-sel" id="fi-prio"   onchange="renderIssueTable()">
      <option value="">優先度: すべて</option>
      <option value="高">🔴 高</option>
      <option value="中">🟡 中</option>
      <option value="低">🟢 低</option>
    </select>
    <span id="iss-cnt" style="font-size:12px;color:#64748b;"></span>
  </div>
  <div class="card" style="padding:0;overflow:hidden;">
    <table class="spec-table" id="iss-table">
      <thead><tr>
        <th style="width:50px;">No.</th>
        <th style="width:90px;">種別</th>
        <th>screenId / seq</th>
        <th>内容</th>
        <th style="width:70px;">優先度</th>
        <th style="width:90px;">状態</th>
        <th style="width:130px;">操作</th>
      </tr></thead>
      <tbody id="iss-tbody">
        <tr><td colspan="7" style="color:#94a3b8;text-align:center;padding:32px;">
          課題なし — NGシーケンスが発生すると自動で表示されます
        </td></tr>
      </tbody>
    </table>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// インタラクティブJS（埋め込み用）
// NOTE: 内部のテンプレートリテラルは \` でエスケープ
// ─────────────────────────────────────────────────────────────
function renderScript(fids, allLogs, allShots, issuesData) {
  // 全シーケンスメタ情報をJSONで埋め込む
  const meta = {};
  for (const fid of fids) {
    const fi   = (issuesData.issues||[]).filter(i=>i.featureId===fid);
    const seqs = buildSequences(allLogs[fid]||[], allShots[fid]||[], fi);
    for (const s of seqs) {
      const k = fid+'_seq'+s.seqNo;
      meta[k] = { fid, seqNo:s.seqNo, screenId:s.screenId, summary:s.summary, ts:s.ts, autoNG:s.autoNG };
    }
  }
  const metaJson = JSON.stringify(meta);
  const fidsJson = JSON.stringify(fids);

  // ※ renderScript 内では文字列連結でJSコードを組み立て、
  //   内部のバッククォートは \` で記述
  const jsCode = [
    '// =========================================================',
    '// 画面レビュー インタラクティブ制御',
    '// =========================================================',
    'var META  = ' + metaJson + ';',
    'var FIDS  = ' + fidsJson + ';',
    'var LSP   = "rev2_";',
    '',
    '// localStorage ラッパー',
    'function lsg(k){try{return JSON.parse(localStorage.getItem(LSP+k))||{};}catch{return {};}}',
    'function lss(k,d){try{localStorage.setItem(LSP+k,JSON.stringify(d));}catch{}}',
    '',
    '// 初期化',
    'document.addEventListener("DOMContentLoaded",function(){',
    '  var today=new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"});',
    '  document.getElementById("sidebar-date").textContent=today+" 更新";',
    '  var dd=document.getElementById("dash-date");if(dd)dd.textContent=today+" 時点";',
    '  Object.keys(META).forEach(function(k){restoreVerdict(k);});',
    '  updateDashboard();',
    '  showPage("dashboard");',
    '});',
    '',
    '// OK/NG トグル',
    'function toggleVerdict(k){',
    '  var saved=lsg(k);',
    '  var m=META[k]||{};',
    '  var curNG=saved.verdict?saved.verdict==="NG":m.autoNG;',
    '  var nv=curNG?"OK":"NG";',
    '  saved.verdict=nv;lss(k,saved);',
    '  applyVerdict(k,nv);',
    '  updateDashboard();',
    '  renderIssueTable();',
    '}',
    '',
    'function applyVerdict(k,v){',
    '  var ng=v==="NG";',
    '  var tog=document.getElementById("vtog-"+k);',
    '  var lbl=document.getElementById("vlbl-"+k);',
    '  var frm=document.getElementById("iform-"+k);',
    '  var none=document.getElementById("issue-none-"+k);',
    '  var al=document.getElementById("al-"+k);',
    '  var fbox=document.getElementById("fbox-"+k);',
    '  var fv=document.getElementById("fv-"+k);',
    '  var falbl=document.getElementById("falbl-"+k);',
    '  var tv=document.getElementById("tv-"+k);',
    '  var tc=document.getElementById("thumb-"+k);',
    '  if(tog){tog.className=ng?"toggle toggle-off":"toggle toggle-on";}',
    '  if(lbl){lbl.textContent=ng?"NG":"OK";lbl.className=ng?"verdict-text-ng":"verdict-text-ok";}',
    '  if(frm){frm.classList[ng?"add":"remove"]("open");}',
    '  if(none){none.style.display=ng?"none":"block";}',
    '  if(al){al.classList[ng?"add":"remove"]("is-ng");}',
    '  if(fbox){fbox.classList[ng?"add":"remove"]("is-ng");}',
    '  if(fv){fv.innerHTML=ng',
    '    ?"<span style=\'color:#dc2626;font-size:10px;font-weight:700;\'>&#10060; NG</span>"',
    '    :"<span style=\'color:#16a34a;font-size:10px;font-weight:700;\'>&#10003; OK</span>";}',
    '  if(falbl){falbl.className=ng?"flow-arrow-label ng":"flow-arrow-label";}',
    '  if(tv){tv.innerHTML=ng',
    '    ?"<span style=\'color:#dc2626;font-weight:700;\'>&#10060; NG</span>"',
    '    :"<span style=\'color:#16a34a;font-weight:700;\'>&#10003; OK</span>";}',
    '  if(tc){tc.classList[ng?"add":"remove"]("is-ng");}',
    '}',
    '',
    'function restoreVerdict(k){',
    '  var s=lsg(k);var m=META[k]||{};',
    '  var v=s.verdict||(m.autoNG?"NG":"OK");',
    '  applyVerdict(k,v);',
    '  if(v==="NG"){',
    '    var el;',
    '    el=document.getElementById("ift-"+k);if(el&&s.issueType)el.value=s.issueType;',
    '    el=document.getElementById("ifp-"+k);if(el&&s.priority)el.value=s.priority;',
    '    el=document.getElementById("ifs-"+k);if(el&&s.status)el.value=s.status;',
    '    el=document.getElementById("ifc-"+k);if(el&&s.content)el.value=s.content;',
    '    el=document.getElementById("ifm-"+k);if(el&&s.memo)el.value=s.memo;',
    '  }',
    '}',
    '',
    '// 課題フォーム保存',
    'function saveIssue(k){',
    '  var s=lsg(k);',
    '  var g=function(id){var el=document.getElementById(id);return el?el.value:"";};',
    '  s.issueType=g("ift-"+k)||"未確認";',
    '  s.priority =g("ifp-"+k)||"中";',
    '  s.status   =g("ifs-"+k)||"未対応";',
    '  s.content  =g("ifc-"+k);',
    '  s.memo     =g("ifm-"+k);',
    '  s.updatedAt=new Date().toISOString();',
    '  lss(k,s);',
    '  renderIssueTable();',
    '}',
    '',
    '// 課題一覧テーブル',
    'function renderIssueTable(){',
    '  var tbody=document.getElementById("iss-tbody");if(!tbody)return;',
    '  var ft=function(id){var el=document.getElementById(id);return el?el.value:"";};',
    '  var ftType=ft("fi-type"),ftStat=ft("fi-status"),ftPrio=ft("fi-prio");',
    '  var PC={"高":"#dc2626","中":"#d97706","低":"#16a34a"};',
    '  var SB={"未対応":"background:#fee2e2;color:#991b1b",',
    '          "対応中":"background:#fef3c7;color:#92400e",',
    '          "対応済":"background:#dcfce7;color:#166534",',
    '          "クローズ":"background:#f1f5f9;color:#475569"};',
    '  var rows=[],no=1;',
    '  Object.keys(META).forEach(function(k){',
    '    var s=lsg(k);var m=META[k]||{};',
    '    var v=s.verdict||(m.autoNG?"NG":"OK");',
    '    if(v!=="NG")return;',
    '    var tp=s.issueType||"未確認",pr=s.priority||"中",st=s.status||"未対応",ct=s.content||"",me=s.memo||"";',
    '    if(ftType&&tp!==ftType)return;',
    '    if(ftStat&&st!==ftStat)return;',
    '    if(ftPrio&&pr!==ftPrio)return;',
    '    var opts=["未対応","対応中","対応済","クローズ"].map(function(o){',
    '      return "<option value=\'"+o+"\'"+（o===st?" selected":""）+">"+o+"</option>";',
    '    }).join("");',
    '    rows.push("<tr style=\'border-left:3px solid #ef4444;\'>"',
    '      +"<td style=\'text-align:center;font-weight:700;color:#dc2626;\'>"+（no++）+"</td>"',
    '      +"<td style=\'font-size:12px;\'>"+tp+"</td>"',
    '      +"<td><div class=\'mono\' style=\'font-size:10px;color:#94a3b8;\'>"+m.screenId+"</div>"',
    '          +"<div style=\'font-size:11px;\'>seq"+m.seqNo+" — "+m.summary+"</div></td>"',
    '      +"<td style=\'font-size:13px;\'>"+（ct||"<span style=\'color:#94a3b8;\'>(未入力)</span>"）+"</td>"',
    '      +"<td style=\'text-align:center;font-weight:700;color:"+(PC[pr]||"#334155")+";\'>"+pr+"</td>"',
    '      +"<td><span style=\'display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;"+(SB[st]||"")+"\'>"',
    '          +st+"</span></td>"',
    '      +"<td>"',
    '      +"<button onclick=\'showPage(\\""+m.fid+"\\");setTimeout(function(){scrollToActionLog(\\""+m.fid+"\\","+m.seqNo+");},300);\'"',
    '      +" style=\'font-size:11px;padding:3px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;cursor:pointer;color:#1d4ed8;margin-right:4px;\'>詳細</button>"',
    '      +"<select onchange=\'updateIssueStatus(\\""+k+"\\",this.value)\' style=\'font-size:11px;padding:2px;border:1px solid #e2e8f0;border-radius:4px;cursor:pointer;\'>"+opts+"</select>"',
    '      +"</td></tr>");',
    '  });',
    '  var cnt=document.getElementById("iss-cnt");if(cnt)cnt.textContent=（no-1）+"件";',
    '  tbody.innerHTML=rows.length?rows.join("")',
    '    :"<tr><td colspan=\'7\' style=\'color:#94a3b8;text-align:center;padding:32px;\'>課題なし</td></tr>";',
    '}',
    '',
    'function updateIssueStatus(k,v){',
    '  var s=lsg(k);s.status=v;s.updatedAt=new Date().toISOString();lss(k,s);',
    '  renderIssueTable();',
    '}',
    '',
    '// ダッシュボード更新',
    'function updateDashboard(){',
    '  var ok=0,ng=0,pend=0;',
    '  FIDS.forEach(function(fid){',
    '    var keys=Object.keys(META).filter(function(k){return META[k].fid===fid;});',
    '    if(!keys.length){pend++;return;}',
    '    var hasNG=keys.some(function(k){',
    '      var s=lsg(k);return(s.verdict||(META[k].autoNG?"NG":"OK"))==="NG";',
    '    });',
    '    if(hasNG)ng++;else ok++;',
    '    var ngC=keys.filter(function(k){',
    '      var s=lsg(k);return(s.verdict||(META[k].autoNG?"NG":"OK"))==="NG";',
    '    }).length;',
    '    var ngEl=document.getElementById("db-ngc-"+fid);',
    '    if(ngEl)ngEl.textContent=ngC>0?ngC+"件":"—";',
    '    var bdEl=document.getElementById("db-badge-"+fid);',
    '    var nIcon=document.getElementById("nicon-"+fid);',
    '    var sbEl=document.getElementById("sbadge-"+fid);',
    '    if(ngC>0){',
    '      if(bdEl){bdEl.textContent="🔴 課題あり";bdEl.className="badge badge-ng";}',
    '      if(nIcon)nIcon.textContent="🔴";',
    '      if(sbEl){sbEl.textContent="🔴 課題あり";sbEl.className="badge badge-ng";}',
    '    }else{',
    '      if(bdEl){bdEl.textContent="✅ 確認済";bdEl.className="badge badge-ok";}',
    '      if(nIcon)nIcon.textContent="✅";',
    '      if(sbEl){sbEl.textContent="✅ 確認済";sbEl.className="badge badge-ok";}',
    '    }',
    '  });',
    '  var okEl=document.getElementById("db-ok");if(okEl)okEl.textContent=ok;',
    '  var ngEl2=document.getElementById("db-ng");if(ngEl2)ngEl2.textContent=ng;',
    '  var pEl=document.getElementById("db-pend");if(pEl)pEl.textContent=pend;',
    '}',
    '',
    '// ページ遷移',
    'function showPage(id){',
    '  document.querySelectorAll(".page").forEach(function(el){el.classList.remove("active");});',
    '  var db=document.getElementById("dashboard");if(db)db.style.display="none";',
    '  document.querySelectorAll(".nav-item").forEach(function(el){el.classList.remove("active");});',
    '  if(id==="dashboard"){',
    '    if(db)db.style.display="block";',
    '    updateDashboard();',
    '  }else if(id==="issues"){',
    '    var el=document.getElementById("issues");if(el)el.classList.add("active");',
    '    renderIssueTable();',
    '  }else{',
    '    var el2=document.getElementById(id);if(el2)el2.classList.add("active");',
    '  }',
    '  document.querySelectorAll(".nav-item").forEach(function(el){',
    '    if(el.getAttribute("onclick")==="showPage(\'"+id+"\')")el.classList.add("active");',
    '  });',
    '  window.scrollTo(0,0);',
    '}',
    '',
    '// スクロール',
    'function scrollToActionLog(fid,seqNo){',
    '  var el=document.getElementById("al-"+fid+"_seq"+seqNo);',
    '  if(el){el.scrollIntoView({behavior:"smooth",block:"center"});',
    '    el.style.outline="3px solid #3b82f6";',
    '    setTimeout(function(){el.style.outline="";},2000);}',
    '}',
    'function scrollToThumb(fid,seqNo){',
    '  showPage(fid);',
    '  setTimeout(function(){scrollToActionLog(fid,seqNo);},300);',
    '}',
    '',
    '// スクショモーダル',
    'function openSsModal(src,title){',
    '  var m=document.getElementById("ss-modal");if(!m)return;',
    '  document.getElementById("modal-title").textContent=title||"";',
    '  var ss=document.getElementById("modal-ss");',
    '  ss.innerHTML="<img src=\'"+src+"\' style=\'max-width:100%;border-radius:6px;\' />";',
    '  m.classList.add("open");',
    '}',
    'function closeModal(e){',
    '  var m=document.getElementById("ss-modal");',
    '  if(m&&(!e||e.target===m))m.classList.remove("open");',
    '}',
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModal();});',
  ].join('\n');

  // 全角丸括弧を通常括弧に戻す（テンプレート文字列結合のためのワークアラウンド）
  const cleanJs = jsCode
    .replace(/（/g,'(')
    .replace(/）/g,')');

  return '<script>\n'+cleanJs+'\n<\\/script>';
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
function main() {
  console.log('[REVIEW v2] 生成開始');
  const allLogs  = loadLogs();
  const allShots = loadScreenshots();
  const issData  = loadIssues();
  const fids     = Object.keys(allLogs).sort();
  if (!fids.length) console.log('[WARN] ログファイルなし');

  const screenPages = fids.map(fid =>
    renderScreenPage(fid, allLogs[fid], allShots[fid]||[], issData)
  ).join('\n');

  const flowPages = fids.map(fid => {
    const fi   = (issData.issues||[]).filter(i=>i.featureId===fid);
    const seqs = buildSequences(allLogs[fid]||[], allShots[fid]||[], fi);
    return renderFlowPage(fid, seqs);
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>画面レビュー資料 — Machining System</title>
${renderCSS()}
</head>
<body>

${renderSidebar(fids)}

<div id="main-content">
${renderDashboard(fids, allLogs, allShots, issData)}
${screenPages}
${flowPages}
${renderIssuesPage()}
</div>

<!-- スクショモーダル -->
<div id="ss-modal" class="ss-modal" onclick="closeModal(event)">
  <div class="ss-modal-inner">
    <button class="ss-modal-close" onclick="closeModal()">✕</button>
    <div id="modal-title" style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;"></div>
    <div id="modal-ss" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;min-height:200px;display:flex;align-items:center;justify-content:center;"></div>
  </div>
</div>

${renderScript(fids, allLogs, allShots, issData)}
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive:true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  const kb = (Buffer.byteLength(html,'utf8')/1024).toFixed(1);
  console.log('[REVIEW v2] 完了: '+OUT_FILE+' ('+kb+' KB)');
  console.log('[REVIEW v2] 画面: '+fids.join(', ')||'なし');
}

main();