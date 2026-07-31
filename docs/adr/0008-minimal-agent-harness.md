# ADR-0008: Minimal agent harness

- **Status**: Accepted
- **Date**: 2026-08-01
- **Deciders**: Susumu Tomita (`@susumutomita`)

## Context

このテンプレートには、`CLAUDE.md`、`AGENTS.md`、path-scoped rule、Skill、subagent、SessionStart / Stop / PreCompact / PostToolUse hook が重なっていた。多くは過去モデルの失敗を予防する目的で、`Plan.md`、固定開発順序、TDD、日本語 BDD、No Mock、100% coverage、特定 review Skill を全タスクへ要求していた。

これらは安全境界や完了条件ではなく実装方法であり、モデルが改善しても常時コンテキストと介入コストを払い続ける。さらに、設定変更を一律ブロックする hook や編集ごとの formatter は、根本修正や探索を妨げる場合がある。

## Decision

agent harness を「task + guardrails + verifiable completion」へ縮小する。

- `CLAUDE.md` は `AGENTS.md` の import と任意ツールの位置づけだけを持つ。
- `AGENTS.md` は repository boundary、安全、完了コマンドを示し、実装方法を固定しない。
- hook は秘密情報と破壊的 shell command の防御に限定する。
- `Plan.md`、固定 role、特定 Skill、TDD 順序、テスト言語、blanket No Mock を必須条件から外す。
- test、typecheck、harness、CI、preview など、モデルが自分で結果を確認できる検証を優先する。
- 新しい steering は、同じ失敗が繰り返され、既存の検証で防げない証拠がある場合だけ追加する。
- モデルまたは toolchain の世代が変わったら、指示を削除した状態で再評価する。

本 ADR は [ADR-0004](./0004-steering-mechanism-alignment.md) の「Hook へ積極的に寄せる」判断と、[ADR-0003](./0003-quality-first-no-mvp.md) の一律な設計・テスト手順を、この範囲で supersede する。サプライチェーン、秘密情報、破壊操作、required CI の決定論的強制は維持する。

## Consequences

- **Good**: 常時コンテキストが減り、新しいモデルが方法を選べる。安全と品質は test、harness、CI の閉ループで確認できる。
- **Bad**: すべてのタスクが同じ手順を通るという見かけ上の一貫性は失われる。
- **Tradeoff**: 同型の失敗が反復する場合は、再現例と eval を用意したうえで最小の rule または Skill を戻す。推測だけでは戻さない。

## References

- `CLAUDE.md`
- `AGENTS.md`
- `.claude/settings.json`
- `.claude/rules/test-authoring.md`
- `docs/architecture/steering.md`
- `docs/architecture/harness.md`
- `docs/architecture/quality-bar.md`
