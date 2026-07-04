# アクセシビリティチェックリスト

WCAG 2.1 AA を基準に、キーボードと支援技術で主要操作を完了できることを確認する。

- [ ] 意味のある画像に内容を表す `alt`、装飾画像に空 `alt` を指定する
- [ ] icon-only button / link に `aria-label` などの accessible name がある
- [ ] 見出し階層、landmark、label と入力欄の対応が意味構造どおりである
- [ ] Tab / Shift+Tab / Enter / Space / Escape で主要操作を完了できる
- [ ] focus indicator が見え、DOM 順と視覚順が一致する
- [ ] modal / dialog の初期 focus、focus trap、閉じた後の focus 復帰を確認する
- [ ] toast / 非同期更新は `role="status"`、即時対応が必要な error は `role="alert"` で通知する
- [ ] error を色だけで示さず、テキストまたはアイコンと accessible name を併用する
- [ ] 通常文字、large text、UI 部品のコントラストが AA を満たす
- [ ] 200％ zoom と狭い viewport で情報や操作が失われない
- [ ] motion を減らす設定を尊重し、点滅や自動再生を制御できる
- [ ] loading / error / empty / success の各状態をスクリーンリーダーでも識別できる
