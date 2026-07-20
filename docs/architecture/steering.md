# Steering Mechanisms（統制機構の使い分け）

このリポジトリは、AI エージェントを「文章でお願いする」だけでは統制しない。

判断原則、決定論的強制、状況依存の手順、独立探索、敵対的監査を別の機構へ配置する。配分を誤ると、常時ロードされる文脈が肥大し、機械で止められる違反がモデルの遵守頼みになり、逆に意味論的な判断を壊れやすい正規表現へ押し込むことになる。

判断原則は [principles.md](./principles.md)、機械強制の索引は [enforcement-registry.md](./enforcement-registry.md)、設計判断の根拠は [ADR-0004](../adr/0004-steering-mechanism-alignment.md) を参照する。

## 判断フロー

新しい統制、知識、手順、検査を追加するときは、上から順に判断する。

1. **同じ入力に対して決定論的に真偽を判定できるか。**
   - できる → linter、harness、hook、test、CI のいずれかへ置く。
   - 散文だけで禁止しない。
2. **未知の状況で、証拠を比較して選択するための安定した判断軸か。**
   - そうである → Principle Registry へ置く。
3. **常時モデルの文脈に必要な製品事実、権限境界、作業の入口か。**
   - そうである → CLAUDE.md または AGENTS.md へ最小限置く。
4. **特定状況で踏む手順、状態遷移、サブコマンドか。**
   - そうである → Skill へ置く。
5. **独立した文脈で探索、レビュー、反証、障害調査をさせるか。**
   - そうである → Subagent へ置く。
6. **特定パスで作業するときだけ必要か。**
   - そうである → path-scoped Rule へ置く。
7. **ツール実行の直前、直後、セッション境界で必ず反応するか。**
   - そうである → Hook へ置く。

## 各機構の責務

| 機構 | 役割 | 実装場所 |
| --- | --- | --- |
| Principle Registry | 未知の状況で使う判断原則。証拠、探索、gap、監査、完了の基準 | `docs/architecture/principles.md` |
| Enforcement Registry | 機械強制 rule と対応 principle の索引 | `docs/architecture/enforcement-registry.md` |
| 決定論的 harness | リポジトリ状態と差分が invariant に反していないか真偽で判定 | `scripts/architecture-harness.ts`、`scripts/architecture-harness.test.ts`、`docs/architecture/harness.md` |
| Hook | tool event と session boundary で決定論的に実行 | `.claude/settings.json`、`.claude/scripts/*.sh` |
| CLAUDE.md / AGENTS.md | 常時必要な製品事実、権限境界、作業入口 | `CLAUDE.md`、`AGENTS.md` |
| Skill | 状況依存のワークフロー、状態遷移、サブコマンド | `.claude/skills/<name>/SKILL.md` |
| Subagent | 独立探索、敵対的監査、レビュー、デバッグ | `.claude/agents/*.md` |
| path-scoped Rule | 特定パスでだけ必要な authoring、test、document 規律 | `.claude/rules/*.md` |
| ADR | invariant と原則の変更理由、例外、移行 | `docs/adr/NNNN-*.md` |

## Adaptive orchestration

複雑な課題で subagent を使う場合、人数と役割を固定しない。

`/feature` は次を行う。

1. 問題、受け入れ条件、非目標、必要な証拠を形式化する。
2. approach family、hypothesis、evidence、exact gap、status、retry condition を登録する。
3. 初期段階では有力案を大部分の探索 agent へ知らせず、独立性を保つ。
4. 同じ family が増えた場合は未探索の系統へ再配分する。
5. 候補案を生成者とは別の adversarial auditor が壊す。
6. 生き残った案だけを TDD で working increment として実装する。
7. 受け入れ条件、remaining gap、監査、機械ゲートを通して完了を判定する。

単純な修正を無理に multi-agent 化しない。複雑な変更を固定 role play にしない。

## 配置例

| 置きたいもの | 置く機構 | 例 |
| --- | --- | --- |
| 「確信ではなく再現可能な証拠を優先する」 | Principle | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` |
| 「`npx` を使わせない」 | Harness | `INVARIANT_NO_NPX` |
| 危険コマンドを実行前に止める | Hook | PreToolUse guard |
| コード変更後に formatter を実行する | Hook | PostToolUse |
| 複雑な新機能の探索、選択、実装 | Skill | `/feature` |
| 候補設計を独立に攻撃する | Subagent | `adversarial-auditor` |
| テストファイルだけで有効な BDD 規則 | path-scoped Rule | `.claude/rules/test-authoring.md` |
| invariant の例外と代替防御 | ADR | superseding ADR |

## アンチパターン

- 機械判定可能な禁止を CLAUDE.md の散文だけで済ませる。
- 原則を曖昧な精神論として増やし、具体的な証拠や判断方法を定義しない。
- 意味解析が必要な品質を壊れやすい正規表現で error 化する。
- 常に同じ人数、同じ役割の subagent を起動する。
- 全探索 agent へ最初から有力案を共有して独立性を失う。
- status report や楽観論を evidence として扱う。
- blocked route を新しい mechanism なしに再実行する。
- Subagent の試行錯誤を親の文脈へすべて流し込む。
- invariant 違反をコードでなく設定や rule の緩和で消す。
- CLAUDE.md を肥大させ、owner が正本を把握できなくする。

## 正本の優先順位

- 判断原則: `principles.md`。
- 機械強制の意図と索引: `enforcement-registry.md`。
- invariant の文章仕様: `harness.md`。
- 検出結果: harness、linter、test、CI。
- 状況依存の実行手順: Skill。
- 設計変更と例外: ADR。

同じ rule の説明を複数箇所へ手書きで複製しない。参照または生成可能な索引へ寄せ、正本 drift を減らす。
