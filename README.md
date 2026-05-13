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
make build          # ビルド（全ワークスペース）
make before-commit  # コミット前チェック（lint + typecheck + test + build）
```

## スキル

| スキル | 説明 |
|--------|------|
| `/init-project` | packages/backend（Hono）と packages/frontend（Vite + React）をスキャフォールド |

## ディレクトリ構成

```
.
├── .claude/
│   ├── settings.json       # Claude Code フック設定
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

- `make install` / `make install_ci` は常に `--ignore-scripts` を付ける。husky の `prepare` は `make setup-hooks` で明示的に opt-in する。
- `bunfig.toml` の `trustedDependencies = []`、`.npmrc` の `ignore-scripts=true` / `minimum-release-age=10080` で、CLI フラグの取りこぼしを設定ファイルで二重化する。
- `make before-commit` が走らせる `architecture-harness` が、Git URL 依存・lifecycle hook の濫用・IOC ファイル名・ロックファイル内の Git 解決を機械的に検出する（`INVARIANT_NO_GIT_DEPENDENCY` / `INVARIANT_LIFECYCLE_HOOK_SCOPED` / `INVARIANT_NO_KNOWN_IOC` / `INVARIANT_LOCKFILE_NO_GIT_RESOLUTION`）。
- CI は `safe-chain` + 上記設定で重ねる。

設計判断の正本は [ADR-0001](./docs/adr/0001-supply-chain-hardening.md)、invariant 一覧は [docs/architecture/harness.md](./docs/architecture/harness.md) を参照。

## 開発ガイドライン

[CLAUDE.md](./CLAUDE.md) を参照。
