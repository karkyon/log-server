#!/usr/bin/env python3
"""
traces/page.tsx 修正
① ラベル編集 input文字色改善・✓✕ボタン大型化
② 🗑ボタン大型・視認性向上
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ① input文字色修正
OLD1 = 'className={`text-[11px] px-1.5 py-0.5 rounded border w-28 ${dark?"bg-gray-800 border-gray-600 text-white":"bg-white border-gray-300"}`} />'
NEW1 = 'className={`text-xs px-2 py-1 rounded border w-32 ${dark?"bg-gray-800 border-gray-500 text-white":"bg-white border-gray-400 text-gray-800"}`} />'
assert src.count(OLD1) == 1, f"OLD1 出現数: {src.count(OLD1)}"
src = src.replace(OLD1, NEW1)
print("✅ ① input文字色・サイズ修正")

# ① ✓✕ボタン大型化
OLD2 = '<button onClick={() => saveLabel(t.id)} className="text-[10px] text-blue-400 hover:text-blue-300">✓</button>\n                                <button onClick={() => setEditLabelId(null)} className="text-[10px] text-gray-400">✕</button>'
NEW2 = '<button onClick={() => saveLabel(t.id)} className="text-sm px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold leading-none">✓</button>\n                                <button onClick={() => setEditLabelId(null)} className="text-sm px-2 py-0.5 rounded bg-gray-500 hover:bg-gray-600 text-white font-bold leading-none">✕</button>'
assert src.count(OLD2) == 1, f"OLD2 出現数: {src.count(OLD2)}"
src = src.replace(OLD2, NEW2)
print("✅ ① ✓✕ボタン大型化")

# ② 🗑ボタン大型・視認性向上
OLD3 = 'className={`text-[10px] px-2 py-1 rounded border transition-all ${dark ? "border-red-800 text-red-400 hover:bg-red-900/30" : "border-red-300 text-red-500 hover:bg-red-50"}`}\n                          >\n                            🗑\n                          </button>'
NEW3 = 'className={`text-xs px-2.5 py-1.5 rounded border-2 font-bold transition-all ${dark ? "border-red-700 text-red-400 hover:bg-red-900/40" : "border-red-400 text-red-500 hover:bg-red-50"}`}\n                          >\n                            🗑\n                          </button>'
assert src.count(OLD3) == 1, f"OLD3 出現数: {src.count(OLD3)}"
src = src.replace(OLD3, NEW3)
print("✅ ② 🗑ボタン大型化")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
