---
name: follow-up
description: PR の主目的から外れた発見・改善・技術的負債を「フォローアップ」として記録、列挙、解消管理するスキル。スコープクリープを防ぎ、scope 外の課題を別 PR で確実に処理する仕組み。引数なしで起動すると未処理一覧、`add <title>` で追加、`resolve <id> <pr-url>` で解消記録、`list-pr-body` で PR 本文に貼る markdown を出力。
---

# follow-up Skill

PR 作業中に scope 外の発見をしたら、その場で実装せずに本スキルで記録する。スコープクリープを防ぎ、見つけた課題は別 PR で処理することを徹底する。

## ストレージ

- 永続バックログ: `.claude/state/follow-ups.jsonl`
  - JSON Lines 形式（1 行 = 1 エントリ）
  - フィールド: `id` (ULID), `created_at` (ISO8601), `branch`, `title`, `description`, `severity` (low/medium/high), `status` (open/resolved), `resolved_pr` (URL or null), `resolved_at` (ISO8601 or null)
- 初回利用時は `.claude/state/` ディレクトリと空のファイルを作る (`mkdir -p .claude/state && touch .claude/state/follow-ups.jsonl`)

## サブコマンド

### 1. 引数なし — 未処理フォローアップ一覧を表示

```bash
# 実装イメージ
[ -f .claude/state/follow-ups.jsonl ] || { echo "（フォローアップなし）"; exit 0; }
jq -c 'select(.status == "open")' .claude/state/follow-ups.jsonl | \
  jq -r '"- [\(.severity)] \(.id) \(.title) (\(.created_at[0:10]), branch: \(.branch))"'
```

未処理が 0 件なら "（未処理フォローアップなし）" と返して終了。

### 2. `add <title>` — フォローアップを追加

ユーザー入力から `title` (必須) と `description` (任意・複数行可) を受け取り、ストレージに追記する。

- `id` は ULID で発行 (`bunx ulid` または `python -c "import ulid; print(ulid.new())"` または `date +%s%N` の代替)
- `branch` は `git rev-parse --abbrev-ref HEAD` で取得
- `severity` はユーザー指定がなければ `medium`
- 追記したら、現在の PR 本文に貼る markdown スニペットも出力:
  ```markdown
  ## Known follow-ups
  - F-XXXXXX: <title> (`severity: medium`)
  ```

例:
```bash
mkdir -p .claude/state
ID=$(bunx ulid 2>/dev/null || date +%s%N)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq -nc \
  --arg id "$ID" \
  --arg created_at "$NOW" \
  --arg branch "$BRANCH" \
  --arg title "$TITLE" \
  --arg description "$DESCRIPTION" \
  --arg severity "${SEVERITY:-medium}" \
  '{id:$id, created_at:$created_at, branch:$branch, title:$title, description:$description, severity:$severity, status:"open", resolved_pr:null, resolved_at:null}' \
  >> .claude/state/follow-ups.jsonl
```

### 3. `resolve <id> <pr-url>` — フォローアップを解消にマーク

該当 `id` のエントリを `status: "resolved"`, `resolved_pr: "<url>"`, `resolved_at: "<now>"` で更新する。
JSONL は append-only にしたい場合は新しい行で履歴を残す方式も可。シンプルに jq で書き換え:

```bash
TMP=$(mktemp)
jq -c --arg id "$ID" --arg pr "$PR_URL" --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  'if .id == $id then .status = "resolved" | .resolved_pr = $pr | .resolved_at = $now else . end' \
  .claude/state/follow-ups.jsonl > "$TMP"
mv "$TMP" .claude/state/follow-ups.jsonl
```

### 4. `list-pr-body` — 現在のブランチ向け PR 本文ブロックを生成

現在のブランチで作られた未処理フォローアップを集めて、PR の "Known follow-ups" 節に貼れる markdown を出力する。

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "## Known follow-ups"
echo ""
jq -c --arg b "$BRANCH" 'select(.status == "open" and .branch == $b)' .claude/state/follow-ups.jsonl 2>/dev/null | \
  jq -r '"- F-\(.id[-6:]): \(.title) (`severity: \(.severity)`)"'
```

何もなければ "（このブランチで記録されたフォローアップはなし）" と出す。

### 5. `purge-resolved` — 解消済みエントリを別ファイルへアーカイブ

`.claude/state/follow-ups.jsonl` から `status: resolved` を抜いて `.claude/state/follow-ups.archive.jsonl` に移す。バックログが肥大化したときの掃除用。

## 運用ルール

- フォローアップは **必ず別 PR** で処理する。同 PR で前倒し処理するのは「現在の PR が CI で詰まる原因になっている」場合のみ。
- PR 作成時に `list-pr-body` を実行して PR 本文に貼る。
- 別 PR で解消したら `resolve <id> <pr-url>` で記録する。
- バックログが肥大化したら `purge-resolved` で整理する。

## 例

scope 外の旧コード発見:

```
ユーザー: /follow-up add "旧 sample-utils 削除"
Claude: ID F-A1B2C3 で記録した。PR 本文に貼る markdown:
        ## Known follow-ups
        - F-A1B2C3: 旧 sample-utils 削除 (`severity: medium`)
```

別 PR で解消:

```
ユーザー: /follow-up resolve F-A1B2C3 https://github.com/foo/bar/pull/42
Claude: F-A1B2C3 を resolved に更新した。
```
