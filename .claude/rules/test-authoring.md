---
paths:
  - "**/*.test.ts*"
  - "**/*.spec.ts*"
---

# Test authoring guidance

テストの目的は、実装手順を固定することではなく、変更の成否をモデル自身が判定できるようにすることです。

- 近接するテストの言語と命名規則に合わせ、タイトルだけで入力、条件、期待する振る舞いが分かるようにする。
- `it.only`、`describe.only`、`.skip`、`xit`、`xdescribe` をコミットに残さない。
- 変更に最も近く、安価に失敗を検出できるテストから選ぶ。unit、integration、end-to-end、preview をリスクに応じて組み合わせる。
- 外部 API、時刻、乱数、ファイル、プロセスなどの境界では、再現性を上げるために test double を使ってよい。production code に mock data や silent fallback を混ぜない。
- バグ修正は先に再現しても、修正後に回帰テストを追加してもよい。Red → Green → Refactor を全タスクの儀式にしない。
- 正常系だけでなく、変更に関係する異常系、境界値、権限、競合を検証する。既存テストが十分なら重複を追加しない。
- coverage は不足箇所を見つけるシグナルとして使い、リポジトリの既存 CI 閾値を満たす。数値だけを上げるテストを書かない。

合否の正本は、test runner、typecheck、architecture harness、CI です。編集直後の hook や特定の review Skill は必須経路ではありません。
