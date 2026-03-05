#!/usr/bin/env python3
"""
patterns/page.tsx 修正
- overflowX:visible + overflowY:auto → overflow:hidden に戻す
- h3 タイトルに truncate 追加（長名が原因でカードが拡張していた）
- 右側の status + delete ボタンをよりコンパクトに
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# overflow を hidden に戻す
OLD_OV = 'style={{width: patternListOpen ? 320 : 44, flexShrink: 0, transition: "width 0.2s", overflowX: "visible", overflowY: "auto"}}'
NEW_OV = 'style={{width: patternListOpen ? 320 : 44, flexShrink: 0, transition: "width 0.2s", overflow: "hidden"}}'
assert src.count(OLD_OV) == 1, f"overflow 出現数: {src.count(OLD_OV)}"
src = src.replace(OLD_OV, NEW_OV)
print("✅ overflow: hidden に戻す")

# h3 に truncate 追加（カードタイトルが長いと幅超過の原因）
OLD_H3 = f'<h3 className={{`font-medium ${{text}}`}}>'
NEW_H3 = f'<h3 className={{`font-medium truncate ${{text}}`}}>'
assert src.count(OLD_H3) == 1, f"h3 出現数: {src.count(OLD_H3)}"
src = src.replace(OLD_H3, NEW_H3)
print("✅ h3 に truncate 追加")

# 右側ブロックを min-w-0 ではなく flex-shrink-0 にして詰める
# status バッジを小さく: text-xs → text-[10px]、py-0.5 → py-0
OLD_BADGE = 'className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>'
NEW_BADGE = 'className={`text-[10px] px-1.5 py-0 rounded-full whitespace-nowrap ${STATUS_COLOR[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>'
assert src.count(OLD_BADGE) == 1, f"badge 出現数: {src.count(OLD_BADGE)}"
src = src.replace(OLD_BADGE, NEW_BADGE)
print("✅ statusバッジをコンパクト化")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
