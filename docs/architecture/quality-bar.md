# Quality Bar（Definition of Done）

完了は手順の遵守ではなく、受け入れ条件を満たしたことを再現可能な証拠で示せる状態です。architecture harness は決定論的な違反を止め、本書は成果物の品質を定義します。

## Definition of Done

- 利用者から観測できる振る舞いが受け入れ条件を満たす。
- 変更範囲の型、エラー、権限、境界値、後方互換性を扱う。
- production code に仮実装、暗黙の mock fallback、握りつぶした失敗、不要な重複を残さない。
- UI 変更では loading、empty、error、success と関連する accessibility を確認する。
- 秘密情報をコード、ログ、fixture、PR 本文へ出さない。
- 変更に最も近い検証を実行し、CI の required checks を通す。
- 未検証の外部条件が残る場合は、検証済みであるかのように扱わず、影響と確認方法を明記する。

## テスト戦略

テスト方式は変更のリスクと境界に合わせて選びます。

- pure logic は unit test、コンポーネント間契約は integration test、利用者フローは end-to-end または preview で検証する。
- 外部サービスや不安定な I/O は test double で制御してよい。実接続でしか確認できない契約は、別の integration または one-time verification を用意する。
- coverage は盲点を発見する指標であり、品質そのものではない。既存の CI 閾値は守りつつ、数値目的の無意味な assertion を増やさない。
- テストの言語、TDD の順序、mock の有無を一律に固定しない。回帰を最も確実かつ安価に検出する構成を選ぶ。

## Not completion criteria

次は単独では完了条件になりません。

- `Plan.md` や設計文書を作ったこと。
- 特定の Skill、review、subagent を実行したこと。
- 固定の開発順序や role play を消化したこと。
- lint、coverage、CI の数値だけが緑で、受け入れ条件を直接確認していないこと。

複雑な設計判断は文書化してよいが、文書は必要性から作り、すべての変更へ課す儀式にはしません。
