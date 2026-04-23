#!/usr/bin/env bash
# Stop hook: TS 系の変更がある状態で停止したら、ゲートとフォローアップ運用を Claude に思い出させる。
# 出力: 変更があれば systemMessage を 1 行 JSON で stdout に出す。なければ無音。

set -euo pipefail

# git で TS/TSX 変更があるか確認
if ! git diff --name-only HEAD 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# 1 行 JSON。改行を含めない。
printf '{"systemMessage": "TS 変更検出。コミット前ゲートを順に: (1) /architecture-harness で invariant チェック、(2) make before-commit (lint/typecheck/test/build)、(3) /review /security-review /simplify。scope 外の発見は /follow-up add で記録し別 PR に切ること。"}\n'
