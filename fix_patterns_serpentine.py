#!/usr/bin/env python3
"""patterns/page.tsx: 蛇行レイアウトをPatternSerpentineコンポーネントに完全リファクタリング"""
import re, sys

PATH = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(PATH, "r") as f:
    src = f.read()

orig = src

# ──────────────────────────────────────────────────
# 1. PatternSerpentine コンポーネントを挿入
#    "// ─────────────── TimelineView" or export default の直前に差し込む
#    patterns/page.tsx の場合は export default function ... の直前
# ──────────────────────────────────────────────────
COMPONENT = '''
// ─────────────── PatternSerpentine ───────────────
// 蛇行レイアウトを独立コンポーネント化（ResizeObserver/hooks使用のため）
function PatternSerpentine({ ptSeqs, patternLogs, patternSelectedLog, setPatternSelectedLog, setPatternViewMode, dark, subtext }: {
  ptSeqs: any[];
  patternLogs: any[];
  patternSelectedLog: any;
  setPatternSelectedLog: (v: any) => void;
  setPatternViewMode: (v: string) => void;
  dark: boolean;
  subtext: string;
}) {
  const contRef = React.useRef<HTMLDivElement>(null);
  const [cols, setCols] = React.useState(4);
  const [containerW, setContainerW] = React.useState(800);

  React.useEffect(() => {
    const calc = () => {
      if (contRef.current) {
        const w = contRef.current.offsetWidth;
        setContainerW(w);
        const g = 12;
        setCols(Math.max(2, Math.floor((w + g) / (130 + g))));
      }
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (contRef.current) ro.observe(contRef.current);
    return () => ro.disconnect();
  }, []);

  if (ptSeqs.length === 0) {
    return <div className={`text-center py-8 text-sm ${subtext}`}>seqデータなし</div>;
  }

  const GAP = 12;
  const boxW = Math.max(80, Math.floor((containerW - GAP * (cols - 1)) / cols));

  const ptRows: any[][] = [];
  for (let r = 0; r * cols < ptSeqs.length; r++) {
    ptRows.push(ptSeqs.slice(r * cols, (r + 1) * cols));
  }

  return (
    <div ref={contRef} style={{ width: "100%" }}>
      {ptRows.map((ptRow, pr) => {
        const ptRtl = pr % 2 === 1;
        const ptLast = pr === ptRows.length - 1;
        // LTR末端: 右端BOX中央, RTL末端: 左端BOX中央
        const lineX = ptRtl
          ? Math.floor(boxW / 2)
          : (cols - 1) * (boxW + GAP) + Math.floor(boxW / 2);
        return (
          <div key={pr}>
            <div style={{ display: "flex", flexDirection: ptRtl ? "row-reverse" : "row", alignItems: "stretch" }}>
              {ptRow.map((seq: any, pc: number) => {
                const pidx = pr * cols + pc;
                const plog = patternLogs[pidx];
                const ptLIR = pc === ptRow.length - 1;
                const pcol = (seq.featureId||"").includes("MACHINING") ? "#8b5cf6"
                  : (seq.featureId||"").includes("PRODUCTS") ? "#3b82f6" : "#64748b";
                const psp: string | null = plog?.screenshotPath ?? null;
                const pm = psp ? psp.match(/logs[/\\\\]screenshots[/\\\\](.+)/) : null;
                const pimg = pm
                  ? "http://192.168.1.11:3099/logs-screenshots/" + pm[1].replace(/\\\\\\\\/g, "/").split("/").map(encodeURIComponent).join("/")
                  : null;
                const pAct = patternSelectedLog?.id === plog?.id;
                return (
                  <React.Fragment key={pidx}>
                    <div
                      onClick={() => { setPatternSelectedLog(plog||null); setPatternViewMode("list"); }}
                      className="cursor-pointer rounded-lg overflow-hidden"
                      style={{
                        width: boxW, flexShrink: 0,
                        border: `2px solid ${pAct ? "#3b82f6" : pcol}`,
                        boxShadow: pAct ? "0 0 0 3px #3b82f680" : "0 1px 4px rgba(0,0,0,.1)"
                      }}>
                      <div style={{ background: pcol, padding: "3px 7px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "white", fontWeight: 700, fontSize: 10 }}>{(seq.featureId||"").replace("MC_","")}</span>
                        <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 10 }}>seq {seq.seqNo||seq.seq||pidx+1}</span>
                      </div>
                      <div style={{ height: 70, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {pimg
                          ? <img src={pimg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={e => { (e.currentTarget.parentNode as HTMLElement).innerHTML = '<span style="font-size:10px;color:#94a3b8">No img</span>'; }} />
                          : <span style={{ fontSize: 10, color: "#94a3b8" }}>No img</span>}
                      </div>
                      <div style={{ padding: "4px 7px", background: "white" }}>
                        <div style={{ fontSize: 10, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {seq.summary?.slice(0, 20) || "—"}
                        </div>
                      </div>
                    </div>
                    {!ptLIR && (
                      <div style={{ width: GAP, flexShrink: 0, alignSelf: "center", position: "relative" }}>
                        <div style={{ height: 2, background: "#475569", position: "relative" }}>
                          <div style={{
                            position: "absolute", top: "50%", transform: "translateY(-50%)",
                            width: 0, height: 0,
                            borderTop: "4px solid transparent",
                            borderBottom: "4px solid transparent",
                            ...(ptRtl ? { left: -1, borderRight: "6px solid #475569" } : { right: -1, borderLeft: "6px solid #475569" })
                          }} />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {!ptLast && (
              <div style={{ position: "relative", height: 36, overflow: "visible" }}>
                <div style={{ position: "absolute", left: lineX - 1.5, top: 0, width: 3, height: 36, background: "#475569" }} />
                <div style={{ position: "absolute", left: lineX - 6, top: 28, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "9px solid #475569" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

'''

# export default の直前に挿入
insert_marker = "export default function"
assert insert_marker in src, f"❌ FAIL: '{insert_marker}' が見つかりません"
src = src.replace(insert_marker, COMPONENT + insert_marker, 1)
print("✅ PatternSerpentine コンポーネント挿入完了")

# ──────────────────────────────────────────────────
# 2. IIFE を PatternSerpentine コンポーネント呼び出しに置換
#    <div className="flex-1 overflow-auto p-2">
#      {(() => {
#        ...
#      })()}
#    </div>
#
# 正規表現で IIFE ブロック全体を検出して置換
# ──────────────────────────────────────────────────

# IIFEの開始を特定: "const ptSeqs: any[] = selected.seqData?.seqs ?? [];" を含む{(() => {から始まるブロック
# 終わりは })()}

# 確実に一意な文字列で特定
iife_start_marker = "const ptSeqs: any[] = selected.seqData?.seqs ?? [];"
assert iife_start_marker in src, "❌ FAIL: IIFE 内の ptSeqs 定義が見つかりません"

# {(() => { から })()}  を見つけて置換
# 蛇行レイアウト全IIFE を探す
# 外側の <div className="flex-1 overflow-auto p-2"> の中身を置換
old_iife_wrapper = """                <div className="flex-1 overflow-auto p-2">
                  {(() => {
                    const ptSeqs: any[] = selected.seqData?.seqs ?? [];
                    if (ptSeqs.length === 0) return <div className={`text-center py-8 text-sm ${subtext}`}>seqデータなし</div>;
                    const PT_COLS = 5, BOX_W = 150, CON_W = 24, UNIT = BOX_W + CON_W;
                    const ptRows: any[][] = [];
                    for (let r = 0; r * PT_COLS < ptSeqs.length; r++) ptRows.push(ptSeqs.slice(r * PT_COLS, (r + 1) * PT_COLS));
                    return (
                      <div>
                        {ptRows.map((ptRow, pr) => {
                          const ptRtl = pr % 2 === 1;
                          const ptLast = pr === ptRows.length - 1;
                          const ptLineX = ptRtl ? 4 + BOX_W / 2 : 4 + (ptRow.length - 1) * UNIT + BOX_W / 2;"""

# 確認
found = old_iife_wrapper in src
print(f"{'✅' if found else '❌'} IIFE先頭マーカー検出: {found}")

if found:
    # IIFEブロック全体を PatternSerpentine 呼び出しに置換
    # })()}  まで正規表現で取得
    idx_start = src.index(old_iife_wrapper)
    # ここから })()}  を探す
    # IIFE は })()}  で終わる (2スペース*16 + })()}  )
    # 実際の終わりを探す: iife_start から検索
    search_from = idx_start + len(old_iife_wrapper)

    # "})()}" の直後の改行まで
    iife_end_marker = "                  })()}\n                </div>"
    idx_end = src.find(iife_end_marker, search_from)
    if idx_end == -1:
        print("❌ IIFE 終端 '})()}' が見つかりません - 代替マーカーを試行")
        iife_end_marker = "                  })()}"
        idx_end = src.find(iife_end_marker, search_from)

    if idx_end != -1:
        iife_end_full = idx_end + len(iife_end_marker)
        old_block = src[idx_start:iife_end_full]

        new_block = '''                <div className="flex-1 overflow-auto p-2">
                  <PatternSerpentine
                    ptSeqs={selected.seqData?.seqs ?? []}
                    patternLogs={patternLogs}
                    patternSelectedLog={patternSelectedLog}
                    setPatternSelectedLog={setPatternSelectedLog}
                    setPatternViewMode={setPatternViewMode}
                    dark={dark}
                    subtext={subtext}
                  />
                </div>'''

        src = src[:idx_start] + new_block + src[iife_end_full:]
        print("✅ IIFE → PatternSerpentine 置換完了")
    else:
        print("❌ IIFE 終端が見つかりません - 手動確認が必要")
else:
    print("⚠️  IIFE先頭が一致しませんでした")
    print("  → ptSeqs を含む行を確認:")
    for i, line in enumerate(src.splitlines()):
        if "ptSeqs" in line or "PT_COLS" in line:
            print(f"  L{i+1}: {line[:120]}")

# ──────────────────────────────────────────────────
# 確認
# ──────────────────────────────────────────────────
checks = [
    "PatternSerpentine",
    "contRef",
    "setContainerW",
    "boxW",
]
for kw in checks:
    cnt = src.count(kw)
    print(f"{'✅' if cnt > 0 else '❌'} '{kw}': {cnt}回")

if src == orig:
    print("⚠️  ファイルに変更がありません！")
    sys.exit(1)

with open(PATH, "w") as f:
    f.write(src)

print(f"\n✅ 完了: {PATH}")
