#!/usr/bin/env bash
# テストファイルの書き方を検証するスクリプト
# 使用方法: check-test-style.sh <file_path>
#
# 以下を確認する:
# 1. describe/it ブロックに日本語タイトルがあるか
# 2. .only が残っていないか
# 3. テスト構造 (describe + it) があるか

FILE="$1"

# テストファイル以外はスキップ
if [[ ! "$FILE" =~ \.test\.(ts|tsx)$ ]]; then
  exit 0
fi

# ファイルが存在しない場合はスキップ
if [[ ! -f "$FILE" ]]; then
  exit 0
fi

ISSUES=()

# .only チェック（フォーカステスト禁止）
if grep -qE '\.(only)\(' "$FILE"; then
  ISSUES+=(".only が使われています。コミット前に削除してください。")
fi

# 日本語タイトルチェック（describe または it/test の行に非 ASCII 文字が含まれるか）
# GNU grep の -P や bash 4.2+ の $'\u3041' は macOS (BSD grep / bash 3.2) で動かないため、
# C ロケールで「ASCII 印字・空白以外のバイト」を検出する方式にする (UTF-8 の日本語は必ず該当する)。
if grep -qE 'describe\(|it\(|test\(' "$FILE"; then
  if ! grep -E 'describe\(|it\(|test\(' "$FILE" | LC_ALL=C grep -q '[^[:print:][:space:]]'; then
    ISSUES+=("describe/it のタイトルに日本語が見当たりません。BDD スタイルで日本語タイトルを使ってください。")
  fi
fi

# 問題がなければ終了
if [[ ${#ISSUES[@]} -eq 0 ]]; then
  exit 0
fi

# 問題を additionalContext として Claude に返す
CONTEXT="テストスタイルの確認 ($FILE):\n"
for ISSUE in "${ISSUES[@]}"; do
  CONTEXT+="- $ISSUE\n"
done
CONTEXT+="CLAUDE.md の BDD スタイルルールを確認してください。"

jq -n --arg ctx "$(printf '%b' "$CONTEXT")" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'
