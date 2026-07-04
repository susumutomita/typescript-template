# ADR-0006: 公開品質ガードを architecture harness に統合する

- Status: Accepted
- Date: 2026-07-04

## Context

公開前に必要なセキュリティ、アクセシビリティ、SEO、パフォーマンス、運用の確認は、
プロジェクトごとの手作業では漏れる。一方、すべてを静的検査しようとすると、
認可や復旧可能性のような意味判断で誤検知が増える。

本リポジトリには既に、ファイル探索、finding 形式、除外規則、CI 接続を持つ
architecture harness がある。公開品質専用スキャナを別に実装すると、
同じリポジトリに 2 つの判定経路が生まれる。

## Decision

公開品質の高シグナルな静的規則を architecture harness の `pre-release`
ルールグループとして追加する。通常 harness は従来どおり全規則を実行し、
`--pre-release` はこのグループだけを実行する。

認証情報のブラウザ保存、危険な HTML 出力、安全でない外部リンク、
画像の代替テキスト不足、公開 HTML のメタデータ不足、本番向けページの
`noindex` を error とする。icon-only button の accessible name 不足は、
静的に確定できない場合があるため warning とする。

認可、ユーザー別キャッシュ、メール到達性、バックアップ復旧、監視など、
実装の意味や運用環境が必要な判断は `docs/checklists/` とレビューで担保する。
console のデバッグ出力は既存の Biome `noConsole` に委譲する。

## Consequences

- 通常ゲートと `check:pre-release` が同じ検出ロジックを使う。
- 新しい公開品質 invariant は文章正本、実装、テストを同時に更新する必要がある。
- 人間向けチェックリストと機械検査の責務境界が明示される。
- 意味解析が必要な項目は自動合格にならず、PR テンプレートで確認理由を残す。

## Alternatives

- 独立した `pre-release-check.ts`: 探索・出力・除外規則が重複するため不採用。
- チェックリストのみ: 決定論的に検出できる重大事故を止められないため不採用。

## References

- [設計](../design/2026-07-04-open-issues-112-120.md)
- [Harness invariants](../architecture/harness.md)
- https://github.com/susumutomita/typescript-template/issues/112
