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
- `INVARIANT_INSTALL_IGNORE_SCRIPTS`
  Makefile / CI / シェル / Dockerfile に書かれる `bun|npm|pnpm|yarn` の `install` / `add` / `i` / `ci` / `a` コマンドは必ず `--ignore-scripts` を付ける。`bun add` のような単発インストールも同じ侵入経路になるため対象に含める。Shai-Hulud 系の `prepare` 経由コード実行を一段目で封じる。
- `INVARIANT_NO_GIT_DEPENDENCY`
  `package.json` の `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` は npm レジストリ semver のみ。`git+`, `github:`, `gitlab:`, `http(s)://` 等の URL 参照は禁止。Mini Shai-Hulud 2nd は `optionalDependencies` + GitHub URL で侵入するため入口を塞ぐ。
- `INVARIANT_LIFECYCLE_HOOK_SCOPED`
  `package.json` の `preinstall` / `install` / `postinstall` / `prepare` 等の lifecycle hook は `husky` のような許可リスト内コマンドのみ。任意処理は別 script に分け、必要なときだけ手で実行する。
- `INVARIANT_NO_KNOWN_IOC`
  Shai-Hulud 系で観測された IOC (`tanstack_runner.js`, `router_init.js`, `gh-token-monitor.*`, `com.user.gh-token-monitor.plist`, `.claude/setup.mjs`, `.vscode/setup.mjs`, `codeql_analysis.yml` 等) のファイル名がコミットに含まれたら error で止める。
- `INVARIANT_LOCKFILE_NO_GIT_RESOLUTION`
  `bun.lock` / `package-lock.json` / `pnpm-lock.yaml` などのロックファイルに git / github で解決された依存が無いことを保証する。`bun.lockb` (バイナリ) は静的検査困難として警告。
- `INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT`
  `bunfig.toml` に `trustedDependencies = []` が明示されていることを確認する。Bun が暗黙信頼する「top 500 npm パッケージ」の lifecycle script をゼロにする。`.npmrc` は Bun が読まないため意図的に置かない (security theater の排除)。詳細は [ADR-0001](../adr/0001-supply-chain-hardening.md) を参照。
- `INVARIANT_SKILL_FRONTMATTER_VALID`
  `.claude/skills/<dir>/SKILL.md` は YAML frontmatter に `name` と `description` を持ち、`name` はディレクトリ名と一致させる (スキル名は公開 API。リネームは breaking change)。`description` は 50 文字以上 1024 文字以下で、トリガー語彙と「いつ使うか」を明示する。曖昧な description はスキルの誤発火 (trigger abuse) を招くため warning で検出する。詳細は [ADR-0002](../adr/0002-skill-audit-invariants.md) を参照。
- `INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS`
  `.claude/` 配下の全ファイルに、ゼロ幅/双方向 Unicode 制御文字や 120 文字以上の base64 ブロックを混入させない (error)。markdown では HTML コメントも隠し prompt injection のチャネルになりうるため warning。スキル・フックはモデルのコンテキストに注入される成果物であり、サプライチェーンの一部として扱う。
- `INVARIANT_SKILL_NO_EXFIL_EXEC`
  `.claude/skills/`、`.claude/scripts/`、`.claude/rules/`、`.claude/settings.json` に、リモート取得をシェルへパイプする実行、base64 デコードの実行、`eval` や `sh -c` とコマンド置換でリモート取得結果を実行するパターンを置かない。サードパーティスキルの導入前検査は `/skill-audit` スキル (`--skills-only` モード) で行う。
- `INVARIANT_NO_MVP_PLACEHOLDER`
  `packages/` / `src/` / `scripts/` のアプリ・ツール実装に、手抜き・未完成の客観的シグナルを残さない (error)。対象はコメント内の作業中マーカー (TODO / FIXME / HACK / XXX、大小無視) と `not implemented` / `unimplemented` 系の throw。やり残しは `/follow-up` に切るか、その場で完了させる。役割分担: 空 catch は Biome の `noEmptyBlockStatements`、`any` は `noExplicitAny` が AST で拾う (linter で取れるものは linter に任せ、harness は linter に対応ルールが無いものだけを見る)。MVP を完了条件にしない原則 ([quality-bar.md](./quality-bar.md)) の機械的な裏打ち。
- `INVARIANT_NO_TYPE_ESCAPE_HATCH`
  `packages/` / `src/` / `scripts/` の TypeScript に、Biome が拾わない型エスケープを残さない (error)。対象は `as unknown as` の二段キャストと `@ts-nocheck` / `@ts-expect-error`。型を回避せず、外部入力は境界で検証して内部では検証済みの型だけを扱う。`any` / `as any` は Biome `noExplicitAny`、`@ts-ignore` は Biome `noTsIgnore` が担当する。

## Definition of Done

完了の正本は [quality-bar.md](./quality-bar.md)。harness が「やってはいけないこと」を機械で止めるのに対し、quality-bar.md は「満たすべき品質」を定義する。本 harness のゲートを全て通すことは完了の必要条件であって十分条件ではない。設計の良し悪し・代替案検討・命名・エッジケースの網羅など機械化できない品質は、設計ゲートと `/review` で担保する。根拠は [ADR-0003](../adr/0003-quality-first-no-mvp.md)。

## One-Pass Acceptance

- `ONE_PASS_LOCAL`
  代表的な機能を 1 本、データ層 → API → UI → テストまで一気通貫でローカル動作させる。途中の "見た目だけ動く" や "API は通るけど UI 未実装" は完了扱いにしない。詳細は `Plan.md` の「検証手順」に書く。
- `ONE_PASS_CI`
  CI が green になるまで PR は完了扱いにしない。`make before-commit` で通ったものが CI でも通ること。

## Banned Assumptions

- "ローカルで動いた" を完了条件とする運用 (CI green が完了条件)
- "とりあえず動く MVP" を完了条件とする運用 (Definition of Done を満たして完了。[quality-bar.md](./quality-bar.md))
- 最初に動いた構造をそのまま出荷する運用 (代替案を検討した最善の構造を選ぶ。設計ゲート)
- "シンプル" を "小さく速い手抜き" と取り違える運用 (シンプルさは考え抜いた構成の結果)
- リンター設定ファイルを直接編集して問題を消す運用 (コードを直す。ただし品質バーを上げる強化は ADR で許可)
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
