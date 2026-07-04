---
name: blindspot-pass
description: Issue、ADR、設計メモ、実装計画、PR diff、指定 path に対し、書かれていない前提、producer / consumer の未接続、実運用だけで露出する failure path をコードと設定の証拠付きで探索する review-only スキル。実装前、設計レビュー、PR 前に未知や blocker を確認するときに使う。
argument-hint: "<Issue|ADR|design-note|PR|path>"
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(gh issue view:*), Bash(gh pr view:*), Bash(gh pr diff:*)
---

# Blindspot pass

対象を変更せず、計画を無効化しうる未知を調査して報告する。
コード修正、PR 作成、Issue 起票、設定変更は行わない。
通常レビュー、セキュリティレビュー、テストの代わりに使わない。

## 入力を解決する

1. 引数が Issue / PR の URL または番号なら `gh` で本文、コメント、diff を読む。
2. ADR / 設計メモ / path なら `Read`、`Glob`、`Grep` で対象と参照先を読む。
3. 引数がない場合は、現在の diff と関連する設計文書を対象にする。
4. 対象の主張、変更する経路、依存する producer / consumer、データ境界を列挙する。

対象を特定できない場合は、推測で補わず必要な入力を一つだけ確認する。

## 調査する

次の 10 観点を省略しない。該当しない場合も、該当しない根拠を持つ。

1. producer / consumer の未接続
2. API / CLI / Worker / Lambda / workflow など経路ごとの差分
3. identity / tenant / account / role / audience の生成、伝搬、検証
4. DB / projection / cache / queue 間の data seam
5. create / deploy / destroy / retry / rollback / sweeper の lifecycle 一貫性
6. 4xx / 5xx / timeout / partial failure / default 値の fail-open
7. secret / signing / cross-account / 最小権限
8. tags / audit / metrics / alert / cost backstop / 手動復旧
9. ADR / OpenAPI / schema / IaC / workflow / docs / tests の spec drift
10. unit test は Green だが実経路を通らない test illusion

対象から実行経路を両方向にたどる。入口から consumer まで進み、永続化・非同期処理・
外部依存から入口へ戻って caller と cleanup を確認する。名前が似ているだけで接続済みと
判断せず、import、binding、route、event source、workflow step、権限、設定値を確認する。

## 証拠を扱う

- 確認済みの事実には `path:line`、symbol、または再現可能な read-only command を付ける。
- 検索結果がゼロであることを根拠にする場合は、検索語と探索した path を示す。
- 直接証拠がない内容を finding と断定しない。「未検証のまま残る事項」に仮説として置く。
- severity は発生可能性ではなく、成立した場合の影響と出荷判断への影響で決める。
- blocker は、計画の前提を無効化する、データや権限境界を壊す、回復不能にする、
  または実経路の検証を欠く場合に `yes` とする。
- 是正方向は最小の設計方向までに留め、実装手順やコード変更へ踏み込まない。

## 出力する

```md
# Blindspot pass: <対象>

## 結論
- 進めてよい / 条件付きで進めてよい / blocker を先に解くべき
- 最重要の未知: <1行>

## 発見
### [Critical|High|Medium|Low] <タイトル>
- 何が起きるか:
- 証拠: `path:line` / symbol / command
- なぜ見落としやすいか:
- 影響範囲:
- 最小の是正方向:
- blocker 判定: yes / no

## 未検証のまま残る事項

## 次のアクション
```

発見がない場合も「発見なし」とし、確認した経路と未検証事項を省略しない。
事実と仮説を同じ箇条書きへ混ぜない。

小さい実行例は [references/example.md](./references/example.md) を参照する。
