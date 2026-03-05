#!/usr/bin/env python3
"""
PatternSerpentine の setPatternViewMode props 型を修正
  (v: string) => void  →  (v: "list" | "timeline" | "seq") => void
"""
import re, sys

TARGET = "/home/karkyon/projects/log-server/apps/cms/app/projects/[id]/patterns/page.tsx"

with open(TARGET, encoding="utf-8") as f:
    src = f.read()

orig = src

OLD = '  setPatternViewMode: (v: string) => void;'
NEW = '  setPatternViewMode: (v: "list" | "timeline" | "seq") => void;'

assert src.count(OLD) == 1, f"想定外の出現回数: {src.count(OLD)}"

src = src.replace(OLD, NEW)
assert src != orig, "変更なし"

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print("✅ 修正完了: setPatternViewMode 型を union型に変更")
