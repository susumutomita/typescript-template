# ADR-0003: 品質ファースト化と MVP・三流コードの再発防止

- **Status**: Accepted
- **Date**: 2026-06-13
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

AI エージェントにこのテンプレートで実装させると、すぐ MVP レベルの手抜き（三流）コードを生成する事象が繰り返された。プロのエンジニアが使う前提のテンプレートにとって、MVP コードは結局すべて書き直しになり、価値を生まない。なぜそうなるのかを分析した根本原因は次の 7 つである。

1. 「動く」が完了条件になっている。エージェントは可視のリクエストを最短で緑にすることを最適化し、エラー処理・境界値・設計などの不可視な品質は落ちる。既存の `ONE_PASS_LOCAL` は「縦に一本動く」止まりで、これは機能の合格ラインであって品質の合格ラインではない。
2. 「プロ品質」の操作的定義が無い。狙えない的は当たらない。TDD / No-Mock / カバレッジ 100% は必要条件だが、浅く拙い設計でも満たせるため十分条件ではなかった。
3. コードを書く前に「考え抜く」設計ゲートが無い。`/feature` は仕様 → すぐ並列実装で、Developer 役の指示は「test → pass → refactor」だけだった。最初に動いた構造がそのまま出荷される、これがハリボテの発生機序そのものである。
4. 早期収束。first-working で止まり「これは最善か、最初に動いただけか」を問い直す契機が無い。
5. 検証が機能のみ。lint / 型 / test / CI は通るが、TODO・`as any`・空 catch・コピペ・浅い設計は素通りする。測っていないものは強制されない。
6. 品質基準が、書いているまさにその時のコンテキストに無い。`/review` `/simplify` は PR 末尾で人間が起動するため遅い。
7. 「シンプル」を「小さく速く」と誤読する。本質的なシンプルさ（考え抜いた設計の結果）と手抜き（角を削る）を区別する記述がどこにも無かった。

## Decision

「Definition of Done = プロ品質」を 1 つ定義し（`docs/architecture/quality-bar.md`）、書く前・書く中・書いた後の 3 層で強制する。層ごとに上の根本原因を潰す。

- 書く前（原因 2・3・4・7）: 品質基準 `quality-bar.md` を正本として新設し、第一原則で「MVP は完了条件ではない」「シンプルさ＝考え抜いた最高の構成」を明文化する。実装前に設計を検討するゲートを置き、新機能は独立した設計ドキュメント（代替案 2 案以上の比較・選定理由・エッジケース）を必須にする。`/feature` に設計フェーズを追加する。
- 書く中（原因 6）: `.claude/rules/quality-bar.md` を path-scoped rule にし、`packages/` `src/` `scripts/` で作業するとき品質基準を自動でコンテキストに載せる。
- 書いた後（原因 1・5）: 機械で確実に止められる手抜きの客観的シグナルを error にする。linter で取れるものは linter（Biome の AST 解析）で取り、harness は linter に対応ルールが無いものだけを正規表現で見る。手書き正規表現で linter の機能を再実装しない。
  - Biome（AST、堅牢）: `any` / `as any`（`noExplicitAny`）、空 catch・空ブロック（`noEmptyBlockStatements`）、`@ts-ignore`（`noTsIgnore`）、認知的複雑度、未使用変数・import、`console` 残骸。
  - `INVARIANT_NO_MVP_PLACEHOLDER`: コメント内の作業中マーカー（TODO / FIXME / HACK / XXX）と `not implemented` 系 throw。
  - `INVARIANT_NO_TYPE_ESCAPE_HATCH`: `as unknown as` の二段キャストと `@ts-nocheck` / `@ts-expect-error`（いずれも Biome に対応ルールが無い）。
  - カバレッジ 100% を `bunfig.toml` の `coverageThreshold` で閾値化し、`bun test --coverage` をゲートにする。

機械化できない設計の良し悪し（代替案検討・命名・抽象度・エッジケースの網羅）は設計ゲートと `/review` のチェックリストで担保する。`quality-bar.md` に機械検出項目とレビュー担保項目の区分表を置く。

biome.json の編集は本テンプレートでは原則禁止だが、それは「問題を黙らせるために設定を緩める」用途を禁じる趣旨である。本 ADR の変更は品質バーを上げる方向であり、趣旨に反しない。緩和ではなく強化であることをここに記録する。

強度の選択肢として「ドキュメント中心（機械強制は最小）」も検討したが、根本原因 5（測っていないものは強制されない）を残すため不採用とした。設計ゲートの重さも「Plan.md に軽量な設計節のみ」を検討したが、根本原因 3・4 を確実に潰すため新機能には独立設計ドキュメントを必須とする重い方を選んだ。テンプレートの利用者はプロのエンジニアであり、初期摩擦より書き直しコストの回避を優先する。

## Consequences

- **Good**: MVP・手抜きの客観的シグナルが機械で止まり、全ゲートを通過できなくなる。品質の的が明文化され、書いている最中にコンテキストへ載る。設計を考え抜く契機が flow に組み込まれる。
- **Bad**: 初期摩擦が増える。設計ドキュメントの作成、より厳しい型・複雑度・カバレッジを満たす手間が常にかかる。
- **Tradeoff**: 速度より品質を選んだ。プロトタイプを高速に量産したい用途には重すぎる。再検討のトリガーは「設計ゲートが形骸化して中身の無いドキュメントを生む」「invariant の誤検知が頻発して回避コードを生む」場合で、そのときは検出ロジックの精度を上げるか別 ADR で supersede する。緩和には ADR を要する。

## References

- 関連コード: `scripts/architecture-harness.ts`, `scripts/architecture-harness.test.ts`, `biome.json`, `bunfig.toml`
- 品質基準の正本: `docs/architecture/quality-bar.md`
- invariant 一覧: `docs/architecture/harness.md`
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md), [ADR-0002](./0002-skill-audit-invariants.md)
