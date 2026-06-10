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
