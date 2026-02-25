#!/usr/bin/env node
/* =============================================================================
   scripts/generate-dashboard.js  v2.0
   変更履歴:
     v1.0 - 初版（Section 1〜6: サマリー・ヒートマップ・カテゴリ・問題一覧・ルール説明・スコア算出式）
     v2.0 - [新機能] 課題行クリックで BEFORE/AFTER スクショプレビュー展開
            [新機能] 操作文脈（contextSummary）を問題一覧に表示
            [新機能] 画像拡大モーダル
            [新機能] R11 対応（カテゴリアイコン・ルール一覧カード追加）
            [維持]  Section 5「検出ルール一覧」R01〜R11
            [維持]  Section 6「優先度スコア算出式」
   入力:  docs/issues/issues.json
   出力:  docs/issues/index.html
   =============================================================================*/

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'docs', 'issues', 'issues.json');
const OUT_FILE  = path.join(ROOT, 'docs', 'issues', 'index.html');

// ─── 重大度スタイル定義 ───────────────────────────────────────────────────────
const SEVERITY_STYLE = {
  Critical : { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    dot: 'bg-red-500',    label: 'Critical' },
  High     : { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500', label: 'High'     },
  Medium   : { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300',  dot: 'bg-amber-400',  label: 'Medium'   },
  Low      : { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300',   dot: 'bg-gray-400',   label: 'Low'      }
};

// ─── 難易度スタイル定義 ───────────────────────────────────────────────────────
const DIFFICULTY_STYLE = {
  High   : { bg: 'bg-rose-50',  text: 'text-rose-600',  label: '難 High'   },
  Medium : { bg: 'bg-sky-50',   text: 'text-sky-600',   label: '中 Medium' },
  Low    : { bg: 'bg-teal-50',  text: 'text-teal-600',  label: '易 Low'    }
};

// ─── カテゴリアイコン（R11追加）──────────────────────────────────────────────
const CATEGORY_ICON = {
  ERROR              : '🔴',
  UNKNOWN_FEATURE    : '🟡',
  DUPLICATE_BIND     : '🔁',
  SEARCH_UNAVAILABLE : '🔍',
  API_NOT_CALLED     : '📡',
  RAPID_BACK         : '⏩',
  DUPLICATE_LOAD     : '🔄',
  BACKEND_FAILURE    : '💥',
  FORM_RESIDUAL      : '📝',
  LOW_LOG_COVERAGE   : '📊',
  NO_SCREEN_MODE     : '⚙️'
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }); }
  catch { return iso; }
}

function scoreBar(score) {
  const pct   = Math.min(100, score);
  const color = pct >= 80 ? '#ef4444' : pct >= 60 ? '#f97316' : pct >= 40 ? '#f59e0b' : '#9ca3af';
  return `<div class="flex items-center gap-2">
    <div class="flex-1 bg-gray-100 rounded-full h-1.5">
      <div class="h-1.5 rounded-full" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="text-xs font-mono font-bold" style="color:${color}">${score}</span>
  </div>`;
}

// =============================================================================
//   Section 2: ヒートマップ
// =============================================================================
function buildHeatmap(featureStats) {
  const sorted = Object.values(featureStats).sort((a, b) => b.issueCount - a.issueCount);

  function heatColor(count) {
    if (count === 0) return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' };
    if (count <= 2)  return { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   };
    if (count <= 5)  return { bg: 'bg-orange-100', border: 'border-orange-300',  text: 'text-orange-800'  };
    return                 { bg: 'bg-red-100',    border: 'border-red-300',     text: 'text-red-800'     };
  }

  const maxBar = sorted[0]?.issueCount || 1;
  const cards  = sorted.map(f => {
    const c      = heatColor(f.issueCount);
    const barPct = Math.round((f.issueCount / maxBar) * 100);
    return `
    <div class="rounded-xl border ${c.border} ${c.bg} p-4">
      <div class="flex items-start justify-between mb-2">
        <div>
          <p class="text-xs font-mono text-gray-400">${esc(f.featureId)}</p>
          <p class="text-sm font-semibold text-gray-800 mt-0.5">${esc(f.screenName)}</p>
        </div>
        <span class="text-xl font-bold ${c.text}">${f.issueCount}</span>
      </div>
      <div class="bg-white bg-opacity-60 rounded-full h-1.5 mt-2">
        <div class="h-1.5 rounded-full bg-red-400" style="width:${barPct}%"></div>
      </div>
      <div class="flex gap-2 mt-2 text-xs">
        ${f.critical > 0 ? `<span class="text-red-600 font-semibold">C:${f.critical}</span>` : ''}
        ${f.high     > 0 ? `<span class="text-orange-600">H:${f.high}</span>`                : ''}
        ${f.medium   > 0 ? `<span class="text-amber-600">M:${f.medium}</span>`              : ''}
        ${f.low      > 0 ? `<span class="text-gray-500">L:${f.low}</span>`                  : ''}
        ${f.issueCount === 0 ? '<span class="text-emerald-600 font-medium">問題なし ✓</span>' : ''}
      </div>
    </div>`;
  }).join('');

  return `
  <section class="mb-12">
    <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
      <span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">2</span>
      画面別ヒートマップ
      <span class="text-xs font-normal text-gray-400 ml-2">赤が多いほど問題が集中</span>
    </h2>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">${cards}</div>
  </section>`;
}

// =============================================================================
//   Section 3: カテゴリ別集計
// =============================================================================
function buildCategoryChart(summary) {
  const cats = Object.entries(summary.byCategory || {}).sort((a, b) => b[1] - a[1]);
  if (cats.length === 0) return '';
  const maxCount = cats[0][1];

  const rows = cats.map(([cat, count]) => {
    const icon = CATEGORY_ICON[cat] || '⚠️';
    const pct  = Math.round((count / maxCount) * 100);
    return `
    <div class="flex items-center gap-3 py-2">
      <span class="text-base w-6 text-center">${icon}</span>
      <div class="w-44 text-xs text-gray-600 truncate">${esc(cat)}</div>
      <div class="flex-1 bg-gray-100 rounded-full h-2">
        <div class="h-2 rounded-full bg-indigo-400" style="width:${pct}%"></div>
      </div>
      <span class="text-xs font-bold text-gray-700 w-6 text-right">${count}</span>
    </div>`;
  }).join('');

  return `
  <section class="mb-12">
    <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
      <span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">3</span>
      カテゴリ別 問題分布
    </h2>
    <div class="bg-white rounded-xl border border-gray-100 p-6">${rows}</div>
  </section>`;
}

// =============================================================================
//   Section 4: 問題一覧テーブル（v2.0: スクショプレビュー展開付き）
// =============================================================================

/** スクショプレビューカードを生成 */
function buildScreenshotPanel(issue) {
  const shots = issue.screenshots || [];
  if (shots.length === 0) return '<p class="text-xs text-gray-400 italic">スクリーンショットなし（操作後に自動取得されます）</p>';

  const cards = shots.map(filePath => {
    const fname    = filePath.split('/').pop() || filePath;
    const isBefore = fname.includes('_BEFORE');
    const isAfter  = fname.includes('_AFTER');
    const isError  = fname.includes('JS_ERROR');
    const isLoad   = fname.includes('SCREEN_LOAD');

    const label = isBefore ? '📸 BEFORE — 操作直前'
                : isAfter  ? '📸 AFTER — 操作結果'
                : isError  ? '🔴 JS_ERROR — エラー時'
                : isLoad   ? '🖥 SCREEN_LOAD — 初期表示'
                : `📸 ${fname.slice(0, 40)}`;

    const borderColor = isBefore ? 'border-orange-300' : isAfter ? 'border-red-300' : isError ? 'border-red-500' : 'border-gray-200';
    const headerColor = isBefore ? 'bg-orange-50 text-orange-700' : isAfter ? 'bg-red-50 text-red-700' : isError ? 'bg-red-100 text-red-800' : 'bg-gray-50 text-gray-600';

    // docs/issues/ からの相対パス
    const relPath = filePath.startsWith('logs/screenshots/') ? '../../' + filePath : filePath;

    return `
    <div class="rounded-xl border-2 ${borderColor} overflow-hidden flex-1 basis-56 min-w-0">
      <div class="${headerColor} px-3 py-1.5 text-xs font-semibold">${label}</div>
      <div class="bg-gray-50 cursor-pointer" onclick="openImg('${esc(relPath)}')">
        <img src="${esc(relPath)}" alt="${esc(label)}"
          class="w-full h-auto max-h-48 object-contain hover:max-h-none transition-all"
          onerror="this.parentElement.innerHTML='<div class=\\'h-20 flex items-center justify-center text-gray-400 text-xs\\'>画像未取得</div>'"
        />
      </div>
      <p class="px-2 py-1 text-xs text-gray-400 font-mono truncate">${esc(fname)}</p>
    </div>`;
  }).join('');

  return `<div class="flex flex-wrap gap-3">${cards}</div>`;
}

function buildIssueTable(issues) {
  if (issues.length === 0) {
    return `
    <section class="mb-12">
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
        <p class="text-3xl mb-2">✅</p>
        <p class="text-lg font-semibold text-emerald-700">検出された問題はありません</p>
        <p class="text-sm text-emerald-600 mt-1">ログを追加して再解析することで問題が検出されます</p>
      </div>
    </section>`;
  }

  // v2.0: 課題行 + 詳細展開行 をペアで生成（tbody単位で管理）
  const tbodies = issues.map((issue, idx) => {
    const sev  = SEVERITY_STYLE[issue.severity]    || SEVERITY_STYLE.Low;
    const diff = DIFFICULTY_STYLE[issue.difficulty] || DIFFICULTY_STYLE.Medium;
    const icon = CATEGORY_ICON[issue.category] || '⚠️';
    const rank = idx + 1;
    const hasShots = (issue.screenshots || []).length > 0;

    return `
    <tbody>
      <!-- 課題行（クリックで詳細展開） -->
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
          onclick="toggleDetail('${esc(issue.issueId)}')"
          data-severity="${esc(issue.severity)}"
          data-feature="${esc(issue.featureId)}"
          data-category="${esc(issue.category)}">
        <td class="px-4 py-3 text-center">
          <span class="inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold
            ${rank <= 3 ? 'bg-red-100 text-red-700' : rank <= 10 ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-500'}">
            ${rank}
          </span>
        </td>
        <td class="px-4 py-3 w-28">${scoreBar(issue.priorityScore)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${sev.bg} ${sev.text} ${sev.border} border">
            ${sev.label}
          </span>
        </td>
        <td class="px-4 py-3">
          <p class="text-xs font-mono text-indigo-500">${esc(issue.featureId)}</p>
          <p class="text-xs text-gray-500">${esc(issue.screenName)}</p>
        </td>
        <td class="px-4 py-3">
          <span class="text-sm">${icon}</span>
          <span class="text-xs text-gray-600 ml-1">${esc(issue.categoryLabel)}</span>
        </td>
        <td class="px-4 py-3 max-w-xs">
          <p class="text-xs text-gray-800 leading-relaxed">${esc(issue.description)}</p>
          ${issue.contextSummary
            ? `<p class="text-xs text-indigo-400 mt-0.5 truncate">📍 ${esc(issue.contextSummary)}</p>`
            : ''}
        </td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded text-xs font-medium ${diff.bg} ${diff.text}">
            ${diff.label}
          </span>
        </td>
        <td class="px-4 py-3 text-center">
          ${hasShots
            ? `<span class="text-xs text-indigo-500 font-medium whitespace-nowrap">📸 ${(issue.screenshots||[]).length}枚 ▾</span>`
            : `<span class="text-xs text-gray-300">詳細 ▾</span>`}
        </td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
            ${esc(issue.status || 'Open')}
          </span>
        </td>
      </tr>
      <!-- 詳細展開行（v2.0: スクショプレビュー付き） -->
      <tr id="detail-${esc(issue.issueId)}"
          class="hidden bg-indigo-50/30 border-b-2 border-indigo-100"
          data-severity="${esc(issue.severity)}"
          data-feature="${esc(issue.featureId)}"
          data-category="${esc(issue.category)}">
        <td colspan="9" class="px-6 py-5">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

            <!-- 左: 課題詳細メタデータ -->
            <div class="space-y-3">
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">📋 課題詳細</p>
              <div class="bg-white rounded-xl p-3 text-xs space-y-2">
                <div><span class="text-gray-400 w-16 inline-block">課題ID</span>
                  <span class="font-mono text-gray-700">${esc(issue.issueId)}</span></div>
                <div><span class="text-gray-400 w-16 inline-block">ルール</span>
                  <span class="font-mono text-gray-700">${esc(issue.ruleId)}</span></div>
                <div><span class="text-gray-400 w-16 inline-block">再現性</span>
                  <span class="text-gray-700">${esc(issue.reproducibility)}</span></div>
                <div><span class="text-gray-400 w-16 inline-block">信頼度</span>
                  <span class="text-gray-700">${Math.round((issue.confidence || 0) * 100)}%</span></div>
                <div><span class="text-gray-400 w-16 inline-block">発生回数</span>
                  <span class="text-gray-700">${issue.occurrences}回</span></div>
                ${issue.relatedTraceId
                  ? `<div><span class="text-gray-400 w-16 inline-block">traceId</span>
                     <span class="font-mono text-xs text-gray-500 break-all">${esc(issue.relatedTraceId)}</span></div>`
                  : ''}
              </div>
            </div>

            <!-- 中: 操作文脈 + ログ根拠 + 修正提案 -->
            <div class="space-y-3">
              ${issue.contextSummary ? `
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">📍 操作文脈</p>
              <div class="bg-white rounded-xl p-3">
                <p class="text-xs text-indigo-700 font-mono leading-relaxed">${esc(issue.contextSummary)}</p>
              </div>` : ''}
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">🔍 ログ根拠</p>
              <div class="bg-white rounded-xl p-3">
                <p class="text-xs text-gray-600 font-mono break-all leading-relaxed">${esc(issue.logEvidence)}</p>
              </div>
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">🔧 修正提案</p>
              <div class="bg-emerald-50 rounded-xl p-3">
                <p class="text-xs text-emerald-800 leading-relaxed">${esc(issue.fixSuggestion)}</p>
              </div>
            </div>

            <!-- 右: スクショプレビュー（v2.0 新機能） -->
            <div class="space-y-3">
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">
                📸 スクリーンショット
                ${hasShots ? `<span class="text-indigo-400 font-normal ml-1">${(issue.screenshots||[]).length}枚 — クリックで拡大</span>` : ''}
              </p>
              ${buildScreenshotPanel(issue)}
            </div>

          </div>
        </td>
      </tr>
    </tbody>`;
  }).join('');

  return `
  <section class="mb-12" id="issue-table-section">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
        <span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">4</span>
        問題一覧（優先度順）
        <span class="text-xs font-normal text-gray-400">▶ 行クリックで詳細・スクショを展開</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <select id="filter-severity" onchange="applyFilter()" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
          <option value="">重大度：すべて</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select id="filter-feature" onchange="applyFilter()" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
          <option value="">画面：すべて</option>
          ${[...new Set(issues.map(i => i.featureId))].map(fid =>
            `<option value="${esc(fid)}">${esc(fid)}</option>`
          ).join('')}
        </select>
        <select id="filter-category" onchange="applyFilter()" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
          <option value="">カテゴリ：すべて</option>
          ${[...new Set(issues.map(i => i.category))].map(cat =>
            `<option value="${esc(cat)}">${CATEGORY_ICON[cat] || '⚠️'} ${esc(cat)}</option>`
          ).join('')}
        </select>
        <button onclick="resetFilter()" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-500 bg-white hover:bg-gray-50">
          リセット
        </button>
        <span id="filter-count" class="text-xs text-gray-400 self-center"></span>
      </div>
    </div>

    <div class="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table class="w-full text-sm bg-white" id="issues-table">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-10">順位</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-28">優先度スコア</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">重大度</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">画面</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">カテゴリ</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">説明 / 操作文脈</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">難易度</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">証拠・詳細</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-16">状態</th>
          </tr>
        </thead>
        ${tbodies}
      </table>
    </div>
  </section>`;
}

// =============================================================================
//   Section 5: 検出ルール一覧（v1.0から維持・R11追加）
// =============================================================================
function buildRuleCards() {
  return `
  <section class="mb-12">
    <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
      <span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">5</span>
      検出ルール一覧
      <span class="text-xs font-normal text-gray-400 ml-2">Claude API 不使用・完全ルールベース</span>
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${[
        ['R01', 'ERRORログ検出',              '🔴', 'Critical', 'type=ERROR のエントリを直接検出'],
        ['R02', 'ロガー初期化ミス',            '🟡', 'High',     'featureId=UNKNOWN のログが存在する場合'],
        ['R03', 'ボタン重複バインド',          '🔁', 'High',     '同一 elementId が 10ms 以内に複数記録'],
        ['R04', '検索結果取得不可',            '🔍', 'Medium',   'SEARCH_RESULT の resultCount が「取得不可」'],
        ['R05', 'ボタン押下後API無応答',       '📡', 'High',     '処理系ボタン後3秒以内に BACKEND ログなし'],
        ['R06', '戻るボタン連打',              '⏩', 'Medium',   '100ms 以内に BACK 系ボタンが3回以上'],
        ['R07', '画面重複ロード',              '🔄', 'Medium',   '1秒以内に SCREEN_LOAD が2回以上'],
        ['R08', 'バックエンド処理失敗',        '💥', 'Critical', 'BACKEND の status !== SUCCESS'],
        ['R09', 'クリア後フォーム値残存',      '📝', 'Low',      'クリアボタンの formSnapshot に値が残存'],
        ['R10', 'ログ取得量過少',              '📊', 'Low',      'SCREEN_LOAD はあるが UI_CLICK が5件未満'],
        ['R11', '画面モード未設定',            '⚙️', 'Low',      '全ログで context.screenMode が未設定（v2.0以前）']
      ].map(([id, name, icon, sev, desc]) => {
        const s = SEVERITY_STYLE[sev] || SEVERITY_STYLE.Low;
        return `
        <div class="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
          <span class="mono text-xs font-bold text-gray-400 mt-0.5 w-8">${id}</span>
          <span class="text-base w-6 text-center">${icon}</span>
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold text-gray-800">${name}</span>
              <span class="px-1.5 py-0.5 rounded text-xs ${s.bg} ${s.text}">${sev}</span>
            </div>
            <p class="text-xs text-gray-500">${desc}</p>
          </div>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

// =============================================================================
//   Section 6: 優先度スコア算出式（v1.0から維持）
// =============================================================================
function buildScoreFormula() {
  return `
  <section class="mb-12">
    <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
      <h3 class="text-sm font-bold text-indigo-800 mb-3">
        <span class="w-6 h-6 rounded-md bg-indigo-200 text-indigo-700 inline-flex items-center justify-center text-xs font-bold mr-2">6</span>
        優先度スコア算出式
      </h3>
      <p class="mono text-sm text-indigo-700 mb-4">
        PriorityScore = (重大度 × 40) + (再現性 × 20) + (頻度 × 20) + (信頼度 × 20)
      </p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-indigo-700">
        <div>
          <p class="font-semibold mb-1">重大度（重み）</p>
          <p>Critical: 1.0</p><p>High: 0.8</p><p>Medium: 0.5</p><p>Low: 0.2</p>
        </div>
        <div>
          <p class="font-semibold mb-1">再現性（重み）</p>
          <p>Always: 1.0</p><p>Likely: 0.75</p><p>Sometimes: 0.5</p><p>Unknown: 0.3</p>
        </div>
        <div>
          <p class="font-semibold mb-1">頻度（自動算出）</p>
          <p>3回以上: 1.0</p><p>2回: 0.7</p><p>1回: 0.4</p>
        </div>
        <div>
          <p class="font-semibold mb-1">信頼度（ルール設定）</p>
          <p>ERRORログ: 0.99</p><p>重複バインド: 0.90</p><p>低カバレッジ: 0.60</p>
        </div>
      </div>
    </div>
  </section>`;
}

// =============================================================================
//   HTML ページ全体生成
// =============================================================================
function buildHtml(data) {
  const { summary, features, issues } = data;
  const avgScore = issues.length > 0
    ? Math.round(issues.reduce((s, i) => s + i.priorityScore, 0) / issues.length)
    : 0;
  const topIssue = issues[0];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>問題・課題ダッシュボード v2.0 | Machining System</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    body { font-family: 'DM Sans', sans-serif; }
    .mono { font-family: 'DM Mono', monospace; }
    details > summary { user-select: none; }
    .hidden { display: none !important; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- 固定ナビ -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 shadow-sm">
    <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
        <span class="text-xs font-semibold tracking-widest text-gray-400 uppercase">Machining System</span>
        <span class="text-gray-200">/</span>
        <span class="text-sm font-semibold text-gray-700">問題・課題ダッシュボード</span>
        <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">v2.0</span>
      </div>
      <div class="flex items-center gap-4 text-xs text-gray-400">
        <span>生成: ${fmtDate(summary.generatedAt)} JST</span>
        <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 mono">API不使用・ルールベース自動生成</span>
      </div>
    </div>
  </nav>

  <div class="max-w-7xl mx-auto px-6 pt-20 pb-20">

    <!-- ページヘッダー -->
    <div class="mb-10 pb-6 border-b border-gray-100">
      <p class="text-xs font-semibold tracking-widest text-red-400 uppercase mb-2">Issue Dashboard</p>
      <div class="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 tracking-tight">問題・課題 可視化ダッシュボード</h1>
          <p class="text-sm text-gray-400 mt-1">操作ログのルールベース自動解析結果 — ${summary.totalFeatures}画面 / ${summary.totalLogs}ログ</p>
        </div>
        ${topIssue ? `
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <p class="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">最優先課題</p>
          <p class="font-semibold text-red-800">${esc(topIssue.screenName)} — ${CATEGORY_ICON[topIssue.category] || ''} ${esc(topIssue.categoryLabel)}</p>
          <p class="text-xs text-red-600 mt-0.5">${esc((topIssue.description || '').slice(0, 60))}…</p>
        </div>` : ''}
      </div>
    </div>

    <!-- Section 1: サマリーカード -->
    <section class="mb-12">
      <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span class="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">1</span>
        サマリー
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm col-span-1">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">全問題数</p>
          <p class="text-3xl font-bold text-gray-900">${summary.totalIssues}</p>
          <p class="text-xs text-gray-400 mt-1">${summary.totalFeatures}画面</p>
        </div>
        <div class="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
          <p class="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">Critical</p>
          <p class="text-3xl font-bold text-red-700">${summary.critical}</p>
          <p class="text-xs text-red-400 mt-1">即対応必須</p>
        </div>
        <div class="bg-orange-50 rounded-xl border border-orange-200 p-4 shadow-sm">
          <p class="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">High</p>
          <p class="text-3xl font-bold text-orange-600">${summary.high}</p>
          <p class="text-xs text-orange-400 mt-1">優先対応</p>
        </div>
        <div class="bg-amber-50 rounded-xl border border-amber-200 p-4 shadow-sm">
          <p class="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Medium</p>
          <p class="text-3xl font-bold text-amber-600">${summary.medium}</p>
          <p class="text-xs text-amber-400 mt-1">計画対応</p>
        </div>
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Low</p>
          <p class="text-3xl font-bold text-gray-600">${summary.low}</p>
          <p class="text-xs text-gray-400 mt-1">余裕時対応</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">平均スコア</p>
          <p class="text-3xl font-bold text-indigo-600">${avgScore}</p>
          <p class="text-xs text-gray-400 mt-1">/ 100</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">解析ログ</p>
          <p class="text-3xl font-bold text-gray-700">${summary.totalLogs}</p>
          <p class="text-xs text-gray-400 mt-1">件</p>
        </div>
      </div>
    </section>

    ${buildHeatmap(features)}
    ${buildCategoryChart(summary)}
    ${buildIssueTable(issues)}
    ${buildRuleCards()}
    ${buildScoreFormula()}

  </div>

  <!-- 画像拡大モーダル（v2.0 新機能） -->
  <div id="img-modal" class="fixed inset-0 z-50 bg-black bg-opacity-80 hidden items-center justify-center p-4"
       onclick="closeImg()">
    <div class="relative max-w-5xl w-full" onclick="event.stopPropagation()">
      <button onclick="closeImg()" class="absolute -top-10 right-0 text-white text-2xl font-bold hover:text-gray-300">✕</button>
      <img id="img-modal-src" src="" class="w-full h-auto rounded-xl shadow-2xl max-h-screen object-contain"/>
    </div>
  </div>

  <!-- フッター -->
  <footer class="border-t border-gray-100 bg-white py-5">
    <div class="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
      <p>問題・課題ダッシュボード v2.0 — karkyon/log-server</p>
      <p>ルールベース自動生成 by GitHub Actions | Claude API 不使用 | ${fmtDate(summary.generatedAt)}</p>
    </div>
  </footer>

  <script>
    // 課題行クリックで詳細パネル展開・折りたたみ
    function toggleDetail(issueId) {
      const row = document.getElementById('detail-' + issueId);
      if (!row) return;
      row.classList.toggle('hidden');
    }

    // フィルター（tbody 単位で処理 — 課題行と詳細行をペアで表示/非表示）
    function applyFilter() {
      const sev  = document.getElementById('filter-severity').value;
      const feat = document.getElementById('filter-feature').value;
      const cat  = document.getElementById('filter-category').value;
      let visible = 0;

      document.querySelectorAll('#issues-table tbody').forEach(tb => {
        const rows    = tb.querySelectorAll('tr');
        const mainRow = rows[0]; // 課題行
        if (!mainRow) return;

        const match = (!sev  || mainRow.dataset.severity === sev)
                   && (!feat || mainRow.dataset.feature  === feat)
                   && (!cat  || mainRow.dataset.category === cat);

        rows.forEach(r => r.style.display = match ? '' : 'none');
        if (match) visible++;
      });

      document.getElementById('filter-count').textContent =
        (sev || feat || cat) ? visible + ' 件表示中' : '';
    }

    function resetFilter() {
      document.getElementById('filter-severity').value = '';
      document.getElementById('filter-feature').value  = '';
      document.getElementById('filter-category').value = '';
      applyFilter();
    }

    // 画像拡大モーダル
    function openImg(src) {
      const modal = document.getElementById('img-modal');
      document.getElementById('img-modal-src').src = src;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    function closeImg() {
      const modal = document.getElementById('img-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeImg(); });
  </script>

</body>
</html>`;
}

// =============================================================================
//   メイン
// =============================================================================
function main() {
  console.log('\n[generate-dashboard.js v2.0] 開始');

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`[ERROR] issues.json が見つかりません: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const html = buildHtml(data);

  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log(`  ✓ 保存完了: docs/issues/index.html (${(html.length / 1024).toFixed(1)} KB)\n`);
}

main();