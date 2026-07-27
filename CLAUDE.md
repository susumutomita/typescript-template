# CLAUDE.md

Owner: リポジトリメンテナ（変更は PR レビュー必須）。常時ロードする文脈を希少資源として扱い、200 行未満を維持する。

共通の作業ガイド（ツールスタック、品質ゲート、作業順序、フォローアップ、制約、スキル authoring 規律、ADR）は AGENTS.md を正本とし、ここに import する。

@AGENTS.md

以下は Claude Code 固有の運用ルール。

## 機能開発フロー（必須）

複数の設計案、レイヤー、失敗仮説を含む新機能は **必ず `/feature` スキルを使う**。直接実装を開始しない。

```text
/feature
```

`/feature` は固定人数・固定役割を起動する手順ではない。問題の形式化、独立した approach family の探索、証拠と exact gap の管理、敵対的監査、TDD 実装、完了監査を課題の複雑度に応じて動的に構成する。

単純で正解が明確な修正を無理に multi-agent 化しない。複雑な変更を一つの有力案へ早期収束させない。

## 実装原則

判断原則の正本は [`docs/architecture/principles.md`](./docs/architecture/principles.md)、機械強制の索引は [`docs/architecture/enforcement-registry.md`](./docs/architecture/enforcement-registry.md) とする。

- **証拠を確信より優先する**: テスト、型検査、実行、計測、再現、反例で示す。「動くはず」を完了根拠にしない。
- **品質ファースト**: MVP は完了条件ではない。プロがそのまま使える品質で初回から出す。正本は [`docs/architecture/quality-bar.md`](./docs/architecture/quality-bar.md)（根拠 [ADR-0003](./docs/adr/0003-quality-first-no-mvp.md)）。
- **設計ゲート**: 実装前に設計を残す（新機能は `docs/design/`、小変更は Plan.md）。代替案、選定理由、エッジケース、残存 gap を明示する。
- **TDD**: テストを先に書く（Red → Green → Refactor）。カバレッジ 100% を維持する。
- **BDD スタイル**: `describe` / `it` を日本語で記述し、振る舞いを表現する。
- **No Mock**: 実際の DB、API、ファイル I/O を使う。モックデータ、スタブ API 禁止。
- **フルスタック一気通貫**: 新機能は必要なデータモデル、API、フロント、エラー処理、テストを working increment としてまとめる。
- **Plan.md 運用**: 実装前に計画を作成し、進捗ログ、Approach Registry、振り返りを記録する（削除禁止）。

## Plan.md の構成

```text
### [機能名] - [日付]
目的 / 制約 / 受け入れ条件 / 非目標 / Approach Registry / タスク / 検証手順 / 進捗ログ / 振り返り
```

## ハーネスとゲート

アーキテクチャ invariant の正本は [`docs/architecture/harness.md`](./docs/architecture/harness.md) です。コード変更が invariant に違反する場合は、コードを直すのが第一手で、invariant 緩和は ADR で明示的に supersede します。

PR 作成前の必須ゲート（順序・コマンドは AGENTS.md の「品質ゲート」を正本とする）。すべて通るまで未完了。失敗したら原因を特定してコードを修正する（設定ファイルや invariant を変更しない）。

## プロジェクトスキル

| スキル | 用途 |
| --- | --- |
| `/feature` | 適応型の機能開発オーケストレーション（複雑な新機能の必須経路） |
| `/architecture-harness` | invariant の機械検証と `why <RULE_ID>` での意図表示 |
| `/skill-audit` | スキル、hook、設定の監査。`.claude/` を変更したら必須 |
| `/follow-up` | scope 外発見の記録、解消管理 |
| `/init-project` | 初回スキャフォールド（ユーザー専用） |
| `/frontend-design` | 高品質なフロントエンド実装 |

スキルの書き方は AGENTS.md の「スキルの書き方」を正本とし、`.claude/rules/skill-authoring.md` が `.claude/skills/` 配下の作業時に自動で読み込まれる。

subagent は専用コンテキストで独立した作業を行う。コードレビュー用 [`.claude/agents/code-reviewer.md`](./.claude/agents/code-reviewer.md)、デバッグ用 [`.claude/agents/debugger.md`](./.claude/agents/debugger.md)、候補案を壊す [`.claude/agents/adversarial-auditor.md`](./.claude/agents/adversarial-auditor.md) を用途に応じて使う。

## AI 機能を実装するときのモデル指針

- Claude モデルを使う実装では最新世代を既定にする。
- モデル ID をコードに直書きせず、設定または環境変数に切り出す。
- 選定、移行の根拠はモデル世代が変わるたびに ADR で残す。

## ドキュメント規則

文体規則は path-scoped rule [`.claude/rules/doc-style.md`](./.claude/rules/doc-style.md) を正本とし、Markdown 編集時に自動で読み込まれる。textlint はセーフティネットであり、執筆時点でエラーを作らない。

## steering 機構の使い分け

CLAUDE.md、skill、hook、path-scoped rule、subagent、決定論的 harness の役割分担は [`docs/architecture/steering.md`](./docs/architecture/steering.md) を正本とする。

判断が必要なものは principle、真偽を機械判定できるものは enforcement、状況依存の手順は Skill、独立探索と敵対的監査は Subagent に置く。

## コンパクション指示

コンテキスト圧縮時に以下を必ず保持すること。

- 変更済みファイルの一覧。
- 現在のブランチ名と作業中の Issue 番号。
- Plan.md の目的、受け入れ条件、Approach Registry の状態、タスク進捗。
- 未完了のフォローアップタスク。
- blocked approach の exact gap と retry condition。

## 禁止事項

禁止事項の正本は AGENTS.md の「制約」。重複定義による drift を避けるため、ここには再掲しない。
