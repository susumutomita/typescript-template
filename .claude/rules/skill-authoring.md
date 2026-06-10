---
paths:
  - ".claude/skills/**"
  - ".claude/scripts/**"
---

# スキル・フック authoring ルール

`.claude/` 配下はモデルのコンテキストに注入されるサプライチェーン成果物として扱う (正本: `docs/adr/0002-skill-audit-invariants.md`)。

- SKILL.md の `name` はディレクトリ名と一致させる。`description` には対象・サブコマンド・「いつ使うか」をトリガー語彙として 50〜1024 文字で書く。
- `allowed-tools` は本体が実際に使う最小セットのみ宣言する。引数を取るなら `argument-hint`、ユーザー専用なら `disable-model-invocation: true` を付ける。
- 不可視 Unicode・base64 ブロック・HTML コメント・リモート取得のシェルパイプ実行を置かない (harness の `INVARIANT_SKILL_*` で error になる)。
- 検出対象パターンを説明するときはリテラルで書かず言い換える（このディレクトリ群は検出器のスコープ内であり、例示のつもりの 1 行が自己検出で error になる）。
- 変更後は `bun scripts/architecture-harness.ts --fail-on=warning` と `/skill-audit` の Quick Workflow を通す。
