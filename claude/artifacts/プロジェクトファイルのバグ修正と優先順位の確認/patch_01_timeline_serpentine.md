# Patch 01: タイムライン蛇行レイアウト修正
# 対象ファイル: scripts/generate-review.js
# ブランチ: main（直接適用）

---

## 修正1: CSS変更 — `renderCSS()` 内の `/* FLOW DIAGRAM */` セクション

### 置換前（そのまま検索して置換）
```
.flow-canvas{overflow-x:auto;padding:32px 24px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;}
.flow-row{display:flex;align-items:center;gap:0;flex-wrap:nowrap;min-width:max-content;}
```

### 置換後
```
.flow-canvas{padding:16px 24px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;}
.flow-row{display:flex;align-items:center;gap:0;flex-wrap:nowrap;}
.flow-row.rtl{flex-direction:row-reverse;}
.flow-row.rtl .flow-arrow-line::after{right:auto;left:-1px;border-left:none;border-right-color:#94a3b8;}
.flow-uturn{display:flex;align-items:center;height:32px;margin:0 4px;}
.flow-uturn.uturn-right{justify-content:flex-end;padding-right:28px;}
.flow-uturn.uturn-left{justify-content:flex-start;padding-left:28px;}
.flow-uturn-line{width:36px;height:32px;border:2px dashed #94a3b8;border-top:none;}
.flow-uturn.uturn-right .flow-uturn-line{border-radius:0 0 10px 0;border-left:none;}
.flow-uturn.uturn-left .flow-uturn-line{border-radius:0 0 0 10px;border-right:none;}
```

**変更ポイント:**
- `overflow-x:auto` を削除（横スクロール禁止）
- `min-width:max-content` を削除（横に広がる原因）
- `.flow-row.rtl` 追加 → `flex-direction:row-reverse` で視覚的RTL
- `.flow-arrow-line::after` の矢印を RTL 行では左向きに反転
- `.flow-uturn*` 追加 → U ターンコネクタ

---

## 修正2: `renderFlowPage` 関数全体を置換

### 置換前（関数の開始〜終了まで）
```javascript
function renderFlowPage(featureId, seqs) {
  const name = SCREEN_NAME_MAP[featureId]||featureId;

  // フローノード & 矢印
  let flowHtml = '';
  for (let i=0;i<seqs.length;i++) {
```
から関数の終わり `}` まで全体を以下と置換。

### 置換後（完全な新関数）
```javascript
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

    // ノードHTML（flow-node + flow-box）
    const nodeHtml =
      '<div class="flow-node">' +
        '<div class="' + cls + (s.autoNG ? ' is-ng' : '') + '" ' +
          'id="fbox-' + esk + '" ' +
          'onclick="scrollToThumb(\'' + efid + '\',\'' + s.seqNo + '\')">' +
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
    <div class="flow-canvas">
      ${serpentineHtml}
    </div>
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

  <div class="card">
    <div class="card-title">スクリーンショット一覧</div>
    <div class="thumb-grid">${thumbHtml}</div>
  </div>
</div>`;
}
```

---

## 適用手順

1. GitHub で `scripts/generate-review.js` を開く
2. **修正1** のCSS置換を実施（`FLOW DIAGRAM` コメントの直後の2行を置換）
3. **修正2** の `renderFlowPage` 関数全体を置換
4. コミットメッセージ: `fix: タイムライン蛇行レイアウト対応 (Patch 01)`
5. GitHub Actions → 「アクションレビューHTML生成」を手動実行
6. 生成された `docs/review/index.html` で遷移図ページを確認

## 確認ポイント
- 35 seq の場合: 6行 × 5列(最終行は5個) で蛇行表示される
- 偶数行: 左→右 (seq1-6, seq13-18, ...)
- 奇数行: 右→左 (seq7-12, seq19-24, ...)
- U-ターンコネクタが行末に表示される
- `fbox-`, `fv-`, `farrow-`, `falbl-` の ID は維持されるため JS 機能に影響なし
