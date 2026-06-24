---
paths:
  - "**/*.test.ts*"
  - "**/*.spec.ts*"
---

# テスト記述ルール（テストを書くとき必ず守る）

正本: `AGENTS.md` の「制約」節 / `CLAUDE.md` の「実装原則」節 / `docs/architecture/quality-bar.md`。

- 日本語 BDD スタイルで書く。`describe` / `it` のタイトルは日本語で振る舞いを表現する（「〜のとき〜を返す」のように仕様として読めること）。
- フォーカス・スキップ系を残さない。`it.only` / `describe.only` / `xit` / `xdescribe` は調査時に使ってもコミット前に必ず外す（`.skip` 系も同様）。
- No Mock。実際の DB・API・ファイル I/O を使う。モックデータ・スタブ API は禁止する。
- TDD で進める。テストを先に書き、Red から Green、その後 Refactor の順で実装する。最初に動いた構造を採用しない。
- カバレッジ 100% を維持する。新しい分岐・異常系・境界値を足したらテストも同じ PR で足す。

## 機械強制と guidance の役割分担

この rule は人間とエージェント向けの guidance であり、合否を決めるのは以下の機械強制である。

- `.claude/scripts/check-test-style.sh`（PostToolUse hook、対象は `*.test.ts` / `*.test.tsx`）が、`.only` の残存と describe/it タイトルの日本語不在を検出して書き直しを促す。
- architecture-harness の `INVARIANT_NO_TEST_FOCUS` が、`*.test.*` / `*.spec.*` の `it`/`test`/`describe` の `.only`・`.skip` と `xit`・`xdescribe` を error で止める。
- architecture-harness の `INVARIANT_NO_MOCK_DATA` が、アプリ実装側（`packages/` / `src/` の非テストファイル）に `MOCK_*` 等の mock・stub・fake データを置くことを error で止める。テストでは Real DB / Real API を使う。
- カバレッジは `bun test` のカバレッジ計測で担保する。ゲートが緑でも、振る舞いの網羅・命名・エッジケースの妥当性は `/review` で確認する。
