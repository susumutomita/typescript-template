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
# 依存をインストール（全ワークスペース一括）
bun install

# プロジェクトをスキャフォールド（初回のみ）
# Claude Code で以下を実行
/init-project
```

## コマンド

```bash
make install        # 依存をインストール
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

## 開発ガイドライン

[CLAUDE.md](./CLAUDE.md) を参照。
