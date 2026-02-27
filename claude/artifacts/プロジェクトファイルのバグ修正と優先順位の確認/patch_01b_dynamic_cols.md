# Patch 01b: TL_COLS 動的幅計算 + resize対応
# 対象ファイル: scripts/generate-review.js
# 前提: Patch 01（tl-serpentine への変更）適用済み

---

## 修正: renderScript() の jsCode 配列内

### 置換前（renderTlCards の最初の2行）
```javascript
    'function renderTlCards(){',
    '  var TL_COLS=6;',
    '  var data=tlVisible?TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId)>=0; }):TL_DATA;',
    '  var cont=document.getElementById("tl-serpentine"); if(!cont) return;',
```

### 置換後
```javascript
    'function renderTlCards(){',
    '  var cont=document.getElementById("tl-serpentine"); if(!cont) return;',
    '  var containerEl=document.getElementById("tl-container");',
    '  var containerW=containerEl ? Math.max(containerEl.offsetWidth-40, 300) : 900;',
    '  var CARD_SLOT=150;', // カード120px + 矢印16px + gap14px
    '  var TL_COLS=Math.max(2, Math.floor(containerW/CARD_SLOT));',
    '  var data=tlVisible?TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId)>=0; }):TL_DATA;',
```

---

## 追加: showPage('timeline') 呼び出し後に resize リスナーを1回だけ登録

jsCode 配列の `initTimeline` 関数の後（`function tlFilterAll` の前）に以下を追加：

```javascript
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
```

---

## 適用後の動作

| 画面幅 | containerW(推定) | TL_COLS | 1行のカード数 |
|--------|-----------------|---------|-------------|
| 1280px | ~1100px | 7 | 7枚 |
| 1920px | ~1740px | 11 | 11枚 |
| 768px  | ~680px  | 4 | 4枚 |
| スマホ | ~340px  | 2 | 2枚 |

- リサイズ時は 150ms のデバウンスで再描画
- タイムラインページ非表示時は再描画しない（パフォーマンス最適化）
