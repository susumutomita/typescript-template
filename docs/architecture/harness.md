# Architecture Harness

このリポジトリで「セッションが変わっても壊してはいけない原則」を機械可読な ID 付きで固定する正本です。テンプレート利用者は、自分のプロジェクトに合わせて Invariants を追加・調整してください。

## Invariants

- `INVARIANT_NO_NPX`
  パッケージ実行は `nlx` または `bunx` を使う。`npx` を package.json scripts や CI スクリプト、ドキュメントに残さない。
- `INVARIANT_NO_MOCK_DATA`
  `mockData` / `stubApi` / `MOCK_*` などの固定スタブをアプリケーション実装に混ぜない。テストでは Real DB / Real API を使う (`CLAUDE.md` の No Mock 原則と整合)。
- `INVARIANT_HARNESS_DOC_AUTHORITATIVE`
  本ファイル (`docs/architecture/harness.md`) と ADR (`docs/adr/`) の内容を仕様の正本とする。コード変更が invariant に違反する場合は、コードを直すのが第一手で、invariant 緩和は ADR で明示的に supersede する。
- `INVARIANT_PLAN_MD_REQUIRED`
  機能実装前に `Plan.md` を作成して目的・タスク・検証手順を記録する。実装中の進捗ログと振り返りも `Plan.md` に追記する。
- `INVARIANT_FOLLOWUP_TRACKED`
  PR の主目的から外れた発見・改善はその場で実装せず、`/follow-up add` スキルで `.claude/state/follow-ups.jsonl` に記録し、PR 本文の "Known follow-ups" 節 (`/follow-up list-pr-body` で生成) に列挙する。スコープクリープを避け、別 PR で処理する。

## One-Pass Acceptance

- `ONE_PASS_LOCAL`
  代表的な機能を 1 本、データ層 → API → UI → テストまで一気通貫でローカル動作させる。途中の "見た目だけ動く" や "API は通るけど UI 未実装" は完了扱いにしない。詳細は `Plan.md` の「検証手順」に書く。
- `ONE_PASS_CI`
  CI が green になるまで PR は完了扱いにしない。`make before-commit` で通ったものが CI でも通ること。

## Banned Assumptions

- "ローカルで動いた" を完了条件とする運用 (CI green が完了条件)
- リンター設定ファイルを直接編集して問題を消す運用 (コードを直す)
- 主目的と無関係な refactor を同 PR に混ぜる運用 (フォローアップに切る)
- `Plan.md` を作らずに実装を始める運用

## Enforcement

- `bun scripts/architecture-harness.ts --staged --fail-on=error`
- `make before-commit`
- `.claude/settings.json` の hooks (rm -rf 等の危険コマンドブロック、リンター設定編集ブロック、PreCompact 状態保存)

## Harness Commands

- 自分の変更だけ厳密チェック: `bun scripts/architecture-harness.ts --staged --fail-on=error`
- リポジトリ全体スキャン: `bun scripts/architecture-harness.ts`
- PR 直前の総合ゲート: `make before-commit` (詳細は `CLAUDE.md` の「ゲート」)

Git hook と AI エージェント向けガイド (`CLAUDE.md` / `AGENTS.md`) はこの文書を参照して同じ判定に従います。
