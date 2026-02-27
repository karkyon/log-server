# Patch 01 (修正版): 作業タイムライン 蛇行レイアウト
# 対象ファイル: scripts/generate-review.js
# ブランチ: main

---

## 修正1: `renderTimelinePage()` 関数内のHTML

`tl-container` と `tl-row` の div を置換する。

### 置換前（そのまま検索）
```
    <div id="tl-container" style="overflow-x:auto;overflow-y:auto;max-height:460px;padding:20px;background:#f8fafc;">
      <div id="tl-row" style="display:flex;gap:10px;align-items:flex-start;min-width:max-content;"></div>
    </div>
```

### 置換後
```
    <div id="tl-container" style="padding:20px;background:#f8fafc;">
      <div id="tl-serpentine"></div>
    </div>
```

**ポイント:** `overflow-x:auto` と `min-width:max-content` を削除、`tl-row` → `tl-serpentine` に変更。

---

## 修正2: `renderScript()` 内の `renderTlCards` 関数全体を置換

jsCode 配列の中の `renderTlCards` 関数。

### 置換前（開始〜終了を検索）
```javascript
    'function renderTlCards(){',
    '  var data=tlVisible?TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId)>=0; }):TL_DATA;',
    '  var row=document.getElementById("tl-row"); if(!row) return;',
    '  var lbl=document.getElementById("tl-total-label"); if(lbl) lbl.textContent=data.length+" seq";',
    '  var sep=\'<div style="display:flex;align-items:center;padding:0 4px;">\'+',
    '    \'<svg width="16" height="16" viewBox="0 0 16 16">\'+',
    '    \'<line x1="0" y1="8" x2="10" y2="8" stroke="#cbd5e1" stroke-width="1.5"/>\'+',
    '    \'<polygon points="8,4 16,8 8,12" fill="#cbd5e1"/></svg></div>\';',
    '  row.innerHTML=data.map(function(s,idx){',
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
    '  }).join(sep);',
    '}',
```

### 置換後（蛇行レイアウト対応版）
```javascript
    'function renderTlCards(){',
    '  var TL_COLS=6;',
    '  var data=tlVisible?TL_DATA.filter(function(s){ return tlVisible.indexOf(s.featureId)>=0; }):TL_DATA;',
    '  var cont=document.getElementById("tl-serpentine"); if(!cont) return;',
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
    '  var sep=\'<div style="display:flex;align-items:center;padding:0 2px;">\'+',
    '    \'<svg width="14" height="14" viewBox="0 0 16 16">\'+',
    '    \'<line x1="0" y1="8" x2="10" y2="8" stroke="#cbd5e1" stroke-width="1.5"/>\'+',
    '    \'<polygon points="8,4 16,8 8,12" fill="#cbd5e1"/></svg></div>\';',
    '  var html="";',
    '  for(var r=0; r*TL_COLS<cards.length; r++){',
    '    var chunk=cards.slice(r*TL_COLS, (r+1)*TL_COLS);',
    '    var isRtl=r%2===1;',
    '    var isLast=(r+1)*TL_COLS>=cards.length;',
    '    var rowDir=isRtl?"flex-direction:row-reverse;":"";',
    '    html+=\'<div style="display:flex;align-items:flex-start;gap:0;flex-wrap:nowrap;\'+rowDir+\'">\'+chunk.join(sep)+\'</div>\';',
    '    if(!isLast){',
    '      var uStyle=isRtl',
    '        ?"display:flex;justify-content:flex-start;padding-left:28px;height:28px;align-items:flex-end;"',
    '        :"display:flex;justify-content:flex-end;padding-right:28px;height:28px;align-items:flex-end;";',
    '      var lStyle=isRtl',
    '        ?"width:36px;height:28px;border:2px dashed #cbd5e1;border-top:none;border-right:none;border-radius:0 0 0 10px;"',
    '        :"width:36px;height:28px;border:2px dashed #cbd5e1;border-top:none;border-left:none;border-radius:0 0 10px 0;";',
    '      html+=\'<div style="\'+uStyle+\'"><div style="\'+lStyle+\'"></div></div>\';',
    '    }',
    '  }',
    '  cont.innerHTML=html;',
    '}',
```

---

## 適用手順

1. GitHub で `scripts/generate-review.js` を開く
2. **修正1**: `renderTimelinePage` 関数の中の `tl-container` divを検索して置換
3. **修正2**: `renderScript` 関数内の jsCode 配列の `renderTlCards` 関数全体を検索して置換
4. コミットメッセージ: `fix: 作業タイムライン蛇行レイアウト対応 (Patch 01 修正版)`
5. GitHub Actions → 「アクションレビューHTML生成」を手動実行

## 確認ポイント
- TL_COLS=6 → 6枚ごとに折り返し
- 偶数行(0,2...): 左→右
- 奇数行(1,3...): 右→左（`flex-direction:row-reverse`）
- U-ターンコネクタが行末に破線で表示
- `tlCardClick` の `idx` 引数は変更なし → クリック・選択機能はそのまま動作
