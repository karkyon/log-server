#!/usr/bin/env python3
"""
traces/[traceId]/page.tsx 修正
⑤ 明示的OK設定後はERROR/NGバグ色表示しない（2箇所）
"""
TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/traces/[traceId]/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()
orig = src

# ⑤-A リストビューの背景色条件
OLD_A = '(log.verdict?.verdict === "NG" || log.eventType === "ERROR") ? (dark ? "rgba(153,27,27,0.15)" : "#fff5f5") : "",'
NEW_A = '(log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && log.eventType === "ERROR")) ? (dark ? "rgba(153,27,27,0.15)" : "#fff5f5") : "",'
cnt_a = src.count(OLD_A)
assert cnt_a == 1, f"OLD_A 出現数: {cnt_a}"
src = src.replace(OLD_A, NEW_A)
print("✅ ⑤-A リスト背景色条件修正")

# ⑤-B tlItems の hasNg
OLD_B = 'hasNg: log.verdict?.verdict === "NG" || log.eventType === "ERROR" || log.payload?.result === "NG",'
NEW_B = 'hasNg: log.verdict?.verdict === "NG" || (log.verdict?.verdict !== "OK" && (log.eventType === "ERROR" || log.payload?.result === "NG")),'
cnt_b = src.count(OLD_B)
assert cnt_b == 1, f"OLD_B 出現数: {cnt_b}"
src = src.replace(OLD_B, NEW_B)
print("✅ ⑤-B tlItems hasNg条件修正")

assert src != orig
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ 完了: {TARGET}")
