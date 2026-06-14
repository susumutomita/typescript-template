# typescript-template

TypeScript + Bun + Biome を使った Claude Code 向けモノレポテンプレート。

## ツールスタック

| 用途 | ツール |
|------|--------|
| ランタイム | Bun |
| バックエンド | Hono |
| フロントエンド | Vite + React |
| リンター/フォーマッター | Biome |
| テスト | bun test |
| Git フック | Husky + lint-staged |

## セットアップ

```bash
# 依存をインストール（lifecycle scripts 無効）
make install

# Git hooks を有効化（必要時のみ）
make setup-hooks

# プロジェクトをスキャフォールド（初回のみ）
# Claude Code で以下を実行
/init-project
```

## コマンド

```bash
make install        # 依存をインストール（ignore-scripts）
make setup-hooks    # Husky hooks をセットアップ
make dev            # 全パッケージを開発モードで起動
make lint           # biome check
make format         # biome format
make typecheck      # tsc --noEmit（全ワークスペース）
make test           # bun test（全ワークスペース）
make harness_test   # architecture-harness の検出ロジックをテスト
make build          # ビルド（全ワークスペース）
make before-commit  # コミット前チェック（harness + harness_test + lint_text + lint）
```

## スキル

| スキル | 説明 |
|--------|------|
| `/init-project` | packages/backend（Hono）と packages/frontend（Vite + React）をスキャフォールド |
| `/feature` | 新機能開発のオーケストレーション（ヒアリング → 仕様化 → Issue → 並列実装） |
| `/architecture-harness` | invariant の機械検証。`why <RULE_ID>` で意図を表示 |
| `/skill-audit` | スキル・フック・設定の監査。サードパーティスキルの導入前検査 |
| `/follow-up` | scope 外の発見をフォローアップとして記録・解消管理 |
| `/frontend-design` | 高品質なフロントエンド実装 |

## ディレクトリ構成

```
.
├── .claude/
│   ├── settings.json       # Claude Code フック設定
│   ├── rules/              # path-scoped ルール（対象パス作業時に自動ロード）
│   ├── scripts/            # フック実行スクリプト
│   └── skills/             # カスタムスキル
├── packages/
│   ├── backend/            # /init-project で Hono サーバーを生成
│   └── frontend/           # /init-project で Vite + React を生成
├── biome.json              # リンター/フォーマッター設定
├── CLAUDE.md               # AI エージェント向け開発ガイドライン
└── Makefile
```

## サプライチェイン防御

このテンプレートは Shai-Hulud 系（[Flatt Security の解説](https://blog.flatt.tech/entry/mini_shai_hulud_2nd)）のサプライチェイン攻撃を多層で防ぐデフォルト値を持つ。

- `make install` / `make install_ci` は常に `--ignore-scripts` を付ける。**Bun は `.npmrc` の `ignore-scripts` も `npm_config_ignore_scripts` 環境変数も読まない**（公式 docs では `bunfig.toml` のみが設定経路）ため、Bun を叩くコマンド側で毎回明示する必要がある。husky の `prepare` も巻き添えで止まるので `make setup-hooks` で明示的に opt-in する。
- `bunfig.toml` の `trustedDependencies = []` で、Bun がデフォルトで信頼する「top 500 npm パッケージ」の lifecycle script もゼロにする。
- `make before-commit` が走らせる `architecture-harness` が、Git URL 依存・lifecycle hook の濫用・IOC ファイル名・ロックファイル内の Git 解決を機械的に検出する（`INVARIANT_NO_GIT_DEPENDENCY` / `INVARIANT_LIFECYCLE_HOOK_SCOPED` / `INVARIANT_NO_KNOWN_IOC` / `INVARIANT_LOCKFILE_NO_GIT_RESOLUTION`）。
- CI は `safe-chain` + 上記設定で重ねる。
- `.npmrc` は **意図的に置かない**。Bun は読まないので Bun の防御には寄与せず、「効いていそうで効いていない」security theater になるため。本テンプレートは Bun 専用。pnpm/npm/yarn を併用する派生プロジェクトは自分で `.npmrc` を足す。

設計判断の正本は [ADR-0001](./docs/adr/0001-supply-chain-hardening.md)、invariant 一覧は [docs/architecture/harness.md](./docs/architecture/harness.md) を参照。

## スキル・フックの監査

スキル（`.claude/skills/`）とフック（`.claude/scripts/`、`.claude/settings.json`）はモデルのコンテキストに注入される実行可能な指示であり、npm 依存と同じくサプライチェインの一部として扱う。[NVIDIA SkillSpector](https://github.com/nvidia/skillspector) の知見を `architecture-harness` に移植し、以下を機械検出する。

- `INVARIANT_SKILL_FRONTMATTER_VALID` — SKILL.md の frontmatter 検証（name とディレクトリ名の一致、description の品質）。
- `INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS` — 不可視 Unicode・base64 ブロック・HTML コメントによる隠し指示の検出。
- `INVARIANT_SKILL_NO_EXFIL_EXEC` — リモート取得のシェルパイプ実行・base64 デコード実行の検出。

サードパーティスキルの導入前検査と目視レビューのチェックリストは `/skill-audit` スキルに集約している。設計判断は [ADR-0002](./docs/adr/0002-skill-audit-invariants.md) を参照。

## 開発ガイドライン

[CLAUDE.md](./CLAUDE.md) を参照。完了の品質基準は [docs/architecture/quality-bar.md](./docs/architecture/quality-bar.md)、その根拠は [ADR-0003](./docs/adr/0003-quality-first-no-mvp.md) にある。MVP は完了条件ではない。プロがそのまま使える品質で初回から出すことをデフォルトとする。
