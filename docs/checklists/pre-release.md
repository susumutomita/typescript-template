# 公開前チェックリスト

公開または本番反映の前に、変更種別に応じた詳細チェックリストを確認する。
機械検査は `bun run check:pre-release`、意味判断は本チェックリストとレビューが正本になる。

## 変更種別

- UI: [アクセシビリティ](./accessibility.md) と下記パフォーマンス
- 公開ページ: [SEO / OGP](./seo-ogp.md) と [アクセシビリティ](./accessibility.md)
- API / Auth: [セキュリティ](./security.md)
- Infra / メール / データ: [運用](./operations.md) と [セキュリティ](./security.md)
- 複数にまたがる変更: 該当するチェックリストをすべて確認する

該当しないチェックは、PR の「公開品質チェック」に理由を書く。

## 機械検査

- [ ] `bun run check:pre-release` が error なしで完了する
- [ ] `make before-commit` が完了する
- [ ] warning を確認し、許容する場合は根拠を PR に書く
- [ ] 検出器を回避する変更ではなく、実装を是正している

## パフォーマンス

- [ ] 主要ページの bundle size と遅延読み込み境界を確認した
- [ ] 追加した依存が既存 API や Web Platform で代替できないことを確認した
- [ ] 静的ファイルに content hash と長期 CDN cache を設定した
- [ ] HTML とユーザー別 API レスポンスを同じ cache policy にしていない
- [ ] 画像の実寸、圧縮、遅延読み込み、幅と高さを確認し、layout shift を抑えた
- [ ] API / DB の主要アクセスパターン、件数上限、N+1、timeout を確認した
- [ ] 低速回線、低速端末、空 cache でも主要操作を完了できる

## リリース判定

- [ ] loading / error / empty / success の全状態を確認した
- [ ] 4xx / 5xx / timeout / partial failure の利用者向け挙動を確認した
- [ ] rollback と、既に発生したデータや副作用の扱いを確認した
- [ ] 未確認事項がない。残る場合は DRAFT のままにし、owner と確認期限を書く
