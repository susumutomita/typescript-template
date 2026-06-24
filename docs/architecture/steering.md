# Steering Mechanisms（統制機構の使い分け）

このリポジトリには Claude Code を統制する機構が複数ある。Hook / CLAUDE.md（AGENTS.md import 含む）/ Skill / Subagent / path-scoped Rule / 決定論的 harness の 6 つである。本書はそれぞれを「いつ・何に使うか」で配分する正本である。配分を誤ると、常時ロードされる文脈が肥大して薄まり、機械で止められるはずの違反が人間のレビュー頼みになる。設計判断の根拠は [ADR-0004](../adr/0004-steering-mechanism-alignment.md)。

機構の選定モデルは Anthropic の記事「Steering Claude Code: skills, hooks, rules, subagents, and more」の配分原則を、本テンプレートの実体にマッピングしたものである。

## 判断フロー

新しい統制（ルール・手順・チェック・知識）を足すとき、上から順に当てはめる。最初に当てはまった機構に置く。

1. 常時かつ決定論的に強制したい（守られたか機械で判定できる）か。→ Hook または決定論的 harness。人間にもモデルにも判断を委ねない。
2. 常時モデルの文脈に在ってほしい不変の方針・用語・作業順序か。→ CLAUDE.md / AGENTS.md。ただし owner が中身を把握できる範囲に保ち、肥大させない。
3. 特定の状況で踏む手順・サブコマンドを持つ操作か。→ Skill。description が発火条件、本体が手順。
4. 並列に隔離して走らせ、最終結果だけを親に戻したい作業か。→ Subagent。中間生成物で親の文脈を汚さない。
5. 特定のパスで作業するときだけ効かせたいルールか。→ path-scoped Rule。`.claude/rules/*.md` の frontmatter `paths` で限定する。

このフローの含意として、「特定パスでだけ効くルール」や「毎回 X をしたら必ず Y をする」を常時ロードの CLAUDE.md に書くのはアンチパターンである（後述）。

## 各機構の本リポジトリでの実装箇所

| 機構 | 役割 | 本リポジトリの実装箇所 |
| --- | --- | --- |
| 決定論的 harness | 機械可読な invariant の全件・差分スキャン。守られたかを真偽で判定する正本 | `scripts/architecture-harness.ts`（検出ロジック）、`scripts/architecture-harness.test.ts`（検出のテスト）、`docs/architecture/harness.md`（invariant の文章正本） |
| Hook | ツール実行の前後・セッション境界で決定論的に走るシェル | `.claude/settings.json` の `hooks`（PreToolUse の危険コマンド・設定ファイル編集ブロック、PostToolUse の Biome 自動修正・テストスタイル確認、Stop / SessionStart / PreCompact）、`.claude/scripts/*.sh`（`check-test-style.sh`、`follow-up-reminder.sh`、`stop-gate-reminder.sh`） |
| CLAUDE.md / AGENTS.md | 常時ロードされる不変の方針・ツールスタック・作業順序・制約 | `CLAUDE.md`（Claude Code 固有の運用ルール。`AGENTS.md` を import）、`AGENTS.md`（ツールスタック・品質ゲート・制約の共通正本） |
| Skill | 状況に応じて踏む手順とサブコマンド。description が発火条件 | `.claude/skills/<name>/SKILL.md`（`feature`、`architecture-harness`、`follow-up`、`skill-audit`、`init-project`） |
| Subagent | 並列・隔離実行し最終結果のみ親へ戻す | `.claude/skills/feature/SKILL.md` のフェーズ 4 が Agent ツールで 5 役割（PM / Designer / Developer / QA / User）を同時起動する。専用の `.claude/agents/*.md` 定義は現状置かず、`/feature` のオーケストレーションに集約している |
| path-scoped Rule | 特定パスで作業するときだけ自動でロードされるルール | `.claude/rules/*.md`（frontmatter の `paths` でスコープ限定。`quality-bar.md` は `packages/`・`src/`・`scripts/`、`skill-authoring.md` は `.claude/skills/`・`.claude/scripts/`） |

決定論的 harness と Hook は近いが役割が違う。harness は「リポジトリの状態（コミット・差分）が invariant に反していないか」をスキャンする。Hook は「ツール呼び出しというイベント」に反応して走る。両者は補完関係で、harness の判定を PR 直前ゲートと Stop hook の双方から呼ぶ。

## この成果物はどの機構に置くべきか（早見表）

| 置きたいもの | 置く機構 | 本リポジトリの例 |
| --- | --- | --- |
| 「`npx` を使わせない」のような機械判定できる禁止 | 決定論的 harness（invariant） | `INVARIANT_NO_NPX` |
| 危険コマンド・設定ファイル編集を実行前に止める | Hook（PreToolUse） | `.claude/settings.json` の `rm -rf` / `biome.json` 編集ブロック |
| コード変更後に必ずフォーマッタを当てる | Hook（PostToolUse） | `bunx biome check --write` |
| セッション開始・終了時のリマインド | Hook（SessionStart / Stop） | `follow-up-reminder.sh` / `stop-gate-reminder.sh` |
| ツールスタック・品質ゲートの順序・常時守る制約 | CLAUDE.md / AGENTS.md | `AGENTS.md` の「ツールスタック」「品質ゲート」「制約」 |
| サブコマンドを持つ反復手順 | Skill | `/follow-up add`、`/architecture-harness why <RULE_ID>` |
| ユーザーが明示的にだけ起動する操作 | Skill（`disable-model-invocation: true`） | `/init-project` |
| 並列に視点を分けて走らせ結果を統合する作業 | Subagent | `/feature` フェーズ 4 の 5 役割 |
| `packages/`・`src/`・`scripts/` でだけ効かせたい品質基準 | path-scoped Rule | `.claude/rules/quality-bar.md` |
| `.claude/` 配下でだけ効かせたい authoring 規律 | path-scoped Rule | `.claude/rules/skill-authoring.md` |
| 設計判断の記録（不変・追記型） | ADR | `docs/adr/NNNN-*.md` |

迷ったら「機械で守れるか」を先に問う。守れるなら harness か Hook に寄せ、文章は薄く保つ。重さは機械強制に寄せ、文章は蒸留するのが原則である。

## アンチパターン

- パス固有ルールを常時ロードの CLAUDE.md に書く。`packages/` でだけ効く品質基準を CLAUDE.md に置くと、`.claude/` を触っているだけのセッションでも文脈を消費し、全体が薄まる。path-scoped Rule（`.claude/rules/*.md` の `paths`）に置く。本リポジトリでは品質バーを `.claude/rules/quality-bar.md` に切り出し済みである。
- 「毎回 X したら必ず Y する」を CLAUDE.md の散文で書く。常時かつ決定論的な要求はモデルの遵守に頼らず Hook で強制する。コード変更後のフォーマットは PostToolUse hook、セッション境界のリマインドは SessionStart / Stop hook が担う。
- 機械判定できる禁止を散文の「お願い」で済ませる。`npx` 禁止のような真偽判定できるものは invariant にして harness で止める。散文だけだと違反が CI 前に検出されない。
- CLAUDE.md を肥大させて owner が中身を見失う。常時ロードの文脈は希少資源である。手順は Skill、パス固有は Rule、機械強制は Hook / harness に逃がし、CLAUDE.md には不変の骨子だけ残す。本リポジトリの CLAUDE.md / AGENTS.md は重複定義を避けるため、制約の正本を AGENTS.md に一本化し、CLAUDE.md からは再掲せず import している。
- Subagent の中間生成物を親の文脈に流し込む。並列実行の価値は隔離にある。親へ戻すのは最終結果だけにし、各サブエージェントの試行錯誤で親の文脈を汚さない。
- invariant 違反をコードでなく設定や invariant の緩和で消す。harness が止めたら直す対象はコードである。invariant の緩和・廃止は ADR で明示的に supersede する（`INVARIANT_HARNESS_DOC_AUTHORITATIVE`）。

## 関連ドキュメント

- 機械可読 invariant の正本: [harness.md](./harness.md)
- 完了の品質定義: [quality-bar.md](./quality-bar.md)
- 本配分の設計判断: [ADR-0004](../adr/0004-steering-mechanism-alignment.md)
- スキル authoring 規律: [ADR-0002](../adr/0002-skill-audit-invariants.md)、`.claude/rules/skill-authoring.md`
