#!/usr/bin/env node
// apply-patch-v41-fix.js
// generate-review.js v4.0 → v4.1 (修正版)
'use strict';
const fs   = require('fs');
const path = require('path');

const TARGET  = path.join(__dirname, 'generate-review.js');
const BAKFILE = path.join(__dirname, 'generate-review.v4.1.pre.bak.js');

if (!fs.existsSync(TARGET)) { console.error('ERROR: generate-review.js が見つかりません'); process.exit(1); }
fs.copyFileSync(TARGET, BAKFILE);
console.log('[BACKUP]', BAKFILE);

let src = fs.readFileSync(TARGET, 'utf8');

const SERVER_URL       = process.env.SERVER_URL  || 'http://192.168.1.11:3099';
const PROJECT_ID_EMBED = parseInt(process.env.PROJECT_ID || '1', 10);

function safeReplace(label, before, after) {
  const count = src.split(before).length - 1;
  if (count === 0) { console.warn('[SKIP]', label, '— 対象文字列なし'); return false; }
  src = src.replace(before, after);
  console.log('[OK]', label);
  return true;
}

// ── 1. バージョン更新 ─────────────────────────────────────
src = src.replace(/\/\/ scripts\/generate-review\.js\s+v4\.0/, '// scripts/generate-review.js  v4.1');
src = src.replace(/\[generate-review v4\.0\]/g, '[generate-review v4.1]');
console.log('[OK] バージョン v4.1');

// ── 2. SERVER_URL 定数追加（db-loader require の直下）────
safeReplace(
  'SERVER_URL / PROJECT_ID 定数追加',
  "const { prisma } = require('../lib/prisma');",
  "const { prisma } = require('../lib/prisma');\n\n// ── HTML 生成時に埋め込む設定値 ───────────────────────────\nconst SERVER_URL  = process.env.SERVER_URL  || 'http://192.168.1.11:3099';\nconst PROJECT_ID_EMBED = parseInt(process.env.PROJECT_ID || '1', 10);"
);

// ── 3. ヘッダーCSS追加（.ss-modal の直前に挿入）──────────
// 実際のCSSは .ss-modal{ から始まる（line 1009）
safeReplace(
  'ヘッダーCSS追加',
  '.ss-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;align-items:center;justify-content:center;}',
  `/* ===== ヘッダー ===== */
.app-header{position:fixed;top:0;left:0;right:0;height:48px;background:#0f172a;display:flex;align-items:center;padding:0 20px;z-index:200;gap:12px;border-bottom:1px solid #1e293b;}
.app-header .logo{color:#60a5fa;font-weight:700;font-size:15px;letter-spacing:.5px;}
.app-header .project-name{color:#94a3b8;font-size:13px;flex:1;}
.app-header .user-info{display:flex;align-items:center;gap:8px;cursor:pointer;position:relative;}
.app-header .user-badge{background:#1e293b;color:#e2e8f0;border-radius:20px;padding:4px 12px;font-size:12px;display:flex;align-items:center;gap:6px;}
.app-header .user-badge:hover{background:#334155;}
.user-menu{position:absolute;top:36px;right:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:160px;z-index:300;display:none;padding:4px 0;}
.user-menu.open{display:block;}
.user-menu a{display:block;padding:8px 16px;font-size:13px;color:#374151;text-decoration:none;cursor:pointer;}
.user-menu a:hover{background:#f8fafc;}
.user-menu .menu-divider{border-top:1px solid #e2e8f0;margin:4px 0;}
body{padding-top:48px;}
.sidebar{top:48px;height:calc(100vh - 48px);}
/* ===== ログインモーダル ===== */
.login-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;display:flex;align-items:center;justify-content:center;}
.login-box{background:#fff;border-radius:16px;padding:40px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.login-box h2{margin:0 0 24px;font-size:22px;color:#0f172a;text-align:center;}
.login-box label{display:block;font-size:13px;color:#64748b;margin-bottom:4px;}
.login-box input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none;}
.login-box input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1);}
.login-btn{width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px;}
.login-btn:hover{background:#2563eb;}
.login-error{color:#dc2626;font-size:13px;text-align:center;margin-top:8px;min-height:20px;}
/* ===== スクショモーダル ===== */
.ss-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;align-items:center;justify-content:center;}`
);

// ── 4. buildHtml: body直後にヘッダー+ログインモーダル挿入 ─
// ※ テンプレートリテラル内の ${...} を文字列として扱う
const bodyBefore = '${renderSidebar(fids)}\n<div id="main-content">';
const bodyAfter  =
`<!-- アプリヘッダー -->
<header class="app-header">
  <span class="logo">📋 TLog Review</span>
  <span class="project-name" id="hdr-project">読み込み中...</span>
  <div class="user-info" onclick="toggleUserMenu()">
    <div class="user-badge"><span>👤</span><span id="hdr-username">読み込み中...</span></div>
    <div class="user-menu" id="user-menu">
      <a onclick="doLogout()">🚪 ログアウト</a>
    </div>
  </div>
</header>
<!-- ログインモーダル -->
<div class="login-overlay" id="login-overlay" style="display:none">
  <div class="login-box">
    <h2>🔐 TLog レビュー</h2>
    <label>ユーザー名</label>
    <input type="text" id="login-username" placeholder="admin" autocomplete="username" />
    <label>パスワード</label>
    <input type="password" id="login-password" placeholder="パスワード" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()" />
    <button class="login-btn" onclick="doLogin()">ログイン</button>
    <div class="login-error" id="login-error"></div>
  </div>
</div>
\${renderSidebar(fids)}
<div id="main-content">`;

if (src.includes(bodyBefore)) {
  src = src.replace(bodyBefore, bodyAfter);
  console.log('[OK] buildHtml: ヘッダー+ログインモーダル挿入');
} else {
  console.warn('[SKIP] buildHtml body — 対象文字列なし');
}

// ── 5. renderScript: SERVER_URL + API 通信基盤追加 ────────
safeReplace(
  'renderScript: LSP の後に SERVER_URL 追加',
  "'var LSP      = \"rev31_\";',",
  "'var LSP      = \"rev31_\";',\n    'var _SERVER  = \"" + SERVER_URL + "\";',\n    'var _PROJ    = " + PROJECT_ID_EMBED + ";',\n    'var _token   = sessionStorage.getItem(\"tlog_token\")||\"\";',\n    '',"
);

safeReplace(
  'renderScript: lss の後に API ヘルパー追加',
  "'function lss(k,d){try{localStorage.setItem(LSP+k,JSON.stringify(d));}catch(e){}}',",
  [
    "'function lss(k,d){try{localStorage.setItem(LSP+k,JSON.stringify(d));}catch(e){}}',",
    "    '',",
    "    '// ── API ────────────────────────────────────────────────',",
    "    'async function apiFetch(p,o){',",
    "    '  var url=_SERVER+p;',",
    "    '  var h=Object.assign({\"Content-Type\":\"application/json\"},(o&&o.headers)||{});',",
    "    '  if(_token) h[\"Authorization\"]=\"Bearer \"+_token;',",
    "    '  var r=await fetch(url,Object.assign({},o,{headers:h}));',",
    "    '  if(r.status===401){showLogin();return null;}',",
    "    '  return r.ok?r.json():null;',",
    "    '}',",
    "    '',",
    "    '// ── 認証 ────────────────────────────────────────────────',",
    "    'async function doLogin(){',",
    "    '  var u=document.getElementById(\"login-username\").value.trim();',",
    "    '  var pw=document.getElementById(\"login-password\").value;',",
    "    '  document.getElementById(\"login-error\").textContent=\"\";',",
    "    '  if(!u||!pw){document.getElementById(\"login-error\").textContent=\"ユーザー名とパスワードを入力してください\";return;}',",
    "    '  var r=await fetch(_SERVER+\"/api/auth/login\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({username:u,password:pw})});',",
    "    '  var d=await r.json();',",
    "    '  if(!r.ok){document.getElementById(\"login-error\").textContent=d.error||\"ログイン失敗\";return;}',",
    "    '  _token=d.accessToken; sessionStorage.setItem(\"tlog_token\",_token);',",
    "    '  document.getElementById(\"login-overlay\").style.display=\"none\";',",
    "    '  var un=d.user&&(d.user.displayName||d.user.username)||\"\";',",
    "    '  var el=document.getElementById(\"hdr-username\");if(el)el.textContent=un;',",
    "    '  var pn=document.getElementById(\"hdr-project\");if(pn&&d.projects&&d.projects[0])pn.textContent=d.projects[0].name;',",
    "    '  await initAfterLogin();',",
    "    '}',",
    "    'function showLogin(){',",
    "    '  document.getElementById(\"login-overlay\").style.display=\"flex\";',",
    "    '  var el=document.getElementById(\"hdr-username\");if(el)el.textContent=\"未ログイン\";',",
    "    '  setTimeout(function(){var e=document.getElementById(\"login-username\");if(e)e.focus();},100);',",
    "    '}',",
    "    'async function doLogout(){',",
    "    '  if(_token)await apiFetch(\"/api/auth/logout\",{method:\"POST\"}).catch(function(){});',",
    "    '  _token=\"\";sessionStorage.removeItem(\"tlog_token\");showLogin();',",
    "    '}',",
    "    'function toggleUserMenu(){var m=document.getElementById(\"user-menu\");if(m)m.classList.toggle(\"open\");}',",
    "    'document.addEventListener(\"click\",function(e){var m=document.getElementById(\"user-menu\");if(m&&m.classList.contains(\"open\")&&!e.target.closest(\".user-info\"))m.classList.remove(\"open\");});',",
    "    '',",
    "    '// ── 認証チェック + 初期化 ──────────────────────────────',",
    "    'async function checkAuth(){',",
    "    '  if(!_token){showLogin();return false;}',",
    "    '  var me=await apiFetch(\"/api/auth/me\");',",
    "    '  if(!me){showLogin();return false;}',",
    "    '  var un=me.displayName||me.username||\"\";',",
    "    '  var el=document.getElementById(\"hdr-username\");if(el)el.textContent=un;',",
    "    '  var pn=document.getElementById(\"hdr-project\");if(pn&&me.projects&&me.projects[0])pn.textContent=me.projects[0].name;',",
    "    '  return true;',",
    "    '}',",
    "    '',",
    "    '// ── 判定 API 保存 ───────────────────────────────────────',",
    "    'async function saveVerdictToAPI(k,saved){',",
    "    '  if(!_token)return;',",
    "    '  var b={seqKey:k,verdict:saved.verdict||null,issueType:saved.ift||null,issueStatus:saved.ifs||null,issuePrio:saved.ifp||null,issueDesc:saved.ifc||null};',",
    "    '  await apiFetch(\"/api/projects/\"+_PROJ+\"/verdicts\",{method:\"POST\",body:JSON.stringify(b)});',",
    "    '}',",
    "    'async function loadVerdictsFromAPI(){',",
    "    '  var r=await apiFetch(\"/api/projects/\"+_PROJ+\"/verdicts\");',",
    "    '  if(!r||!r.verdicts)return;',",
    "    '  r.verdicts.forEach(function(v){',",
    "    '    var s={verdict:v.verdict,ift:v.issueType,ifs:v.issueStatus,ifp:v.issuePrio,ifc:v.issueDesc};',",
    "    '    lss(v.seqKey,s);applyVerdict(v.seqKey,v.verdict||\"OK\");',",
    "    '  });',",
    "    '}',",
    "    '',"
  ].join('\n')
);

// ── 6. DOMContentLoaded を認証チェック込みに変更 ──────────
safeReplace(
  'DOMContentLoaded: 認証チェック + initAfterLogin',
  [
    "'document.addEventListener(\"DOMContentLoaded\",function(){',",
    "    '  var today=new Date().toLocaleDateString(\"ja-JP\",{year:\"numeric\",month:\"2-digit\",day:\"2-digit\"});',",
    "    '  var s1=document.getElementById(\"sidebar-date\"); if(s1) s1.textContent=today+\" 更新\";',",
    "    '  var s2=document.getElementById(\"dash-date\"); if(s2) s2.textContent=today+\" 時点\";',",
    "    '  Object.keys(META).forEach(function(k){ restoreVerdict(k); });',",
    "    '  updateDashboard();',",
    "    '  showPage(\"timeline\");',",
    "    '});',"
  ].join('\n'),
  [
    "'document.addEventListener(\"DOMContentLoaded\",async function(){',",
    "    '  var today=new Date().toLocaleDateString(\"ja-JP\",{year:\"numeric\",month:\"2-digit\",day:\"2-digit\"});',",
    "    '  var s1=document.getElementById(\"sidebar-date\"); if(s1) s1.textContent=today+\" 更新\";',",
    "    '  var s2=document.getElementById(\"dash-date\"); if(s2) s2.textContent=today+\" 時点\";',",
    "    '  var ok=await checkAuth();',",
    "    '  if(ok) await initAfterLogin();',",
    "    '});',",
    "    '',",
    "    'async function initAfterLogin(){',",
    "    '  Object.keys(META).forEach(function(k){restoreVerdict(k);});',",
    "    '  await loadVerdictsFromAPI();',",
    "    '  updateDashboard();',",
    "    '  showPage(\"timeline\");',",
    "    '}',"
  ].join('\n')
);

// ── 7. toggleVerdict に saveVerdictToAPI 追加 ─────────────
safeReplace(
  'toggleVerdict: API保存',
  "'  saved.verdict=nv;lss(k,saved);',\n    '  applyVerdict(k,nv);',\n    '  updateDashboard();',\n    '  renderIssueTable();',\n    '}',",
  "'  saved.verdict=nv;lss(k,saved);',\n    '  applyVerdict(k,nv);',\n    '  updateDashboard();',\n    '  renderIssueTable();',\n    '  saveVerdictToAPI(k,saved);',\n    '}',"
);

// ── 8. 書き込み + 構文チェック ────────────────────────────
fs.writeFileSync(TARGET, src, 'utf8');
console.log('[OK] ファイル書き込み完了');

const { execSync } = require('child_process');
try {
  execSync('node --check ' + TARGET, { stdio: 'pipe' });
  console.log('[OK] 構文チェック通過');
} catch (e) {
  console.error('[ERROR] 構文エラー:\n', e.stderr?.toString());
  fs.copyFileSync(BAKFILE, TARGET);
  console.error('[ROLLBACK] 元のファイルに戻しました');
  process.exit(1);
}

console.log('\n✅ generate-review.js v4.1 パッチ完了');
console.log('   次: node scripts/generate-review.js');
