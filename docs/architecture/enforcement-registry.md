# Enforcement Registry

AI エージェントの判断に委ねず、lint、harness、test、CI で機械的に強制する rule の索引です。詳細な検出ロジックと scope は実装およびテストを正本とします。

## Registry

| Rule ID | Principle | Enforcement | Timing | Scope | Severity |
| --- | --- | --- | --- | --- | --- |
| `INVARIANT_NO_NPX` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | package scripts、shell、workflow | error |
| `INVARIANT_NO_MOCK_DATA` | `PRINCIPLE_FAIL_LOUDLY_AT_BOUNDARIES` | architecture harness | staged / CI | production application source | error |
| `INVARIANT_NO_TEST_FOCUS` | `PRINCIPLE_COMPLETION_REQUIRES_AUDIT` | architecture harness | staged / CI | test source | error |
| `INVARIANT_NO_MVP_PLACEHOLDER` | `PRINCIPLE_WORKING_INCREMENT` | architecture harness | staged / CI | implementation source | error |
| `INVARIANT_NO_TYPE_ESCAPE_HATCH` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | harness + Biome | staged / CI | TypeScript source | error |
| `INVARIANT_INSTALL_IGNORE_SCRIPTS` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | install commands | error |
| `INVARIANT_NO_GIT_DEPENDENCY` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | dependency manifests | error / warning |
| `INVARIANT_LIFECYCLE_HOOK_SCOPED` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | package lifecycle hooks | error |
| `INVARIANT_NO_KNOWN_IOC` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | repository paths | error |
| `INVARIANT_LOCKFILE_NO_GIT_RESOLUTION` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | CI | lockfiles | error / warning |
| `INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | CI | Bun trust config | error |
| `INVARIANT_CI_ACTION_SHA_PINNED` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | architecture harness | staged / CI | GitHub Actions | error |
| `INVARIANT_SKILL_FRONTMATTER_VALID` | `PRINCIPLE_EXPLICIT_GAPS` | architecture harness | staged / CI | Skill metadata | error / warning |
| `INVARIANT_AGENT_FRONTMATTER_VALID` | `PRINCIPLE_EXPLICIT_GAPS` | architecture harness | staged / CI | Subagent metadata | error / warning |
| `INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS` | `PRINCIPLE_EVIDENCE_OVER_CONFIDENCE` | architecture harness | staged / CI | `.claude/` | error / warning |
| `INVARIANT_SKILL_NO_EXFIL_EXEC` | `PRINCIPLE_MINIMIZE_IRREVERSIBLE_ASSUMPTIONS` | architecture harness | staged / CI | Skill、rule、hook、settings | error |
| `INVARIANT_PUBLIC_METADATA_PRESENT` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | public HTML | error |
| `INVARIANT_NO_PRODUCTION_NOINDEX` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | production frontend | error |
| `INVARIANT_EXTERNAL_LINK_SAFE` | `PRINCIPLE_ADVERSARIAL_AUDIT` | pre-release harness | pre-release / CI | JSX / HTML | error |
| `INVARIANT_IMAGE_ALT_REQUIRED` | `PRINCIPLE_WORKING_INCREMENT` | pre-release harness | pre-release / CI | JSX / HTML | error |
| `INVARIANT_ICON_BUTTON_ACCESSIBLE_NAME` | `PRINCIPLE_ADVERSARIAL_AUDIT` | pre-release harness | pre-release / CI | JSX / HTML | warning |

## Execution layers

- **Linter / formatter**: AST で高精度に判定できる構文、型、format。
- **Architecture harness**: 複数ファイルまたは repository state を見る低誤検知の invariant。
- **Test**: 入力と観測可能な振る舞いの関係。
- **CI**: ローカル操作に依存しない最終強制点。
- **Hook**: 実行前に止める必要がある危険 command だけ。

Plan、固定開発順序、TDD、テスト言語、Skill 実行、review 実行は enforcement rule ではありません。

## Rule changes

違反時は成果物の修正を第一候補にします。一方、誤検知、重複、モデルまたは toolchain の改善で rule が不要になった証拠がある場合は、rule を弱めることを禁じません。

rule の追加、scope 変更、削除では、検出器、テスト、本 registry、必要な ADR を同じ PR で更新します。新しい rule は「起こりそう」ではなく、繰り返し観測した失敗を根拠にします。
