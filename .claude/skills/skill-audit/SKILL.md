---
name: skill-audit
description: .claude 配下のスキル・フック・設定をサプライチェーン成果物として監査するスキル。harness のスキル invariant (frontmatter 検証 / 隠し指示検出 / 危険実行パターン) の全件スキャンと、機械検査で拾えない「宣言と実態の乖離」のレビューチェックリストを実行する。スキルの新規追加・更新時、サードパーティスキルの導入前、定期監査に使う。
argument-hint: "[pre-install <path-or-url>]"
allowed-tools: Read, Write, Grep, Glob, Bash(bun scripts/architecture-harness.ts:*), Bash(bun test scripts:*), Bash(git clone:*), Bash(ls:*), Bash(mkdir:*), Bash(cp:*)
---

# skill-audit Skill

スキル・フックはモデルのコンテキストに注入される実行可能な指示であり、npm パッケージと同じくサプライチェーンの一部として扱う (正本: [ADR-0002](../../../docs/adr/0002-skill-audit-invariants.md))。本スキルは「機械検査」と「目視レビュー」の 2 層で監査する。

## Quick Workflow

1. `bun scripts/architecture-harness.ts --fail-on=warning` で全件スキャン (スキル invariant を含む)。
2. error / warning があれば該当箇所を修正する (invariant を緩めない)。
3. 機械検査で拾えない観点を下のチェックリストで目視レビューする。
4. 発見した scope 外の課題は `/follow-up add` で記録する。

## 機械検査 — harness のスキル invariant

| Invariant | 検出対象 |
| --- | --- |
| `INVARIANT_SKILL_FRONTMATTER_VALID` | frontmatter 欠落、name とディレクトリ名の不一致、description の過不足 |
| `INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS` | ゼロ幅/双方向 Unicode、base64 ブロック、HTML コメント |
| `INVARIANT_SKILL_NO_EXFIL_EXEC` | リモート取得のシェルパイプ実行、base64 デコード実行 |

意図の確認は `/architecture-harness why <RULE_ID>` で行う。

## 目視レビュー — 宣言と実態の乖離チェックリスト

SkillSpector が LLM で行う意味解析の代替。スキルごとに以下を確認する。

- **宣言と実態**: description が宣言する目的・範囲と、本体の指示が一致しているか。宣言より広い処理 (scope creep) や無関係な処理が紛れていないか。
- **権限の過不足**: `allowed-tools` が本体で実際に使うツール・コマンドと一致しているか。過剰宣言 (使わないツールの許可) も過少宣言 (本体が暗黙に要求) も直す。
- **トリガー設計**: description が過度に広く、無関係な場面で発火しないか。「いつ使うか」が明示されているか。
- **破壊的操作の明示**: ファイル削除・外部送信・課金を伴う操作があるなら、本体に警告と確認手順が書かれているか。
- **実行の分離**: スクリプトを実行する場合、取得 (ダウンロード) と実行が分離され、レビュー可能になっているか。

## `pre-install <path-or-url>` — サードパーティスキルの導入前検査

外部スキルを `.claude/skills/` に入れる前に、必ず隔離された場所で監査する。

1. `git clone <url> /tmp/skill-candidate` などで **リポジトリ外** に取得する (先に `.claude/skills/` へコピーしない)。
2. 取得物の SKILL.md・同梱スクリプトを Read で全文確認する。
3. 検査用ディレクトリに `.claude/skills/<name>/SKILL.md` 構造で配置し、`--skills-only` でスキャンする。このモードは `INVARIANT_SKILL_*` だけを実行し、bunfig.toml 等のリポジトリ前提 (REPO_CHECKS) を要求しない。

   ```bash
   mkdir -p /tmp/skill-audit/.claude/skills/<name>
   cp -R /tmp/skill-candidate/. /tmp/skill-audit/.claude/skills/<name>/
   bun scripts/architecture-harness.ts --skills-only --root=/tmp/skill-audit --fail-on=warning
   ```

   SKILL.md 単体ではなく候補ディレクトリ全体をコピーする。同梱スクリプト・参照ファイルこそ `INVARIANT_SKILL_NO_EXFIL_EXEC` の主な検査対象になる。

4. 上記チェックリストを適用し、問題なしと判断してから `.claude/skills/` へ移す。
5. より深い検査が必要な場合は NVIDIA SkillSpector を単発実行する (`uvx skillspector scan <dir> --no-llm`)。Python/uv が必要なため CI には常設しない (理由は ADR-0002)。

## 定期監査

スキル・フック・`settings.json` を変更した PR では本スキルの Quick Workflow を必ず通す。変更がなくても、テンプレート更新の節目で全件スキャンを流す。
