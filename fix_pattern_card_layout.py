#!/usr/bin/env python3
"""
patterns/page.tsx 修正
- パネル幅を 360px に拡大
- overflowX:hidden, overflowY:auto で縦スクロール可
- カード右側: statusバッジを削除（右端に収まらない原因）、🗑のみ残す
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ① パネル幅 320 → 360px + overflow修正
OLD1 = 'style={{width: patternListOpen ? 320 : 44, flexShrink: 0, transition: "width 0.2s", overflow: "hidden"}}'
NEW1 = 'style={{width: patternListOpen ? 360 : 44, flexShrink: 0, transition: "width 0.2s", overflowX: "hidden", overflowY: "auto"}}'
cnt1 = src.count(OLD1)
assert cnt1 == 1, f"① 出現数: {cnt1}"
src = src.replace(OLD1, NEW1)
print("✅ ① パネル幅 360px + overflow修正")

# ② カード右側: statusバッジ+deleteボタン → deleteボタンのみ
OLD2 = '''                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0 rounded-full whitespace-nowrap ${STATUS_COLOR[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>
                      <button onClick={e => deletePattern(p.id, e)}
                        className={`text-xs px-2 py-1 rounded border-2 font-bold flex-shrink-0 ${dark?"border-red-700 text-red-400 hover:bg-red-900/30":"border-red-400 text-red-500 hover:bg-red-50"}`}>
                        🗑
                      </button>
                    </div>'''
NEW2 = '''                    <button onClick={e => deletePattern(p.id, e)}
                      className="ml-2 flex-shrink-0 text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-bold"
                      title="削除">
                      🗑
                    </button>'''
cnt2 = src.count(OLD2)
assert cnt2 == 1, f"② 出現数: {cnt2}"
src = src.replace(OLD2, NEW2)
print("✅ ② statusバッジ除去・🗑ボタン bg-red-700")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
