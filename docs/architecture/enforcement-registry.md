# Enforcement Registry

この文書は、AI エージェントの判断に委ねず、lint、harness、hook、test、CI で機械的に強制するルールの索引です。

判断原則の正本は [Agent Principle Registry](./principles.md) です。原則を文章で教えることと、判定可能な違反を実行系で止めることを分離します。

## 登録要件

新しい enforcement を追加するときは、次を明示する。

- Rule ID
- 対応する Principle ID
- 判定器の実装場所
- 実行タイミング
- 対象範囲
- severity
- 検出器のテスト
- 例外または supersede の手続き

機械判定可能な禁止を `CLAUDE.md`、`AGENTS.md`、Skill の散文だけへ追加してはならない。文章は意図と修正方法を説明し、強制は判定器が担う。

## Registry

| Rule ID | Principle | Enforcement | Timing | Scope | Severity |
| --- | --- | --- | --- | --- | --- |
| `INVARIANT_NO_NPX` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | `scripts/architecture-harness.ts` | staged / CI | package scripts、shell、workflow | error |
| `INVARIANT_NO_MOCK_DATA` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | `scripts/architecture-harness.ts` | staged / CI | application source | error |
| `INVARIANT_NO_TEST_FOCUS` | `PRINCIPLE_COMPLETION_REQUIRES_AUDIT` | `scripts/architecture-harness.ts` | staged / CI | test source | error |
| `INVARIANT_NO_MVP_PLACEHOLDER` | `PRINCIPLE_WORKING_INCREMENT` | `scripts/architecture-harness.ts` | staged / CI | implementation source | error |
| `INVARIANT_NO_TYPE_ESCAPE_HATCH` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | harness + Biome | edit / staged / CI | TypeScript source | error |
| `INVARIANT_INSTALL_IGNORE_SCRIPTS` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | `scripts/architecture-harness.ts` | staged / CI | install commands | error |
| `INVARIANT_NO_GIT_DEPENDENCY` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | `scripts/architecture-harness.ts` | staged / CI | dependency manifests | error / warning |
| `INVARIANT_LIFECYCLE_HOOK_SCOPED` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | `scripts/architecture-harness.ts` | staged / CI | package lifecycle hooks | error |
| `INVARIANT_CI_ACTION_SHA_PINNED` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | `scripts/architecture-harness.ts` | staged / CI | GitHub Actions | error |
| `INVARIANT_SKILL_FRONTMATTER_VALID` | `PRINCIPLE_EXPLICIT_GAPS` | `scripts/architecture-harness.ts` | staged / CI | Skill metadata | error / warning |
| `INVARIANT_AGENT_FRONTMATTER_VALID` | `PRINCIPLE_EXPLICIT_GAPS` | `scripts/architecture-harness.ts` | staged / CI | Subagent metadata | error / warning |
| `INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | `scripts/architecture-harness.ts` | staged / CI | `.claude/` | error / warning |
| `INVARIANT_SKILL_NO_EXFIL_EXEC` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | `scripts/architecture-harness.ts` | staged / CI | Skill、rule、hook、settings | error |
| `INVARIANT_PLAN_MD_REQUIRED` | `PRINCIPLE_EXPLICIT_GAPS` | harness + SessionStart hook | session / staged / CI | feature work | error / reminder |
| `INVARIANT_FOLLOWUP_TRACKED` | `PRINCIPLE_EXPLICIT_GAPS` | follow-up state + hooks | session / Stop / PR | scope 外発見 | reminder / review |
| `INVARIANT_PUBLIC_METADATA_PRESENT` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | public HTML | error |
| `INVARIANT_NO_PRODUCTION_NOINDEX` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | production frontend | error |
| `INVARIANT_EXTERNAL_LINK_SAFE` | `PRINCIPLE_ADVERSARIAL_AUDIT` | pre-release harness | pre-release / CI | JSX / HTML | error |
| `INVARIANT_IMAGE_ALT_REQUIRED` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | JSX / HTML | error |
| `INVARIANT_ICON_BUTTON_ACCESSIBLE_NAME` | `PRINCIPLE_ADVERSARIAL_AUDIT` | pre-release harness + review | pre-release / CI | JSX / HTML | warning |

## 実行層の責務

### Linter / formatter

構文木で高精度に判断でき、編集直後に修正可能な問題を担当する。型エスケープ、未使用コード、危険な構文、フォーマットを対象とする。

### Architecture harness

リポジトリの状態や差分が invariant に違反していないかを決定論的に判定する。Rule ID と修正方法を返し、違反時は非ゼロで終了する。

### Hook

ツール実行やセッション境界のイベントに反応する。危険操作を実行前に止め、編集後の局所チェック、SessionStart、PreCompact、Stop の状態保存を担う。

### Test

入力と期待する振る舞いの関係を検証する。harness 自身の検出ロジックにも正常系、違反、境界、誤検知防止のテストを付ける。

### CI

ローカル操作に依存しない最終強制点とする。依存監査、全件 harness、lint、typecheck、test、coverage、build を再実行し、ローカル hook を迂回した変更も止める。

## 例外手続き

違反を解消する第一手はコードの修正である。設定や rule を弱めて通してはならない。

正当な例外が必要な場合は、次を行う。

1. 誤検知ではなく設計上の例外であることを証拠で示す。
2. 影響範囲と代替防御を記録する。
3. ADR で invariant を supersede または scope 限定する。
4. 検出器とテストと本レジストリを同じ PR で更新する。
