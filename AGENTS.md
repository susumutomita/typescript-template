# AGENTS.md

AI エージェント向けの作業契約です。手順を細かく固定せず、目的、変更境界、検証可能な完了条件を共有します。

## Repository

Bun と TypeScript を使うプロジェクトテンプレートです。既定の構成は Hono、Vite、React、Biome、Bun test です。

```bash
make install
make dev
```

## Working contract

- 依頼、Issue、既存コード、テストから目的と受け入れ条件を把握する。リポジトリから解決できる曖昧さは自分で調べる。
- 変更前に関連実装、共有 helper、履歴、既存テストを検索する。新しい仕組みを足す前に、削除または既存機構の再利用を検討する。
- 方法はタスクに合わせて選ぶ。`Plan.md`、専用 Skill、固定 role、固定人数の subagent、文書先行、TDD の順序は必須ではない。
- 最小の差分ではなく、最小の一貫した working increment を作る。利用者から観測できない scaffolding だけを完了としない。
- 複雑な課題では複数案を比較してよい。単純な修正を儀式や multi-agent 化で膨らませない。
- 作業途中で承認待ちにしない。不可逆な判断または外部副作用を除き、実装、検証、PR まで進める。

## Guardrails

- `.env`、秘密情報、認証情報を読み書きしない。
- production deploy、release、データ削除、force-push、保護ブランチへの直接 push などの不可逆操作は、明示的な承認なしに行わない。
- チェックを通すためだけにテスト、型、lint、harness、設定を弱めない。設定自体が根本原因なら、理由と検証を伴って変更してよい。
- エラーを空値、固定データ、偽の成功へ変換して隠さない。
- 依存関係、GitHub Actions、`.claude/` の変更はサプライチェーン境界として扱う。

## Verification

モデルが自分で成否を判定できる検証手段を先に見つける。テスト、型検査、実行結果、スクリーンショット比較、再現手順など、変更に最も近い証拠を使う。

- unit、integration、end-to-end、preview をリスクに応じて組み合わせる。
- 外部 API、時刻、ファイル、プロセスなど不安定な境界では test double を使ってよい。production code に暗黙の mock fallback を入れない。
- バグ修正は失敗を再現し、修正後に同じ経路で消えたことを確認する。
- 重複した低価値テストを増やすより、受け入れ条件と失敗モードを直接検証する。

PR 前の標準ゲート:

```bash
make before-commit
```

依存、CI、harness、lockfile を変更した場合、または CI と同じ検査が必要な場合:

```bash
make ci_local
```

PR 本文には変更内容、実行した検証、残るリスクまたは未検証事項を書く。Skill による review は必要なときだけ追加し、決定論的ゲートの代わりにしない。

## Sources of truth

- 判断原則: [`docs/architecture/principles.md`](./docs/architecture/principles.md)
- 機械強制: [`docs/architecture/enforcement-registry.md`](./docs/architecture/enforcement-registry.md)
- harness: [`docs/architecture/harness.md`](./docs/architecture/harness.md)
- steering の配置基準: [`docs/architecture/steering.md`](./docs/architecture/steering.md)
