# CLAUDE.md

Owner: リポジトリメンテナ（変更は PR レビュー必須）。記事「Steering Claude Code」の推奨に従い 200 行未満を維持する。

共通の作業ガイド（ツールスタック、品質ゲート、作業順序、フォローアップ、制約、スキル authoring 規律、ADR）は AGENTS.md を正本とし、ここに import する。

@AGENTS.md

以下は Claude Code 固有の運用ルール。

## 機能開発フロー（必須）

新機能を実装するときは **必ず `/feature` スキルを使う**。直接実装を開始することを禁止する。

```
/feature
```

フロー: ヒアリング（AskUserQuestion）→ 仕様書承認 → Issue 作成 → 5 役割並列実装（PM / Designer / Developer / QA / User）→ 統合 → PR

## 実装原則

- **品質ファースト**: MVP は完了条件ではない。プロがそのまま使える品質で初回から出す。シンプルさは手抜きではなく、考え抜いた最善の構成が結果そう見えること。正本は [`docs/architecture/quality-bar.md`](./docs/architecture/quality-bar.md)（根拠 [ADR-0003](./docs/adr/0003-quality-first-no-mvp.md)）。
- **設計ゲート**: 実装前に設計を残す（新機能は `docs/design/`、小変更は Plan.md）。代替案・選定理由・エッジケース。最初に動いた構造を採用しない。
- **TDD**: テストを先に書く（Red → Green → Refactor）。カバレッジ 100% を維持する。
- **BDD スタイル**: `describe`/`it` を日本語で記述し、振る舞いを表現する。
- **No Mock**: 実際の DB・API・ファイル I/O を使う。モックデータ・スタブ API 禁止。
- **フルスタック一気通貫**: 新機能はデータモデル・API・フロント・テストをまとめて実装する。
- **Plan.md 運用**: 実装前に計画を作成し、進捗ログと振り返りを記録する（削除禁止）。

## Plan.md の構成

```
### [機能名] - [日付]
目的 / 制約 / タスク / 検証手順 / 進捗ログ / 振り返り（問題・根本原因・予防策）
```

## ハーネスとゲート

アーキテクチャ原則の正本は [`docs/architecture/harness.md`](./docs/architecture/harness.md) です。コード変更が invariant に違反する場合は、コードを直すのが第一手で、invariant 緩和は ADR で明示的に supersede します。

PR 作成前の必須ゲート（順序・コマンドは AGENTS.md の「品質ゲート」を正本とする）。すべて通るまで未完了。失敗したら原因を特定してコードを修正する（設定ファイルや invariant を変更しない）。

## プロジェクトスキル

| スキル | 用途 |
| --- | --- |
| `/feature` | 新機能開発のオーケストレーション（必須経路） |
| `/architecture-harness` | invariant の機械検証と `why <RULE_ID>` での意図表示 |
| `/skill-audit` | スキル・フック・設定の監査。`.claude/` を変更したら必須 |
| `/follow-up` | scope 外発見の記録・解消管理 |
| `/init-project` | 初回スキャフォールド（ユーザー専用） |
| `/frontend-design` | 高品質なフロントエンド実装 |

スキルの書き方は AGENTS.md の「スキルの書き方」を正本とし、`.claude/rules/skill-authoring.md`（path-scoped rule）が `.claude/skills/` 配下の作業時に自動で読み込まれる。

同梱の subagent として、コードレビュー用の [`.claude/agents/code-reviewer.md`](./.claude/agents/code-reviewer.md) とデバッグ用の [`.claude/agents/debugger.md`](./.claude/agents/debugger.md) を用意する。それぞれ専用コンテキストでレビュー・障害調査を担う。

## AI 機能を実装するときのモデル指針

- Claude モデルを使う実装では最新世代を既定にする（2026-06 時点: `claude-fable-5` / `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5`）。
- モデル ID をコードに直書きせず、設定または環境変数に切り出す。
- 選定・移行の根拠はモデル世代が変わるたびに ADR で残す。

## ドキュメント規則

文体規則（文末「。」・日本語と半角英数字の間の半角スペース・絵文字と太字の併用回避）は path-scoped rule [`.claude/rules/doc-style.md`](./.claude/rules/doc-style.md) を正本とし、Markdown 編集時に自動で読み込まれる。textlint はセーフティネットであり、執筆時点で意識してエラーを作らない。

## steering 機構の使い分け

CLAUDE.md・skill・hook・path-scoped rule・subagent の役割分担と使い分けは [`docs/architecture/steering.md`](./docs/architecture/steering.md) を正本とする。常時ロードのコンテキストは軽く保ち、パス固有の規則は rule へ寄せる。

## コンパクション指示

コンテキスト圧縮時に以下を必ず保持すること。

- 変更済みファイルの一覧。
- 現在のブランチ名と作業中の Issue 番号。
- Plan.md の目的とタスク進捗。
- 未完了のフォローアップタスク（TodoWrite/TaskCreate のうち `[フォローアップ]` 付きのもの）。

## 禁止事項

禁止事項の正本は AGENTS.md の「制約 (破ったら即修正)」。重複定義による drift を避けるため、ここには再掲しない。
