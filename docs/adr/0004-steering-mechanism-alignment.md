# ADR-0004: 統制機構の役割分担を明文化する

- **Status**: Accepted
- **Date**: 2026-06-21
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

本テンプレートには Claude Code を統制する機構が複数ある。Hook（`.claude/settings.json`・`.claude/scripts/*.sh`）、常時ロードのドキュメント（`CLAUDE.md` / `AGENTS.md`）、Skill（`.claude/skills/*/SKILL.md`）、Subagent（`/feature` フェーズ 4 の 5 役割並列起動）、path-scoped Rule（`.claude/rules/*.md`）、決定論的 harness（`scripts/architecture-harness.ts`）である。実体は出揃っているが、「ある統制をどの機構に置くべきか」を判断する基準を書いた設計ドキュメントが無かった。基準が無いと、機械で止められる禁止が散文の「お願い」に流れ、パス固有のルールが常時ロードの `CLAUDE.md` に積まれて文脈を薄める。Anthropic の記事「Steering Claude Code: skills, hooks, rules, subagents, and more」は機構ごとの配分原則を示しており、本テンプレートの実体にこれをマッピングして配分の正本を残す必要があった。

## Decision

`docs/architecture/steering.md` を機構配分の正本として新設する。判断フロー・対応表・早見表・アンチパターンの 4 節で構成し、各機構が本リポジトリのどこに実装されているかを紐づける。配分の基幹原則は「常時かつ決定論的なら Hook / harness、常時ドキュメントなら CLAUDE.md、手順なら Skill、並列隔離なら Subagent、特定パスなら path-scoped Rule」である。迷ったら「機械で守れるか」を先に問い、守れるものは harness か Hook に寄せて文章は薄く保つ。

複数の代替案を検討した。第一案は記事の原則を `CLAUDE.md` に数行で足すだけにする軽量案だが、`CLAUDE.md` は常時ロードであり、機構選定のような「実装時に参照すれば足る知識」を常駐させると owner が把握すべき骨子が薄まる。本テンプレートが避けたいアンチパターンそのものを犯すため不採用とした。第二案は新しい harness invariant として機械強制する案だが、「どの機構に置くか」は設計判断であり真偽で機械判定できない。検出ロジックを書けないため不採用とした。採用案は設計ドキュメント（`docs/architecture/steering.md`）に正本を置き、判断記録を本 ADR に残す構成である。これは `harness.md`（やってはいけないこと）と `quality-bar.md`（満たすべき品質）を分けた既存の設計ドキュメント運用と一貫する。

本 ADR では機構の追加や invariant の変更は行わない。既存の実体に対する配分基準の明文化に限る。将来 `.claude/agents/*.md` の専用 Subagent 定義を導入する場合や、新しい統制機構を足す場合は、`steering.md` の対応表を更新し、必要なら新しい ADR で本 ADR を supersede する。

## Consequences

- **Good**: 新しい統制を足すときの置き場所が判断フローと早見表で一意に決まり、機構の取り違えが減る。機械で守れる禁止を harness / Hook に寄せる原則が明文化され、常時ロード文脈の肥大を防げる。記事の配分原則が本テンプレートの実体に紐づき、外部知識と内部実装の対応が追える。
- **Bad**: 統制機構を変更するたびに `steering.md` の対応表を更新する保守コストが生じる。対応表が実体とずれると、かえって誤った置き場所へ誘導する危険がある。
- **Tradeoff**: 機構選定を機械強制せず設計ドキュメントとレビューに委ねた。真偽判定できないため harness には載せられないが、その分ドキュメントの陳腐化リスクを負う。再検討のトリガーは、対応表と実体の乖離が常態化する場合、または新しい統制機構（専用 Subagent 定義など）を導入して配分原則自体を見直す場合で、そのときは別 ADR で supersede する。

## References

- 関連ドキュメント: `docs/architecture/steering.md`, `docs/architecture/harness.md`, `docs/architecture/quality-bar.md`
- 関連コード: `scripts/architecture-harness.ts`, `.claude/settings.json`, `.claude/skills/feature/SKILL.md`, `.claude/rules/quality-bar.md`, `.claude/rules/skill-authoring.md`
- 関連 ADR: [ADR-0002](./0002-skill-audit-invariants.md), [ADR-0003](./0003-quality-first-no-mvp.md)
- 外部資料: Anthropic, Steering Claude Code: skills, hooks, rules, subagents, and more, https://claude.com/ja/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
