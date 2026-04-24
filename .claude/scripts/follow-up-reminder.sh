#!/usr/bin/env bash
# SessionStart hook: 未処理フォローアップが残っていれば件数を Claude に通知する。
# 出力: 件数 > 0 のとき systemMessage を 1 行 JSON で stdout に出す。
# 件数 = 0 または state ファイル無しなら無音。

set -euo pipefail

STATE_FILE=".claude/state/follow-ups.jsonl"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# `"status":"open"` を含む行を数える (jq 無しで動く軽量実装)
count=$(grep -c '"status":"open"' "$STATE_FILE" 2>/dev/null || true)

if [ -z "$count" ] || [ "$count" -eq 0 ] 2>/dev/null; then
  exit 0
fi

# JSON 1 行を出す。シェル経由で出すため変数のエスケープに注意 (count は数値だけ)
printf '{"systemMessage": "未処理フォローアップが %s 件あります。/follow-up で一覧確認、別 PR で順次解消してください。"}\n' "$count"
