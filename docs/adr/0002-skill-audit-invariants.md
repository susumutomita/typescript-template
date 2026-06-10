# ADR-0002: スキルとフックを監査対象のサプライチェーン成果物として扱う

- **Status**: Accepted
- **Date**: 2026-06-10
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Claude Code のスキル (`.claude/skills/*/SKILL.md`) とフック (`.claude/settings.json`、`.claude/scripts/`) は、モデルのコンテキストに直接注入される実行可能な指示である。NVIDIA の [SkillSpector](https://github.com/nvidia/skillspector) が引用する調査では、公開スキルの 26.1% に脆弱性があり、5.2% に悪意の兆候があると報告されている。攻撃チャネルは従来の SAST では検出されない形を取る。

1. SKILL.md 内の隠し指示 — HTML コメント、ゼロ幅/双方向 Unicode、base64 ブロックに埋めた prompt injection。
2. 自然言語で書かれた外部送信指示や、リモート取得をシェルにパイプする実行 (`curl ... | sh`)。
3. トリガー濫用 — 過度に広い description で意図しない場面にスキルを発火させる。
4. 宣言と実態の乖離 — frontmatter の宣言より広い権限・処理を本体が要求する。

ADR-0001 が npm 依存のサプライチェーンを塞いだのと同じ理由で、スキル・フックも「インストール可能な成果物」として機械検査の対象に含める必要がある。本テンプレートは複数プロダクトの土台になるため、ここに穴があると派生プロダクト全部が同じ穴を継承する。

## Decision

`scripts/architecture-harness.ts` に以下の invariant を追加し、既存ゲート (`make before-commit` / pre-commit / CI) で常時検査する。検出ロジックは Bun + 標準モジュールのみで完結させ、Python 製スキャナへのランタイム依存は持たない。

1. **`INVARIANT_SKILL_FRONTMATTER_VALID`**: `.claude/skills/<dir>/SKILL.md` は YAML frontmatter に `name` と `description` を持ち、`name` はディレクトリ名と一致する (claude-red の「スキル名は公開 API」規律)。`description` は 50 文字以上 1024 文字以下で、トリガー語彙と「いつ使うか」を含める。曖昧な description はスキルの誤発火 (trigger abuse) の温床になるため warning で検出する。
2. **`INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS`**: `.claude/` 配下の全ファイルにゼロ幅/双方向 Unicode 制御文字 (U+200B、U+200E〜U+200F、U+202A〜U+202E、U+2066〜U+2069、U+FEFF 等) や 120 文字以上の base64 ブロックを置いたら error。ZWNJ/ZWJ (U+200C/U+200D) は複合絵文字等の正当用途があるため warning。markdown では HTML コメントも隠し指示チャネルになりうるため warning。
3. **`INVARIANT_SKILL_NO_EXFIL_EXEC`**: `.claude/skills/`、`.claude/scripts/`、`.claude/rules/`、`.claude/settings.json` に、リモート取得のシェルパイプ実行 (`curl|wget ... | sh`)、base64 デコードの実行 (`base64 -d ... | sh`)、`eval "$(curl ...)"` や `sh -c "$(curl ...)"` を置いたら error。

加えて、サードパーティスキルの導入手順を `/skill-audit` スキルに固定する。導入前に harness のスキル invariant でスキャンし、必要に応じて SkillSpector (`uvx` 経由、CI 外の単発監査) で深掘りする。

選択肢として SkillSpector そのものを CI に組み込む案もあったが、Python/uv ツールチェーンの常設は本テンプレートの「Bun 専用・依存ゼロ harness」方針 (ADR-0001) と衝突するため、高シグナルな静的検査だけを TypeScript に移植する方を選んだ。LLM による意味解析 (宣言と実態の乖離検出など) は機械検査が困難なため、`/skill-audit` のチェックリストとしてコードレビューで担保する。

## Consequences

- **Good**: スキル・フック経由の prompt injection / 外部送信を、依存追加なしで commit 時に機械検出できる。スキルの frontmatter 規律 (name 一致・description 品質) が強制され、スキル一覧の機械可読性が上がる。
- **Bad**: 正当な用途の base64 や HTML コメントも警告対象になる。誤検知時は invariant を緩めるのではなく、該当コンテンツを外部ファイルへ逃がすかコードを直す。
- **Tradeoff**: SkillSpector の LLM 意味解析 (declared-vs-actual の乖離検出) は移植しない。スキル数が増えて手動レビューが追いつかなくなったら、CI への SkillSpector 導入を再検討する (その際は ADR で supersede)。

## References

- 関連コード: `scripts/architecture-harness.ts`、`.claude/skills/skill-audit/SKILL.md`
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)
- 外部資料: [NVIDIA/SkillSpector](https://github.com/nvidia/skillspector)、[SnailSploit/claude-red](https://github.com/SnailSploit/claude-red)、[NVIDIA Skills — Scanning Agent Skills](https://docs.nvidia.com/skills/scanning-agent-skills)
