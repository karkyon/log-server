#!/usr/bin/env python3
"""
patterns/page.tsx 修正
③ 🗑ボタン大型・視認性向上 + リスト右端のoverflow修正
⑤ isNg条件: 明示的OK設定時はNG扱いしない
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ③ パターンカードの🗑ボタン大型化
OLD3 = 'className={`text-[11px] px-1.5 py-0.5 rounded border ${dark?"border-red-800 text-red-400 hover:bg-red-900/30":"border-red-200 text-red-400 hover:bg-red-50"}`}>\n                      🗑'
NEW3 = 'className={`text-xs px-2 py-1 rounded border-2 font-bold flex-shrink-0 ${dark?"border-red-700 text-red-400 hover:bg-red-900/30":"border-red-400 text-red-500 hover:bg-red-50"}`}>\n                      🗑'
cnt3 = src.count(OLD3)
assert cnt3 == 1, f"OLD3 出現数: {cnt3}"
src = src.replace(OLD3, NEW3)
print("✅ ③ 🗑ボタン大型化")

# ③ パターン一覧の幅を 280→320 に拡大し右端切れ防止
OLD3w = 'width: patternListOpen ? 280 : 44'
NEW3w = 'width: patternListOpen ? 320 : 44'
cnt3w = src.count(OLD3w)
assert cnt3w == 1, f"OLD3w 出現数: {cnt3w}"
src = src.replace(OLD3w, NEW3w)
print("✅ ③ パターン一覧幅 280→320px")

# ③ パターン一覧のoverflow: hidden → overflow-y: auto に変更（右端クリップ防止）
OLD3o = 'overflow: "hidden"}}'
NEW3o = 'overflow: "hidden", overflowY: "auto"}}'
cnt3o = src.count(OLD3o)
if cnt3o == 1:
    src = src.replace(OLD3o, NEW3o)
    print("✅ ③ パターン一覧 overflow-y: auto 追加")
else:
    print(f"ℹ️  overflow修正: 出現数{cnt3o}（スキップ）")

# ⑤ patterns list の isNg条件修正
OLD5 = 'const isNg = log.verdict?.verdict === "NG" || log.eventType === "ERROR";'
NEW5 = 'const isNg = log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && (log.eventType === "ERROR" || log.payload?.result === "NG"));'
cnt5 = src.count(OLD5)
if cnt5 >= 1:
    src = src.replace(OLD5, NEW5)
    print(f"✅ ⑤ isNg条件修正（{cnt5}箇所）")
else:
    print("ℹ️  patterns isNg: 対象なし（スキップ）")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
