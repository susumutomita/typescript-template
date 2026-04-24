# CLAUDE.md

## ツールスタック

- ランタイム/パッケージマネージャー: Bun
- バックエンド: Hono
- フロントエンド: Vite + React
- リンター/フォーマッター: Biome（設定は `biome.json`）
- テスト: `bun test`
- パッケージ操作: ni（`nr` = run, `ni` = install, `nlx` = exec）

## 機能開発フロー（必須）

新機能を実装するときは **必ず `/feature` スキルを使う**。直接実装を開始することを禁止する。

```
/feature
```

フロー: ヒアリング（AskUserQuestion）→ 仕様書承認 → Issue 作成 → 5 役割並列実装（PM / Designer / Developer / QA / User）→ 統合 → PR

## 実装原則

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

### PR 作成前の必須ゲート（この順序で実行）

```bash
bun scripts/architecture-harness.ts --staged --fail-on=error   # 1. invariant 違反検出
make before-commit                                              # 2. lint / typecheck / test / build
/review                                                         # 3. コードレビュー
/security-review                                                # 4. セキュリティレビュー
/simplify                                                       # 5. 重複・品質・効率の最終チェック
```

すべて通るまで未完了。失敗したら原因を特定してコードを修正する（設定ファイルや invariant を変更しない）。

### 作業順序

新規機能を追加する前に、以下を先に実施する。

1. **ドキュメント更新** — 変更に関連する `docs/`、ADR、`CLAUDE.md` を先に更新する。
2. **リファクタリング** — 既存の技術的負債を先に解消する。
3. **機能追加** — 上 2 つが終わってから着手する。

## フォローアップタスクの扱い

PR 作業中に scope 外の発見・改善・技術的負債を見つけたとき、その場で実装する誘惑がスコープクリープを生む。以下のルールで運用する。

- その場で実装しない。**`/follow-up add <タイトル>`** で `.claude/state/follow-ups.jsonl` に記録する。
- 同時に TodoWrite/TaskCreate で `[フォローアップ]` プレフィックス付きタスクも作る (今セッション内のリマインダー用)。
- PR 作成時に **`/follow-up list-pr-body`** で出力される markdown を PR 本文の「Known follow-ups」節に貼る。
- フォローアップは原則 **別 PR** で処理する。同 PR で前倒し処理するのは「現在の PR が CI 等で詰まる原因になっている」場合のみ許可。
- 別 PR で解消したら **`/follow-up resolve <id> <pr-url>`** で記録する。

セッション開始時に未処理フォローアップが残っていれば `.claude/scripts/follow-up-reminder.sh` (SessionStart hook) が件数を Claude に通知する。コミット直前の Stop hook (`.claude/scripts/stop-gate-reminder.sh`) もゲートとフォローアップの確認を促す。

> 例: PR で SBT アダプタを直していたら旧 CDK スタックがデッドコードと判明 → `/follow-up add 旧 CDK 削除` で記録 → 同 PR では修正のみコミット → 別 PR で旧 CDK を消したら `/follow-up resolve <id> <pr-url>` で完了マーク。

## ADR（Architecture Decision Records）

設計判断は `docs/adr/` に ADR として記録する。

- ファイル名: `NNNN-タイトル.md`（例: `0001-biome-を採用.md`）。
- テンプレート: [`docs/adr/0000-template.md`](./docs/adr/0000-template.md)。
- ステータス: Accepted / Superseded / Deprecated。
- ADR は不変。変更する場合は新しい ADR で Supersede する。
- リンタールールを追加したら対応する ADR を参照すること。
- harness invariant の追加・緩和も ADR で記録する。

## 品質ゲート（個別コマンド）

タスク完了前に全て Green にする。`make before-commit` がこれらを順に実行する。

```bash
nr lint       # biome check
nr typecheck  # tsc --noEmit
nr test       # bun test
nr build
```

## Git・CI ルール

- Conventional Commits 形式でコミットする。
- Issue は `#番号` ではなくフル URL か `Issue 番号` で記述する（自動クローズ防止）。
- CI が Green になるまで次に進まない。
- `gh pr diff` でセルフレビューしてから人間にレビューを依頼する。

## ドキュメント規則

- 文末は「。」で終える。
- 日本語と半角英数字の間に半角スペースを入れる。
- 絵文字と太字の併用を避ける。
- textlint はセーフティネット。執筆時点でルールを意識してエラーを作らない。

## コンパクション指示

コンテキスト圧縮時に以下を必ず保持すること。

- 変更済みファイルの一覧。
- 現在のブランチ名と作業中の Issue 番号。
- Plan.md の目的とタスク進捗。
- 未完了のフォローアップタスク（TodoWrite/TaskCreate のうち `[フォローアップ]` 付きのもの）。

## 禁止事項

- `rm` コマンド使用禁止（ファイル削除はユーザーに依頼するか `git rm` を使う）。
- `npx` 使用禁止（`bunx` または `nlx` を使う。`scripts/architecture-harness.ts` で検出）。
- モックデータ・スタブ API の使用禁止（`scripts/architecture-harness.ts` で検出）。
- 設定ファイル（`biome.json` 等）の直接編集禁止（hook で deny される。コードを修正する）。
- `it.only` / `describe.only` / `xit` / `xdescribe` をコミットに残さない（`scripts/architecture-harness.ts` で検出）。
- コミット・PR での `#番号` 形式の Issue 引用禁止（自動クローズ防止）。
