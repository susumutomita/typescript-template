# ADR-0005: subagent 定義を frontmatter 検証対象のサプライチェーン成果物として扱う

- **Status**: Accepted
- **Date**: 2026-06-21
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Anthropic のブログ記事「Steering Claude Code」は、subagent を skill・hook・rule と並ぶ統制機構の 1 つに位置づける。本テンプレートでは subagent を `.claude/agents/<name>.md` として定義し、別ユニットで新設する。subagent 定義はモデルのコンテキストへ注入され、専用ツール権限を持って自律的に動く実行可能な指示であり、skill (`.claude/skills/*/SKILL.md`) と同じ攻撃面を持つ。

ADR-0002 で skill とフックを監査対象のサプライチェーン成果物として扱うと決め、`INVARIANT_SKILL_FRONTMATTER_VALID` で frontmatter (`name` / `description`) を機械検証している。subagent はこの検証の対象外であり、ここに穴が残ると、誤った `name` (ファイル名と不一致でリネーム時に静かに壊れる) や曖昧な `description` (誤発火を招く trigger abuse) を派生プロダクトが継承してしまう。本テンプレートは複数プロダクトの土台になるため、subagent も skill と同じ規律で固定する必要がある。

## Decision

`scripts/architecture-harness.ts` に `INVARIANT_AGENT_FRONTMATTER_VALID` を追加し、既存ゲート (`make before-commit` / pre-commit / CI) で常時検査する。検出ロジックは Bun + 標準モジュールのみで完結させ、外部依存は足さない (ADR-0001 の依存ゼロ方針を維持)。

- 対象は `.claude/agents/<name>.md` (直下の `.md` のみ。サブディレクトリは対象外)。
- frontmatter に `name` と `description` を持つことを要求する。
- `name` はファイル名 (拡張子を除く) と一致させる。subagent 名は公開 API でありリネームは breaking change のため、ファイル名と同期させる。`name` 欠落・不一致は error。
- `description` は 50 文字以上 1024 文字以下。50 文字未満は発火条件が曖昧になるため warning、1024 文字超は Claude Code の上限超過のため error。

重大度の方針 (`name` 欠落・不一致と `description` 過長は error、`description` 過短は warning) は `INVARIANT_SKILL_FRONTMATTER_VALID` に倣う。subagent も skill と同じく ADR-0002 の枠組みで「インストール可能な成果物」として扱う。

実装は新しい検証関数 (`checkFrontmatterDoc`) に共通ロジックを集約し、skill 用ルールと agent 用ルールの両方から呼ぶ。skill と agent の差分は「`name` の期待値の出所」(skill はディレクトリ名、agent はファイル名) とメッセージ表示ラベルだけであり、frontmatter パーサ (`parseFrontmatter`) と検証本体を再利用して重複実装を避ける。`.claude/agents/` が存在しないリポジトリでは、ファイルが無いため発火しない (skill 検証と同じ「存在するファイルにのみ発火」する挙動)。

選択肢として skill 用ルールに agent のパスを scope 追加で相乗りさせる案もあったが、`name` の期待値の決め方が異なる (ディレクトリ名 / ファイル名) ため条件分岐が増え、RULE_ID も分けられないことから、共通ロジックを関数に切り出して別 RULE_ID で登録する方を選んだ。これにより `why <RULE_ID>` での意図表示と finding の出力先が skill と agent で明確に分かれる。

## Consequences

- **Good**: subagent の frontmatter 規律 (`name` 一致・`description` 品質) が commit 時に依存追加なしで機械強制される。subagent 一覧の機械可読性が上がり、誤発火やリネーム事故を未然に止める。skill と agent で検証ロジックを共有するため、将来の frontmatter ルール変更が一箇所で済む。
- **Bad**: subagent 定義を追加するたびに `name` とファイル名の一致を強制されるため、命名の自由度が下がる (意図的な制約)。
- **Tradeoff**: `allowed-tools` の過不足や「宣言と実態の乖離」といった意味解析は機械検査が困難なため本 invariant では見ない。ADR-0002 と同様に `/skill-audit` のレビューチェックリストとコードレビューで担保する。subagent 数が増えて手動レビューが追いつかなくなったら、より深い検査の導入を再検討する (その際は ADR で supersede)。

## References

- 関連コード: `scripts/architecture-harness.ts`、`scripts/architecture-harness.test.ts`、`docs/architecture/harness.md`
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)、[ADR-0002](./0002-skill-audit-invariants.md)
- 外部資料: [Anthropic「Steering Claude Code」](https://claude.com/ja/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
