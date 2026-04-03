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

# 日本語タイトルチェック（describe または it/test に日本語が含まれるか）
# 日本語: ひらがな ぁ-ん、カタカナ ァ-ヶ、漢字 一-龠
if grep -qE 'describe\(|it\(|test\(' "$FILE"; then
  if ! grep -qP '[\x{3041}-\x{3096}\x{30A1}-\x{30F6}\x{4E00}-\x{9FFF}]' "$FILE" 2>/dev/null; then
    # Perl が使えない環境向けフォールバック
    if ! grep -q $'[\u3041-\u30f6\u4e00-\u9fff]' "$FILE" 2>/dev/null; then
      ISSUES+=("describe/it のタイトルに日本語が見当たりません。BDD スタイルで日本語タイトルを使ってください。")
    fi
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
