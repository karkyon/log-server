#!/usr/bin/env python3
"""traceId/page.tsx の蛇行レイアウトを均等幅BOX＋動的cols に完全修正"""
import re, sys

PATH = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/[traceId]/page.tsx"

with open(PATH, "r") as f:
    src = f.read()

orig = src  # 比較用

# ──────────────────────────────────────────────────
# 1. cols state: useState(8) → useState(5) ＋ containerW state 追加
# ──────────────────────────────────────────────────
old1 = "  const [cols, setCols] = useState(8);"
new1 = "  const [cols, setCols] = useState(5);\n  const [containerW, setContainerW] = useState(800);"
assert old1 in src, "❌ FAIL 1: cols useState(8) が見つかりません"
src = src.replace(old1, new1, 1)

# ──────────────────────────────────────────────────
# 2. ResizeObserver: offsetWidth-40 → w そのまま、setContainerW追加、cols計算式変更
# ──────────────────────────────────────────────────
old2 = (
    "        const w = containerRef.current.offsetWidth - 40;\n"
    "        setCols(Math.max(2, Math.floor(w / 180)));"
)
new2 = (
    "        const w = containerRef.current.offsetWidth;\n"
    "        setContainerW(w);\n"
    "        const g = 16;\n"
    "        setCols(Math.max(2, Math.floor((w + g) / (120 + g))));"
)
assert old2 in src, "❌ FAIL 2: ResizeObserver calc が見つかりません"
src = src.replace(old2, new2, 1)

# ──────────────────────────────────────────────────
# 3. rows 計算の直前に GAP / boxW を挿入
#    "const rows: TLItem[][] = [];" の直前に追加
# ──────────────────────────────────────────────────
old3 = "  const rows: TLItem[][] = [];"
new3 = (
    "  const GAP = 16;\n"
    "  const boxW = Math.max(80, Math.floor((containerW - GAP * (cols - 1)) / cols));\n\n"
    "  const rows: TLItem[][] = [];"
)
assert old3 in src, "❌ FAIL 3: 'const rows: TLItem[][] = [];' が見つかりません"
src = src.replace(old3, new3, 1)

# ──────────────────────────────────────────────────
# 4. BOX 幅: width: 160 → width: boxW, flexShrink: 0
# ──────────────────────────────────────────────────
old4 = "                          width: 160, borderRadius: 8,"
new4 = "                          width: boxW, flexShrink: 0, borderRadius: 8,"
assert old4 in src, "❌ FAIL 4: 'width: 160, borderRadius: 8,' が見つかりません"
src = src.replace(old4, new4, 1)

# ──────────────────────────────────────────────────
# 5. 横矢印コネクタ(width:28 固定) → GAP ベースに置換
# ──────────────────────────────────────────────────
old5 = (
    '                      {!isLastInRow && (\n'
    '                        <div style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "center", overflow: "visible" }}>\n'
    '                          <div style={{ width: "100%", height: 2, background: "#475569", position: "relative", overflow: "visible" }}>\n'
    '                            <div style={{ position: "absolute", right: isRtl ? "auto" : -7, left: isRtl ? -7 : "auto", top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", ...(isRtl ? { borderRight: "8px solid #475569" } : { borderLeft: "8px solid #475569" }) }} />\n'
    '                          </div>\n'
    '                        </div>\n'
    '                      )}'
)
new5 = (
    '                      {!isLastInRow && (\n'
    '                        <div style={{ width: GAP, flexShrink: 0, alignSelf: "center", position: "relative" }}>\n'
    '                          <div style={{ height: 2, background: "#475569", position: "relative" }}>\n'
    '                            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", ...(isRtl ? { left: -1, borderRight: "7px solid #475569" } : { right: -1, borderLeft: "7px solid #475569" }) }} />\n'
    '                          </div>\n'
    '                        </div>\n'
    '                      )}'
)
assert old5 in src, "❌ FAIL 5: 横矢印コネクタ(width:28) が見つかりません"
src = src.replace(old5, new5, 1)

# ──────────────────────────────────────────────────
# 6. Uターン lineX 計算: 固定値 → 動的算出
# ──────────────────────────────────────────────────
old6 = (
    '                // BOX=160, connector=28 → 1unit=188px, padding=4, BOX中央=+80\n'
    '                const lineX = isRtl\n'
    '                  ? 4 + 80\n'
    '                  : 4 + (row.length - 1) * 188 + 80;'
)
new6 = (
    '                // BOX均等幅: LTR末端=右端BOX中央, RTL末端=左端BOX中央\n'
    '                const lineX = isRtl\n'
    '                  ? Math.floor(boxW / 2)\n'
    '                  : (cols - 1) * (boxW + GAP) + Math.floor(boxW / 2);'
)
assert old6 in src, "❌ FAIL 6: lineX 計算式が見つかりません"
src = src.replace(old6, new6, 1)

# ──────────────────────────────────────────────────
# 確認
# ──────────────────────────────────────────────────
checks = [
    ("setContainerW", 2),
    ("boxW", 3),
    ("GAP", 3),
    ("containerW - GAP", 1),
    ("cols - 1) * (boxW + GAP)", 1),
]
ok = True
for keyword, minimum in checks:
    count = src.count(keyword)
    status = "✅" if count >= minimum else "❌"
    if count < minimum:
        ok = False
    print(f"{status} '{keyword}': {count}回")

if src == orig:
    print("⚠️  ファイルに変更がありません！")
    sys.exit(1)

with open(PATH, "w") as f:
    f.write(src)

print(f"\n{'✅ 完了: ' + PATH if ok else '❌ 一部失敗'}")
