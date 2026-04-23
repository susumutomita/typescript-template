# Follow-ups

このファイルは互換性のためのリダイレクトです。フォローアップ管理は **`/follow-up` スキル** に移行しました。

## 使い方

```
/follow-up                      # 未処理一覧
/follow-up add <タイトル>       # 追加
/follow-up resolve <id> <pr-url> # 解消
/follow-up list-pr-body         # PR 本文用 markdown を生成
```

詳細: [`.claude/skills/follow-up/SKILL.md`](../.claude/skills/follow-up/SKILL.md)

ストレージ: `.claude/state/follow-ups.jsonl` (gitignore 対象、開発者ごとのローカル状態)

セッション開始時 (SessionStart hook) に未処理件数が Claude に通知される。
