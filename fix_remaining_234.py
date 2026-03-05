#!/usr/bin/env python3
"""
②③④ 残課題修正
② traces/page.tsx: 🗑ボタンを bg-red-700 塗りつぶし（生成ボタンと同スタイル）
③ patterns/page.tsx: 左パネルの overflow: hidden → visible に変更
④ traces/[traceId]/page.tsx: NGバッジ表示条件から && log.verdict.content を除去
"""
import sys

# ─────────────── ② ───────────────
T2 = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/page.tsx"
with open(T2, encoding="utf-8") as f: s2 = f.read()
o2 = s2

# ②: 現在のスタイル（前回のfixで変更済み）→ 塗りつぶし赤ボタンへ
OLD2 = '''className={`text-xs px-2.5 py-1.5 rounded border-2 font-bold transition-all ${dark ? "border-red-700 text-red-400 hover:bg-red-900/40" : "border-red-400 text-red-500 hover:bg-red-50"}`}
                          >
                            🗑
                          </button>'''
NEW2 = '''className="text-[10px] px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white transition-all"
                          >
                            🗑
                          </button>'''
cnt2 = s2.count(OLD2)
assert cnt2 == 1, f"② 出現数: {cnt2}"
s2 = s2.replace(OLD2, NEW2)
assert s2 != o2
with open(T2, "w", encoding="utf-8") as f: f.write(s2)
print(f"✅ ② 🗑ボタン → bg-red-700 塗りつぶし")

# ─────────────── ③ ───────────────
T3 = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"
with open(T3, encoding="utf-8") as f: s3 = f.read()
o3 = s3

# ③: 左パネル overflow: hidden → overflowX: visible, overflowY: auto
OLD3 = 'style={{width: patternListOpen ? 320 : 44, flexShrink: 0, transition: "width 0.2s", overflow: "hidden"}}'
NEW3 = 'style={{width: patternListOpen ? 320 : 44, flexShrink: 0, transition: "width 0.2s", overflowX: "visible", overflowY: "auto"}}'
cnt3 = s3.count(OLD3)
assert cnt3 == 1, f"③ 出現数: {cnt3}"
s3 = s3.replace(OLD3, NEW3)
assert s3 != o3
with open(T3, "w", encoding="utf-8") as f: f.write(s3)
print(f"✅ ③ パターン左パネル overflow修正")

# ─────────────── ④ ───────────────
T4 = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/[traceId]/page.tsx"
with open(T4, encoding="utf-8") as f: s4 = f.read()
o4 = s4

# ④: content有無に関わらずNGバッジ表示
OLD4 = '{log.verdict?.verdict === "NG" && log.verdict.content && ('
NEW4 = '{log.verdict?.verdict === "NG" && ('
cnt4 = s4.count(OLD4)
assert cnt4 == 1, f"④ 出現数: {cnt4}"
s4 = s4.replace(OLD4, NEW4)

# content null-safe
OLD4b = '{log.verdict.content.slice(0, 30)}{log.verdict.content.length > 30 ? "…" : ""}'
NEW4b = '{(log.verdict.content || "").slice(0, 30)}{(log.verdict.content || "").length > 30 ? "…" : ""}'
cnt4b = s4.count(OLD4b)
if cnt4b > 0:
    s4 = s4.replace(OLD4b, NEW4b)
    print(f"✅ ④ content null-safe修正")

assert s4 != o4
with open(T4, "w", encoding="utf-8") as f: f.write(s4)
print(f"✅ ④ NGバッジ条件修正（content有無に関わらず表示）")

print("\n✅ 全修正完了")
