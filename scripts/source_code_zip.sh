#!/bin/bash
# ============================================================
# source_code_zip.sh
# 使い方:
#   bash source_code_zip.sh              # logs/screenshots 除外
#   bash source_code_zip.sh --with-data  # logs/screenshots 含む
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$PROJECT_ROOT")"
TS=$(date +"%Y%m%d_%H%M")

WITH_DATA=false
if [[ "$1" == "--with-data" ]]; then
  WITH_DATA=true
fi

SUFFIX=$([ $WITH_DATA = true ] && echo "with-data" || echo "src-only")
FILENAME="log-server_${SUFFIX}_${TS}.tar.gz"
TMP_OUTPUT="${PARENT_DIR}/${FILENAME}"
FINAL_OUTPUT="${PROJECT_ROOT}/${FILENAME}"

echo "============================================"
echo " TLog APEX — ソースコード圧縮"
echo "============================================"
echo " モード     : $([ $WITH_DATA = true ] && echo 'ソース + logs/screenshots' || echo 'ソースのみ')"
echo " 保存先     : $FINAL_OUTPUT"
echo "--------------------------------------------"

EXCLUDES=(
  "--exclude=./node_modules"
  "--exclude=./apps/*/node_modules"
  "--exclude=./apps/*/.next"
  "--exclude=./apps/*/dist"
  "--exclude=./apps/*/build"
  "--exclude=./.git"
  "--exclude=./apps/cms/tsconfig.tsbuildinfo"
  "--exclude=./*.tar.gz"
)

if ! $WITH_DATA; then
  EXCLUDES+=("--exclude=./logs" "--exclude=./screenshots")
fi

cd "$PROJECT_ROOT"
tar -czf "$TMP_OUTPUT" "${EXCLUDES[@]}" .

if [[ $? -eq 0 ]]; then
  mv "$TMP_OUTPUT" "$FINAL_OUTPUT"
  SIZE=$(du -sh "$FINAL_OUTPUT" | cut -f1)
  echo " ✅ 完了: ${FILENAME}  [${SIZE}]"
else
  echo " ❌ 圧縮に失敗しました"
  rm -f "$TMP_OUTPUT"
  exit 1
fi
echo "============================================"