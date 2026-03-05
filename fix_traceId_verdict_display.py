#!/usr/bin/env python3
"""
traces/[traceId]/page.tsx 修正
④ NGバッジを content有無に関わらず常に表示
⑤ 明示的にOKを設定した場合はERRORでもNG扱いしない
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/[traceId]/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ④ NGバッジ表示条件から && log.verdict.content を除去
OLD4 = '{log.verdict?.verdict === "NG" && log.verdict.content && ('
NEW4 = '{log.verdict?.verdict === "NG" && ('
cnt = src.count(OLD4)
assert cnt >= 1, f"OLD4 出現数: {cnt}"
src = src.replace(OLD4, NEW4)
print(f"✅ ④ NGバッジ条件修正（{cnt}箇所）")

# ④ NGバッジ内の content 表示: content がない場合も表示 ( .slice など null-safe に )
# content表示箇所: {log.verdict.content.slice(0, 30)}{log.verdict.content.length > 30 ? "…" : ""}
OLD4b = '{log.verdict.content.slice(0, 30)}{log.verdict.content.length > 30 ? "…" : ""}'
NEW4b = '{(log.verdict.content || "").slice(0, 30)}{(log.verdict.content || "").length > 30 ? "…" : ""}'
cnt4b = src.count(OLD4b)
if cnt4b > 0:
    src = src.replace(OLD4b, NEW4b)
    print(f"✅ ④ content null-safe修正（{cnt4b}箇所）")
else:
    print("ℹ️  content null-safe: 対象なし（スキップ）")

# ⑤ isNg 条件修正: 明示的OK設定時はERRORでもNG扱いしない
OLD5 = 'const isNg = log.verdict?.verdict === "NG" || log.eventType === "ERROR";'
NEW5 = 'const isNg = log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && (log.eventType === "ERROR" || log.payload?.result === "NG"));'
cnt5 = src.count(OLD5)
assert cnt5 >= 1, f"OLD5 出現数: {cnt5}"
src = src.replace(OLD5, NEW5)
print(f"✅ ⑤ isNg条件修正（{cnt5}箇所）")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
