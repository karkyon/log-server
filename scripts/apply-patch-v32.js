#!/usr/bin/env node
// ============================================================
//  apply-patch-v32.js
//  generate-review.js v3.1 → v3.2 パッチ適用スクリプト
//
//  対象課題: I-02, I-03, I-06, I-08
//
//  使用方法:
//    cd ~/projects/log-server/scripts
//    node apply-patch-v32.js
//
//  ※ 実行前にバックアップを作成してください:
//    cp generate-review.js generate-review.v3.1.bak.js
// ============================================================

'use strict';
const fs   = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'generate-review.js');

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: generate-review.js が見つかりません:', TARGET);
  process.exit(1);
}

// バックアップ
const bakPath = TARGET.replace('.js', '.v3.1.bak.js');
if (!fs.existsSync(bakPath)) {
  fs.copyFileSync(TARGET, bakPath);
  console.log('[BACKUP]', bakPath);
}

let src = fs.readFileSync(TARGET, 'utf8');
let changed = 0;

// ────────────────────────────────────────────────────────────
//  ヘルパー: 安全な文字列置換（1件マッチのみ許可）
// ────────────────────────────────────────────────────────────
function safeReplace(label, before, after) {
  const count = (src.split(before).length - 1);
  if (count === 0) {
    console.warn(`[SKIP] ${label}: 対象文字列が見つかりません（既適用 or 差異あり）`);
    return false;
  }
  if (count > 1) {
    console.warn(`[WARN] ${label}: 対象文字列が ${count} 箇所見つかりました。先頭のみ置換します`);
  }
  src = src.replace(before, after);
  console.log(`[OK]   ${label}`);
  changed++;
  return true;
}

// ────────────────────────────────────────────────────────────
//  I-08: 画面モードに「認証」「帳票出力」を追加
//  対象: renderWorkPatternsPage() 内の wpt-mode select
// ────────────────────────────────────────────────────────────
safeReplace(
  'I-08: 認証・帳票出力 option 追加',

  // BEFORE (現在の select options)
  `<option value="閲覧">閲覧</option>
      <option value="編集">編集</option>
      <option value="新規">新規</option>
      <option value="混在">混在</option>
      <option value="その他">その他</option>`,

  // AFTER (認証・帳票出力 を追加)
  `<option value="閲覧">閲覧</option>
      <option value="編集">編集</option>
      <option value="新規">新規</option>
      <option value="認証">🔐 認証</option>
      <option value="帳票出力">🖨 帳票出力</option>
      <option value="混在">混在</option>
      <option value="その他">その他</option>`
);

// ────────────────────────────────────────────────────────────
//  I-03: フィルターボタン SyntaxError 修正
//  renderTlFilterBtns() の onclick 引数エスケープを修正
//
//  v3.1 では data-fid + this.dataset.fid に変更済みのため
//  古いパターンがある場合のみ置換
// ────────────────────────────────────────────────────────────

// パターンA: v3.0形式 (シングルクォート文字列結合でfidを渡す)
// 'onclick="tlFilterFid(\'"+fid+"\')"`
safeReplace(
  'I-03: tlFilterFid onclick をイベント委譲に変更 (パターンA v3.0形式)',
  `onclick="tlFilterFid(\\'"+fid+"\\')"`,
  `onclick="tlFilterFid(this.dataset.fid)"`
);

// パターンB: 文字列リテラル中 (renderScript lines 配列内)
safeReplace(
  'I-03: tlFilterFid onclick をイベント委譲に変更 (パターンB lines配列形式)',
  `'onclick="tlFilterFid(\\\'"+fid+"\\\')"`,
  `'onclick="tlFilterFid(this.dataset.fid)"`
);

// ────────────────────────────────────────────────────────────
//  I-02: 編集・削除ボタンのonclick → data-id + イベント委譲
//  renderPatternList() の button 生成部分を修正
//
//  【修正前】
//    onclick="openPatternModal('"+p.id+"')"
//    onclick="deletePattern('"+p.id+"')"
//
//  【修正後】
//    data-id="...p.id..." data-action="edit"
//    data-id="...p.id..." data-action="delete"
//    + initPatternArea() でイベント委譲を設定
// ────────────────────────────────────────────────────────────

// v3.1 の lines 配列内での修正（文字列リテラル形式）
// ──────────────────────────────
// 編集ボタン修正
safeReplace(
  'I-02: openPatternModal onclick → data-id + data-action=edit',
  // v3.1 generate-review.js に含まれる形式
  `'    <button onclick="openPatternModal(\\''+p.id+'\\'"`,
  `'    <button data-id="\'+escH(p.id)+\'" data-action="edit"'`
);

// 削除ボタン修正
safeReplace(
  'I-02: deletePattern onclick → data-id + data-action=delete',
  `'    <button onclick="deletePattern(\\''+p.id+'\\'"`,
  `'    <button data-id="\'+escH(p.id)+\'" data-action="delete"'`
);

// renderScript() のスクリプト末尾に initPatternArea を追加
// (DOMContentLoaded 後にイベント委譲を設定する)
const INIT_PATTERN_AREA_CODE = `
// ── I-02 修正: パターン一覧 イベント委譲 ──────────────────────
function initPatternArea(){
  var area=document.getElementById("pattern-list-area");
  if(!area||area._delegated) return;
  area._delegated=true;
  area.addEventListener("click",function(e){
    var btn=e.target.closest("button[data-action]");
    if(!btn) return;
    var id=btn.dataset.id;
    var action=btn.dataset.action;
    if(action==="edit") openPatternModal(id);
    if(action==="delete") deletePattern(id);
  });
}
document.addEventListener("DOMContentLoaded",initPatternArea);
`;

// renderScript の末尾付近に追加（document.addEventListener("DOMContentLoaded",renderIssueTable) の後）
safeReplace(
  'I-02: initPatternArea() をrenderScript末尾に追加',
  `'document.addEventListener("DOMContentLoaded",renderIssueTable);',`,
  `'document.addEventListener("DOMContentLoaded",renderIssueTable);',
  // I-02: initPatternArea - イベント委譲セットアップ
  'function initPatternArea(){',
  '  var area=document.getElementById("pattern-list-area");',
  '  if(!area||area._delegated) return;',
  '  area._delegated=true;',
  '  area.addEventListener("click",function(e){',
  '    var btn=e.target.closest("button[data-action]");',
  '    if(!btn) return;',
  '    var id=btn.dataset.id;',
  '    var action=btn.dataset.action;',
  '    if(action==="edit") openPatternModal(id);',
  '    if(action==="delete") deletePattern(id);',
  '  });',
  '}',
  'document.addEventListener("DOMContentLoaded",initPatternArea);',`
);

// ────────────────────────────────────────────────────────────
//  I-06: 課題一覧から各課題の編集
//  renderIssuesPage() にモーダルHTMLを追加
//  renderScript()  に openIssueEditModal / saveIssueEdit / closeIssueEditModal を追加
// ────────────────────────────────────────────────────────────

// 課題編集モーダル HTML を renderIssuesPage() の末尾 </div> 直前に挿入
safeReplace(
  'I-06: 課題編集モーダルHTML を renderIssuesPage に追加',
  `  <div id="iss-table-area"><div class="card" style="color:#94a3b8;text-align:center;padding:32px;">確認中...</div></div>
</div>
\`; // renderIssuesPage 終端`,
  `  <div id="iss-table-area"><div class="card" style="color:#94a3b8;text-align:center;padding:32px;">確認中...</div></div>
</div>

<!-- 課題編集モーダル (I-06) -->
<div id="iss-edit-modal"
  style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;">
  <div style="background:white;border-radius:12px;padding:28px;width:90%;max-width:520px;box-shadow:0 8px 32px rgba(0,0,0,.2);">
    <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:18px;">✏️ 課題編集</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <label style="font-size:12px;font-weight:600;color:#64748b;">タイトル
        <input id="iem-title" type="text"
          style="display:block;width:100%;margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"/>
      </label>
      <div style="display:flex;gap:12px;">
        <label style="font-size:12px;font-weight:600;color:#64748b;flex:1;">種別
          <select id="iem-type"
            style="display:block;width:100%;margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;">
            <option value="不具合">🐛 不具合</option>
            <option value="仕様違い">📐 仕様違い</option>
            <option value="改善提案">💡 改善提案</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;color:#64748b;flex:1;">状態
          <select id="iem-status"
            style="display:block;width:100%;margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;">
            <option value="未対応">⏸ 未対応</option>
            <option value="対応中">🔄 対応中</option>
            <option value="対応済">✅ 対応済</option>
          </select>
        </label>
        <label style="font-size:12px;font-weight:600;color:#64748b;flex:1;">優先度
          <select id="iem-prio"
            style="display:block;width:100%;margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;">
            <option value="高">🔴 高</option>
            <option value="中">🟡 中</option>
            <option value="低">🟢 低</option>
          </select>
        </label>
      </div>
      <label style="font-size:12px;font-weight:600;color:#64748b;">内容・詳細
        <textarea id="iem-desc" rows="4"
          style="display:block;width:100%;margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;resize:vertical;"></textarea>
      </label>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
      <button onclick="closeIssueEditModal()"
        style="padding:8px 20px;border-radius:8px;border:1px solid #cbd5e1;background:white;cursor:pointer;font-size:13px;">
        キャンセル
      </button>
      <button onclick="saveIssueEdit()"
        style="padding:8px 20px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:13px;font-weight:700;">
        💾 保存
      </button>
    </div>
  </div>
</div>
\`; // renderIssuesPage 終端`
);

// renderScript() に課題編集モーダルJS関数を追加
safeReplace(
  'I-06: 課題編集モーダルJS (openIssueEditModal/saveIssueEdit/closeIssueEditModal) を追加',
  `'document.addEventListener("DOMContentLoaded",renderIssueTable);',`,
  `'document.addEventListener("DOMContentLoaded",renderIssueTable);',
  '',
  '// ── I-06: 課題編集モーダル ───────────────────────────────',
  'var _issEditId=null;',
  'function loadIssueMemo(){ try{ return JSON.parse(localStorage.getItem("tlog_iss_memo")||"{}"); }catch(e){return {};} }',
  'function saveIssueMemo(o){ try{ localStorage.setItem("tlog_iss_memo",JSON.stringify(o)); }catch(e){} }',
  'function openIssueEditModal(issId){',
  '  _issEditId=issId;',
  '  var memo=loadIssueMemo()[issId]||{};',
  '  var m=document.getElementById("iss-edit-modal"); if(!m) return;',
  '  document.getElementById("iem-title").value=memo.title||issId;',
  '  document.getElementById("iem-type").value=memo.type||"不具合";',
  '  document.getElementById("iem-status").value=memo.status||"未対応";',
  '  document.getElementById("iem-prio").value=memo.priority||"中";',
  '  document.getElementById("iem-desc").value=memo.description||"";',
  '  m.style.display="flex";',
  '}',
  'function closeIssueEditModal(){',
  '  var m=document.getElementById("iss-edit-modal"); if(m) m.style.display="none";',
  '  _issEditId=null;',
  '}',
  'function saveIssueEdit(){',
  '  if(!_issEditId) return;',
  '  var memo=loadIssueMemo();',
  '  memo[_issEditId]={',
  '    title: document.getElementById("iem-title").value,',
  '    type:  document.getElementById("iem-type").value,',
  '    status:document.getElementById("iem-status").value,',
  '    priority:document.getElementById("iem-prio").value,',
  '    description:document.getElementById("iem-desc").value,',
  '    updatedAt:new Date().toISOString()',
  '  };',
  '  saveIssueMemo(memo);',
  '  closeIssueEditModal();',
  '  renderIssueTable();',
  '}',
  '// I-06: 課題一覧テーブルにイベント委譲（編集ボタン）',
  'document.addEventListener("DOMContentLoaded",function(){',
  '  var ta=document.getElementById("iss-table-area");',
  '  if(!ta||ta._iss_delegated) return;',
  '  ta._iss_delegated=true;',
  '  ta.addEventListener("click",function(e){',
  '    var btn=e.target.closest("button[data-action=\\"iss-edit\\"]");',
  '    if(!btn) return;',
  '    openIssueEditModal(btn.dataset.issId);',
  '  });',
  '});',`
);

// ────────────────────────────────────────────────────────────
//  結果出力
// ────────────────────────────────────────────────────────────
if (changed > 0) {
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log(`\n✅ パッチ完了: ${changed} 箇所を適用しました`);
  console.log('次のステップ:');
  console.log('  node scripts/generate-review.js');
  console.log('  → docs/review/index.html が再生成されます');
} else {
  console.log('\n⚠️  変更なし: 全項目が既適用か、パターン不一致です');
  console.log('   generate-review.js の該当箇所を手動で確認してください');
  console.log('   詳細は PATCH_MANUAL.md を参照');
}
