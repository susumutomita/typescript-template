# Architecture Harness

architecture harness は、リポジトリ状態に対して決定論的に判定できる契約だけを機械強制します。エージェントの思考手順や作業儀式を規定するものではありません。

## Scope

主な検査対象は次です。

- dependency lifecycle、lockfile、GitHub Actions pinning などのサプライチェーン境界。
- focused test、型エスケープ、未実装 marker などのコミット可能な客観的シグナル。
- `.claude/` の frontmatter、隠し instruction、remote execution pattern。
- 公開 UI の metadata、外部リンク、画像代替テキストなどの pre-release 条件。

実装と検出テストは `scripts/architecture-harness.ts`、`scripts/architecture-harness.test.ts`、`scripts/pre-release-rules.ts` にあります。人間向けの索引は [`enforcement-registry.md`](./enforcement-registry.md) です。

## Deliberately not enforced

次は harness invariant ではありません。

- `Plan.md`、Issue、設計文書の作成。
- 固定の docs → refactor → feature 順序。
- TDD の実行順序、テストタイトルの言語、blanket No Mock。
- 特定 Skill、review、subagent、固定人数の role play。
- SessionStart、Stop、PreCompact での reminder。

これらはタスクに必要な場合だけ選択します。完了は [`quality-bar.md`](./quality-bar.md) と受け入れ条件で判定します。

## Commands

ステージ済み差分を含む通常ゲート:

```bash
make before-commit
```

CI と同じ全件検査:

```bash
make ci_local
```

harness 単体:

```bash
bun scripts/architecture-harness.ts --fail-on=error
bun test scripts/architecture-harness.test.ts
```

## Rule lifecycle

新しい rule は、繰り返し観測した失敗、低誤検知の決定論的判定、修正可能なメッセージ、検出器テストを必要とします。

モデル、ランタイム、linter、CI が改善し rule が冗長になった場合は削除します。既存 rule を残すこと自体を目的にしません。例外または scope 変更では、実装、テスト、registry、必要な ADR を同じ PR で更新します。

違反時はまず成果物を直します。ただし rule の誤検知または前提の陳腐化が証拠で示せる場合、設定を触らないという形式的な禁止に従わず、rule 自体を修正または削除します。
