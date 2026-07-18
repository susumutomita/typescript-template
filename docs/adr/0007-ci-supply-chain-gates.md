# ADR-0007: CI ゲートを AI 時代の実装速度に合わせて機械強制へ寄せる

- **Status**: Accepted
- **Date**: 2026-07-18
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

AI エージェントが実装の大部分を書く開発では、コードの生成速度がレビューの速度を
上回る。品質とセキュリティを人間のレビューだけで守る前提は成立しないため、
「レビューで気をつける」項目は可能な限り CI とハーネスの機械強制へ移す必要がある。

ADR-0001 で lifecycle script を「実行させない」防御 (`--ignore-scripts` /
`trustedDependencies = []`) は入れたが、次の 3 つの穴が残っていた。

1. 依存ツリーに lifecycle script 付きパッケージが**増えたことに気づく**仕組みが
   無い。実行は止まっていても、攻撃面の増加は誰も観測していない
   (実行防御と観測は別レイヤー)。
2. GitHub Actions の SHA ピン留めは ci.yml 内のコメント運用のみで、機械強制が
   無い。`@v4` へ戻す変更はレビューをすり抜けうる
   (2025 年の tj-actions/changed-files 事件はタグ付け替えで数万リポジトリに波及した)。
3. `make before-commit` は staged 差分向けの高速ゲートであり、CI の全件スキャンと
   一致しない。「before-commit 緑 = CI 緑」という誤った期待が生まれ、
   push 後に CI で初めて落ちる。

## Decision

以下を同時に導入し、TenkaCloud で確立済みの CI プラクティスと揃える。

1. **依存 lifecycle script の baseline 監査** (`INVARIANT_DEPS_LIFECYCLE_AUDITED`):
   `scripts/audit-dependencies.ts` が `node_modules` を再帰スキャンし
   (ネストされた `node_modules` 内の version 競合コピーも対象。symlink ループは
   実体 path の訪問記録で防ぐ)、install 時に発火する lifecycle script
   (preinstall / install / postinstall / preprepare / prepare / postprepare) を
   持つパッケージ集合を `scripts/audit-baseline.json` と diff する。乖離は
   **増減どちらの方向も fail** — 新規パッケージ・hook 追加に加え、hook 縮小・
   パッケージ消滅も対象にする。縮小方向を許すと stale な承認が baseline に残り、
   後日の同 hook 再追加がレビューなしで通ってしまうため。baseline 更新は
   `bun scripts/audit-dependencies.ts --update` とし、対象 script の目視レビューと
   PR 本文への理由記載を必須にする (人間の承認を経ない攻撃面の変更を止める)。
   workspace の除外は package.json の `name` (攻撃者が制御できる値) ではなく
   「node_modules 直下の symlink がリポジトリ内の実体を指すか」の path 判定で
   行う。名前だけ workspace を騙る通常ディレクトリは除外されず diff に現れる。
2. **Actions の SHA ピン留めを invariant 化** (`INVARIANT_CI_ACTION_SHA_PINNED`):
   architecture-harness に追加し、`.github/workflows/*.yml` / `*.yaml` の
   `uses:` (YAML が許容する `uses :` 表記を含む) が full-length commit SHA
   (40 桁 hex) でない参照を error にする。`docker://` は `@sha256:` digest を
   要求する。ローカル参照 (`./` 始まり) は対象外。行単位の静的検査のため
   `run: |` ブロックスカラー内の uses: 風の行は安全側 (error) に誤検知しうる。
   これまでのコメント運用を機械強制へ昇格させる。
3. **CI 完全ミラー `make ci_local`**: CI が実行する検査 (audit_deps →
   harness 全件スキャン → before-commit) を CI と同じ順序で 1 コマンド実行する。
   `before-commit` は高速ゲートのまま変えない (毎コミットの摩擦を増やさない)。
4. **ci.yml の強化**: 監査ステップの追加に加えて、`concurrency` で古い実行を
   自動キャンセルし、`timeout-minutes` でハング時の課金と滞留を止める。
   `push` トリガーは `main` に限定し、PR ブランチへの push で
   `push` + `pull_request` の二重実行が起きないようにする。

## Consequences

- **Good**:
  - lifecycle script 付き依存の追加・変化が PR の diff (`audit-baseline.json`)
    として可視化され、必ず人間のレビューを通る。
  - Actions のピン外し (`@v4` 化) はコミットゲートと CI の両方で機械的に落ちる。
  - 「CI でだけ落ちる」手戻りが `make ci_local` の 1 コマンドで事前に潰せる。
  - CI の同時実行が整理され、古い push の実行に費やす Actions 時間が消える。
- **Bad**:
  - 依存の追加・更新で lifecycle script 構成が変わるたびに (縮小方向も含めて)
    baseline 更新の一手間が増える (意図的な摩擦。レビューを強制するのが目的)。
  - baseline は package 名単位の snapshot であり、同名パッケージの script の
    **内容**変化 (既存 hook の中身が悪性化するケース) は検出しない。内容の検証は
    `--ignore-scripts` による実行停止と Safe Chain、目視レビューが受け持つ。
  - `make ci_local` の audit はローカルの `node_modules` を見るため、lockfile
    変更後に install を済ませていないと CI と結果がずれる (Makefile に前提を明記)。
- **Tradeoff**:
  - 重複コードの baseline ratchet (jscpd) も TenkaCloud では CI ゲートだが、
    新規依存の追加を伴うため本 ADR からは除外しフォローアップとした
    (依存追加はそれ自体が独立レビュー対象、ADR-0001)。
  - SHA ピン留めの自動更新 (Renovate の pin 運用) は既存の renovate.json に
    委ねる。再検討トリガー: GitHub が immutable actions (タグの改変不可保証) を
    GA したら invariant の要求水準を見直す。

## References

- 関連コード:
  - `scripts/audit-dependencies.ts` / `scripts/audit-baseline.json` (監査と snapshot)
  - `scripts/architecture-harness.ts` (`INVARIANT_CI_ACTION_SHA_PINNED`)
  - `Makefile` (`audit_deps` / `ci_local`)
  - `.github/workflows/ci.yml`
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md) (実行防御レイヤー)
- 関連 invariant 一覧: [`docs/architecture/harness.md`](../architecture/harness.md)
- 外部資料:
  - <https://blog.flatt.tech/entry/mini_shai_hulud_2nd>
  - <https://zenn.dev/singularity/articles/clean-code-ci-for-ai-era>
