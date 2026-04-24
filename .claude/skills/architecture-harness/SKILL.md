---
name: architecture-harness
description: docs/architecture/harness.md の invariant を機械的に検証するスキル。引数なしで `--staged --fail-on=error` (PR 直前用)、`full` で全件スキャン、`why <RULE_ID>` で invariant の意図を harness.md から引いて表示。コミット直前 / Stop hook から呼ばれる前提。
---

# architecture-harness Skill

`docs/architecture/harness.md` で定義された invariant を `scripts/architecture-harness.ts` で機械検証する。invariant の正本は `docs/architecture/harness.md`、本スキルはあくまで実行の入り口。

## サブコマンド

### 1. 引数なし — ステージ済の変更だけ厳密チェック (PR 直前用)

```bash
bun scripts/architecture-harness.ts --staged --fail-on=error
```

exit code 2 なら invariant 違反あり。markdown レポートが標準出力に出るので、違反箇所と invariant ID を確認してコードを修正する。**設定や invariant を緩める方向の修正は ADR が必要。**

### 2. `full` — リポジトリ全体スキャン (リファクタ後の総点検用)

```bash
bun scripts/architecture-harness.ts --fail-on=warning
```

`--fail-on=warning` で warning 以上を拾う。新規 invariant を追加した直後や、大規模リファクタ後の総点検に使う。

### 3. `why <RULE_ID>` — invariant の意図を表示

`docs/architecture/harness.md` から該当 invariant のセクションを抜き出して表示する。レビュー中に「この invariant は何を守ってるんだっけ?」となったときに使う。

```bash
RULE_ID="$1"
awk -v rule="$RULE_ID" '
  $0 ~ "^- `" rule "`" {found=1; print; next}
  found && /^- `INVARIANT_/ {found=0}
  found {print}
' docs/architecture/harness.md
```

## 違反時の標準フロー

1. レポートで rule ID を確認
2. `/architecture-harness why <RULE_ID>` で意図を再読
3. **コードを修正** (invariant や設定を緩めない)
4. 再度 `/architecture-harness` で違反 0 件を確認
5. invariant が現実と合わなくなった場合は ADR を起こす (`docs/adr/NNNN-...md`)。本スキルで「緩める」判断はしない

## ADR を起こすケース

- ライブラリ更新で旧 invariant の前提が崩れた
- 機能要件の変化で invariant の制約が過剰になった
- 検出ロジックが false positive を量産している

ADR テンプレート: `docs/adr/0000-template.md`

## 関連

- 検出器の本体: `scripts/architecture-harness.ts`
- invariant 正本: `docs/architecture/harness.md`
- フォローアップ管理: `/follow-up` スキル
- PR 直前ゲートの順序: `CLAUDE.md` の「ハーネスとゲート」節
