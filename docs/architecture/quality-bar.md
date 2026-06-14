# Quality Bar（Definition of Done）

完了の正本。`harness.md` が「やってはいけないこと」を機械で止め、本書は「満たすべき品質」を定義する。根本原因分析と判断は [ADR-0003](../adr/0003-quality-first-no-mvp.md)。

## 原則

- MVP は完了ではない。プロがそのまま使える品質で初回から出して完了。
- シンプルさは手抜きではない。考え抜いた最善の構成が結果そう見えること。最初に動いた構造を採用しない。
- 手抜きは結局すべて書き直し。最初から正しく作るほうが速い。

## 着手前（設計ゲート）

実装前に設計を残す。新機能は `docs/design/[日付]-[名前].md`、小変更は `Plan.md` に。代替案 2 案以上の比較・選定理由・データの流れと責務・エッジケース。考えずに書いて後で直すを禁止する。

## Definition of Done

- 単一責務・重複なし・依存は一方向・命名が意図を語る。
- 型で守る。`any`・型エスケープ・非 null アサーションに逃げない。外部入力は境界で検証する。
- 全失敗経路を型付きエラーで処理する。境界値・空・異常系を網羅し、握りつぶさない。
- やり残し（作業中マーカー・未実装 throw・仮実装・デッドコード）を残さない。
- テストを先に書く（Red → Green → Refactor）。BDD 日本語。正常・異常・境界を網羅。カバレッジ 100%。
- UI はローディング・エラー・空・成功の全状態と WCAG 2.1 AA を満たす。
- 秘匿値・モデル ID は設定に切り出す。ログに秘匿値を残さない。

## 何で守るか

linter で取れるものは linter で取る。客観シグナルを次のように分担して error で止める。

- Biome（AST、堅牢）: `any`/`as any`（`noExplicitAny`）・空 catch/空ブロック（`noEmptyBlockStatements`）・`@ts-ignore`（`noTsIgnore`）・複雑度・未使用変数/import・`console` 残骸。
- harness（linter に対応ルールが無いものだけ）: 作業中マーカー・未実装 throw（`INVARIANT_NO_MVP_PLACEHOLDER`）、`as unknown as`・`@ts-nocheck`/`@ts-expect-error`（`INVARIANT_NO_TYPE_ESCAPE_HATCH`）、モックデータ（`INVARIANT_NO_MOCK_DATA`）。
- カバレッジ 100%: `bun test --coverage` + `bunfig.toml` の閾値。

判断が要るもの（設計の良し悪し・命名・エッジケース網羅）は設計ゲートと `/review` で担保する。ゲート緑は必要条件であって完了条件ではない。
