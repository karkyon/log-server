#!/usr/bin/env python3
"""
patterns/page.tsx 修正
③ 🗑ボタン大型化・視認性向上 + パターン一覧幅拡大
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ③ 🗑ボタン大型化（実際のコードに合わせた文字列）
OLD3 = 'className={`text-[11px] px-1.5 py-0.5 rounded border ${dark?"border-red-800 text-red-400 hover:bg-red-900/30":"border-red-200 text-red-400 hover:bg-red-50"}`}>\n                        🗑'
NEW3 = 'className={`text-xs px-2 py-1 rounded border-2 font-bold flex-shrink-0 ${dark?"border-red-700 text-red-400 hover:bg-red-900/30":"border-red-400 text-red-500 hover:bg-red-50"}`}>\n                        🗑'
cnt3 = src.count(OLD3)
assert cnt3 == 1, f"OLD3 出現数: {cnt3}"
src = src.replace(OLD3, NEW3)
print("✅ ③ 🗑ボタン大型化")

# ③ パターン一覧幅 280→320px
OLD3w = 'width: patternListOpen ? 280 : 44'
NEW3w = 'width: patternListOpen ? 320 : 44'
cnt3w = src.count(OLD3w)
assert cnt3w == 1, f"OLD3w 出現数: {cnt3w}"
src = src.replace(OLD3w, NEW3w)
print("✅ ③ パターン一覧幅 280→320px")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
