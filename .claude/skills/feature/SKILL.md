---
name: feature
description: 新機能・機能拡張を、問題の形式化、独立した複数アプローチの探索、証拠と gap の管理、敵対的監査、TDD 実装、完了監査の順で進める適応型オーケストレーションスキル。「作って」「追加して」「実装して」という依頼で、複数の設計案やレイヤーにまたがる変更が必要なときに使う。固定人数・固定役割ではなく、課題の性質とリスクに応じて探索観点を動的に選ぶ。
argument-hint: "[機能または変更の概要]"
---

# Adaptive Feature Orchestrator

このスキルは、エージェントへ役職を固定配置するためのものではない。

目的は、課題を正確に形式化し、異なる approach family を独立に探索し、証拠の弱い案を捨て、敵対的監査を通過した案だけを working increment として実装することである。

判断原則は [`docs/architecture/principles.md`](../../../docs/architecture/principles.md)、機械強制は [`docs/architecture/enforcement-registry.md`](../../../docs/architecture/enforcement-registry.md)、approach registry の構造は [`docs/schemas/approach-registry.schema.json`](../../../docs/schemas/approach-registry.schema.json) を正本とする。

## 0. 複雑度を判定する

最初に、複数エージェント探索が必要かを判断する。

単一エージェントでよい例:

- 変更箇所と正解が明確な小さな修正。
- 既存パターンをそのまま適用できる変更。
- 機械的な rename、依存更新、文書修正。

独立探索を使う例:

- データモデル、API、UI、運用をまたぐ。
- 認証、権限、永続化、並行性、移行を含む。
- 複数の妥当な責務境界または実装方式がある。
- 原因仮説が複数あり、最初の案へ早期収束すると危険である。
- 失敗時の影響が大きく、候補案を別視点から壊す必要がある。

単純な変更を無理に multi-agent 化しない。複雑な変更を一人の確信だけで進めない。

## 1. Problem framing

実装前に、リポジトリを調査して次を `Plan.md` に記録する。

- user outcome。
- 観測可能な受け入れ条件。
- non-goals。
- 影響するレイヤー、データ、外部境界。
- セキュリティ、アクセシビリティ、運用、移行の制約。
- 破壊的操作、外部副作用、秘密情報の有無。
- 実装後に必要な証拠。

既存コード、履歴、テスト、ドキュメントから解決できる曖昧さは先に調査する。

ユーザーへの質問は、調査しても解決できず、選択によって利用者価値、公開 API、データ互換性、費用、外部副作用が変わる場合に限る。途中で「続けてよいか」を確認するためだけの質問はしない。

## 2. Approach Registry を作る

複雑な変更では、`Plan.md` に `Approach Registry` 節を作る。必要に応じて同じ内容を `.claude/state/approaches/<task-slug>.json` に保存し、JSON の形は schema に合わせる。

各 approach は最低限次を持つ。

- `id`。
- `family`。
- `hypothesis`。
- `expectedEvidence`。
- `evidence`。
- `exactGap`。
- `status`: `unexplored | active | promising | blocked | disproved | selected`。
- `blockedReason`。
- `retryCondition`。
- `adversarialFindings`。

状態遷移:

- `unexplored -> active`: 調査を開始した。
- `active -> promising`: 必要な証拠の一部を得て、重大な反例がない。
- `active | promising -> disproved`: 反例、失敗する実験、要件不一致が見つかった。
- `active | promising -> blocked`: exact gap を解く仕組みがなく停止した。
- `promising -> selected`: 比較と敵対的監査を通過し、実装対象になった。

`blocked` には exact gap、blocked reason、retry condition の三つを必須とする。新しい仕組みや証拠がないまま同じルートへエージェントを再投入しない。

## 3. 独立した探索を起動する

課題の性質から approach family を選ぶ。人数や役割を固定しない。

候補となる探索観点:

- 既存パターン再利用と最小差分。
- ドメインモデルと不変条件。
- API とデータ境界。
- UI、操作フロー、アクセシビリティ。
- セキュリティと trust boundary。
- 並行性、再試行、冪等性、整合性。
- データ移行と後方互換性。
- パフォーマンスと運用負荷。
- 失敗再現と根本原因。
- テスト戦略と観測可能性。

初期ラウンドでは、現在の有力案を大部分の探索エージェントへ教えない。framing、受け入れ条件、非目標、制約だけを共有し、異なる定式化を維持する。

同じ family に探索が集中したら、一部を未探索の family へ振り向ける。表現が違うだけで同じ仮説を重複探索していないか、オーケストレーターが判定する。

各探索エージェントには、進捗報告ではなく次のいずれかを返させる。

- コード位置と具体的な変更案。
- 失敗するテストまたは再現手順。
- データフローと責務境界。
- 計測結果。
- 候補案を破る反例。
- exact gap と必要な次の証拠。

「問題なさそう」「残りは容易」「標準的に実装できる」は成果として受理しない。

## 4. 統合前に比較する

オーケストレーターは、approach family ごとに次を比較する。

- 受け入れ条件を直接満たすか。
- 暗黙の仮定が少ないか。
- 既存の責務と依存方向に整合するか。
- 失敗時に原因と復旧方法が明確か。
- テスト可能か。
- 移行と後方互換性を説明できるか。
- 概念数と変更面積が必要最小限か。

元の課題を同程度に難しい helper、TODO、将来対応、未証明の整合性条件へ移しただけの案は `blocked` にする。

生き残った案が一つとは限らない。互いに補完する案は統合してよいが、責務の重複と矛盾を解消してから `selected` にする。

## 5. Adversarial audit

実装前と実装後に、生成者とは独立した監査を行う。

`.claude/agents/adversarial-auditor.md` が利用可能なら、その subagent に候補案、証拠、exact gap、diff を渡す。利用できない環境では、同じ監査契約を別コンテキストのエージェントへ渡す。

監査対象は候補案に応じて動的に選ぶ。

- 要件を満たさない正常系。
- 空、最大、最小、不正、重複、順序違い。
- 認証と認可の混同。
- tenant、user、resource の境界漏れ。
- 二重送信、競合、retry、部分失敗。
- 古いデータと新しいコードの組み合わせ。
- API、型、設定、永続化形式の互換性。
- ローカルだけ通る、CI だけ通る、本番だけ失敗する仮定。
- silent fallback、mock、stub、偽の成功。
- アクセシビリティ、エラー状態、空状態。
- 観測不能な失敗と復旧不能な操作。

監査結果は `adversarialFindings` に証拠付きで記録する。error が未解決の案は選択しない。

## 6. TDD で working increment を実装する

選択した approach に対して Red、Green、Refactor の順で進める。

1. 受け入れ条件と失敗条件を表すテストを先に追加する。
2. 最小の working increment が通る実装を行う。
3. 責務、命名、依存方向、重複を整理する。
4. データ、API、UI、エラー、運用が必要な範囲で一気通貫になっているか確認する。
5. scope 外の発見は `/follow-up add` で記録する。

「最小の実装」は「不完全な MVP」を意味しない。受け入れ条件を満たす完成した増分の中で、不要な概念を増やさないという意味である。

## 7. Completion audit

完了報告前に次を確認する。

- すべての受け入れ条件に証拠がある。
- 選択案の `exactGap` が `null` である。
- adversarial audit の error が解消している。
- `make before-commit` が通る。
- `nr typecheck`、`nr test:coverage`、`nr build` が必要な構成では通る。
- `.claude/` を変更した場合は `/skill-audit` を通す。
- CI 固有の検査が必要なら `make ci_local` を通す。
- 未実行の外部検証がある場合は、理由と影響を明示する。

機械ゲートが green でも、受け入れ条件、敵対的監査、残存 gap が未確認なら完了ではない。

## 禁止するオーケストレーション

- 常に同じ人数、同じ役割を起動する。
- すべてのエージェントへ最初から有力案を教える。
- 同じ family の言い換えを多様な探索として数える。
- status report や楽観論を具体的証拠の代わりにする。
- blocked route を新しい仕組みなしに繰り返す。
- 監査を候補案の生成者だけに任せる。
- scaffolding、未接続 UI、未使用 API、仮実装を working increment と呼ぶ。
- gate failure を設定変更や invariant 緩和で隠す。
