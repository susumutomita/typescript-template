# AGENTS.md

AI エージェント (Claude Code, Codex 等) 向けの共通作業ガイド。Claude Code は `CLAUDE.md` がこのファイルを import して読み込む。

## ツールスタック

| 用途 | ツール |
| --- | --- |
| ランタイム/パッケージマネージャー | Bun |
| バックエンド | Hono |
| フロントエンド | Vite + React |
| リンター/フォーマッター | Biome (`biome.json`) |
| テスト | `bun test` |
| パッケージ操作 | ni (`nr` = run, `ni` = install, `nlx` = exec) |

## セットアップ

```bash
make install      # 依存関係インストール（Bun、--ignore-scripts）
make dev          # 開発サーバ起動
```

## 品質ゲート (PR 作成前に必須、この順序で)

```bash
bun scripts/architecture-harness.ts --staged --fail-on=error
make before-commit              # architecture-harness + harness_test + lint_text + lint
/review                         # コードレビュー
/security-review                # セキュリティレビュー
/simplify                       # 重複・品質・効率
```

**すべて通らない限りタスクは未完了。** 失敗したらコードを修正する（設定ファイルや invariant を変えない）。`.claude/` 配下（スキル・フック・設定）を変更した PR では、加えて `/skill-audit` の Quick Workflow を通す。

ゲート緑は必要条件であって完了条件ではない。完了の正本は [`docs/architecture/quality-bar.md`](docs/architecture/quality-bar.md) の Definition of Done。MVP は完了ではない。

## 作業順序（厳守）

1. **ドキュメント更新** — 関連する docs/、ADR、CLAUDE.md を先に更新する。
2. **リファクタリング** — 既存の技術的負債を先に解消する。
3. **機能追加** — 上 2 つが終わってから着手する。

ハーネス invariant の正本は [`docs/architecture/harness.md`](./docs/architecture/harness.md)。`Codex` と `Claude Code` のどちらでも、この script を通らない変更は未完了として扱う。

## フォローアップタスクの扱い

PR 作業中に scope 外の発見をしたら、その場で実装しない。

1. **`/follow-up add <タイトル>`** スキルで `.claude/state/follow-ups.jsonl` に記録する。
2. TodoWrite/TaskCreate で `[フォローアップ]` プレフィックス付きタスクも作る。
3. PR 作成時に **`/follow-up list-pr-body`** の出力を PR 本文の「Known follow-ups」節に貼る。
4. 別 PR で処理する。解消したら **`/follow-up resolve <id> <pr-url>`** で記録。

scope 外の修正を同 PR に混ぜることは「現在の PR が CI で詰まる原因になっている」場合のみ許可する。

セッション開始時 (SessionStart hook) と作業終了時 (Stop hook) に、未処理フォローアップ件数とゲート確認を Claude に通知する仕組みが入っている (`.claude/scripts/{follow-up,stop-gate}-reminder.sh`)。

## コマンド一覧

| コマンド | 用途 |
| --- | --- |
| `ni` | 依存関係インストール |
| `nr dev` | 開発サーバ起動 |
| `nr test` | テスト実行 |
| `nr typecheck` | TypeScript 型チェック |
| `nr build` | プロダクションビルド |
| `make before-commit` | 品質ゲート一括 |
| `make harness_test` | harness 検出ロジックのテスト |
| `bun scripts/architecture-harness.ts` | invariant スキャン (全件) |
| `bun scripts/architecture-harness.ts --staged --fail-on=error` | ステージ済変更のみ |

## 制約 (破ったら即修正)

- **`npx` 禁止** → `bunx` または `nlx` を使う (`INVARIANT_NO_NPX`)
- **`rm` コマンド禁止** → `git rm` または手で削除依頼
- **モックデータ・スタブ API 禁止** → Real DB / Real API を使う (`INVARIANT_NO_MOCK_DATA`)
- **MVP・仮実装で完了としない** → 作業中マーカー・未実装 throw を残さない (`INVARIANT_NO_MVP_PLACEHOLDER`)。空 catch と `any` は Biome が拾う
- **型エスケープ禁止** → `as unknown as`・`@ts-nocheck`・`@ts-expect-error` に逃げない (`INVARIANT_NO_TYPE_ESCAPE_HATCH`)。`as any`・`@ts-ignore` は Biome が拾う
- **`it.only` / `describe.only` / `xit` / `xdescribe` 禁止** → コミット前に外す (`INVARIANT_NO_TEST_FOCUS`)
- **設定ファイル (biome.json 等) を問題隠しで編集しない** → コードを直す（品質バーを上げる強化は ADR で許可）
- **スキル・フックに隠し指示・危険実行パターンを置かない** (`INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS` / `INVARIANT_SKILL_NO_EXFIL_EXEC`)
- **テストタイトルは日本語 BDD スタイル**
- **Conventional Commits**
- **Issue は `#番号` 引用禁止** → フル URL か `Issue 番号` で記述

## スキルの書き方（authoring 規律）

`.claude/skills/<dir>/SKILL.md` は `INVARIANT_SKILL_FRONTMATTER_VALID` で機械検証される。詳細は [`docs/adr/0002-skill-audit-invariants.md`](./docs/adr/0002-skill-audit-invariants.md)。

- frontmatter の `name` はディレクトリ名と一致させる。スキル名は公開 API でありリネームは breaking change。
- `description` は発火条件の正本。対象・サブコマンド・「いつ使うか」をトリガー語彙として 50 文字以上 1024 文字以下で書く。
- `allowed-tools` は本体が実際に使う最小セットを宣言する（過剰・過少どちらも `/skill-audit` で直す）。
- 引数を取るスキルは `argument-hint` を書く。ユーザー専用スキルは `disable-model-invocation: true` を付ける。
- サードパーティスキルは `.claude/skills/` に入れる前に `/skill-audit pre-install` で検査する。

## ADR

設計判断は `docs/adr/NNNN-タイトル.md` に記録する。テンプレートは [`docs/adr/0000-template.md`](./docs/adr/0000-template.md)。

- ADR は不変。変更は新しい ADR で Supersede する。
- harness invariant の追加・緩和も ADR で残す。

## ハーネスの拡張

- 新しい invariant を追加するときは `docs/architecture/harness.md` に文章で書き、可能なら `scripts/architecture-harness.ts` の `RULES` / `REPO_CHECKS` に検出ロジックを足す。検出ロジックには `scripts/architecture-harness.test.ts` のテストを添える。
- 検出が困難な invariant はコードレビューで担保する旨を invariant 説明に書く。
- invariant の緩和・廃止には ADR が必要。
