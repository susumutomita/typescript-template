# ADR-0001: サプライチェーン攻撃 (Shai-Hulud 系) への多層防御を既定にする

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

2025 年に検出された Shai-Hulud 攻撃と、その第二波 ("Mini Shai-Hulud 2nd",
[Flatt Security の解説](https://blog.flatt.tech/entry/mini_shai_hulud_2nd))
では、npm/Bun の lifecycle script と `optionalDependencies` を組み合わせた
サプライチェーン経由のコード実行が現実化した。攻撃は次のような流れを取る。

1. 既存パッケージのバージョンに `optionalDependencies` を 1 行追加し、
   攻撃者が管理する GitHub URL を指す `@<vendor>/setup` を仕込む。
2. その optional 依存の `prepare` script で悪性コードを実行したあと
   `exit 1` で「失敗」させる。npm/Bun は optional の失敗を無視するので、
   利用者には正常終了に見える。
3. Bun ランタイム経由で `tanstack_runner.js` → `router_init.js` を読み込み、
   AWS Secrets Manager / Kubernetes / Vault / GitHub Token を周回スキャンし、
   `~/Library/LaunchAgents/com.user.gh-token-monitor.plist` などを残して永続化する。
4. 取得した npm Token (`bypass_2fa: true`) で被害者が管理する別パッケージにも
   `router_init.js` を注入し、ワームのように波及する。

本テンプレートは Claude Code が複数プロダクトの土台になるため、ここに穴があると
派生プロダクト全部が同じ穴を継承する。攻撃面を一度に閉じる必要がある。

## Decision

以下を **すべて同時に** 既定値として固定する。一つでも欠けると上記攻撃チェーンの
いずれかの段で詰められないため、多層化が前提。

1. **install 既定値の強制 (Bun 本体への第一線)**:
   `Makefile` の `install` / `install_ci` は常に `--ignore-scripts` を付ける。
   公式 docs によれば **Bun は `.npmrc` の `ignore-scripts` も
   `npm_config_ignore_scripts` 環境変数も読まず、設定経路は `bunfig.toml` のみ**
   である。したがって Bun を叩くコマンド (CLI / Makefile / CI スクリプト)
   側で毎回明示的にフラグを付けない限り、ignore は効かない。
   `make setup-hooks` を独立ターゲットにして husky の `prepare` だけを
   明示的に opt-in する。
2. **Bun デフォルト挙動の上書き (bunfig.toml)**:
   Bun はデフォルトで「**top 500 npm パッケージ**」の lifecycle script を
   暗黙に信頼して実行する。これは Wave 2 のように人気パッケージが乗っ取られた
   ケースでは穴になりうる。`bunfig.toml` で `trustedDependencies = []` を
   明示し、暗黙信頼ゼロに上書きする。
3. **`.npmrc` は意図的に置かない**:
   初版 (PR #103) では「npm/pnpm/yarn 誤実行時のフォールバック保険」として
   `.npmrc` を置いたが、本テンプレートは Bun 専用であり、Bun は `.npmrc` を
   読まない。そのため `.npmrc` を置いても **「効いていそうで効いていない」
   security theater** になり、レビュアーや派生プロジェクトに誤った安心感を
   与える。実際の defense-in-depth は (1) CLI フラグ、(2) `bunfig.toml`、
   (4) architecture-harness の 3 段で十分。pnpm/npm/yarn を併用したい
   派生プロジェクトは自分の責任で `.npmrc` を足す。
4. **architecture-harness の invariant 拡張** ([`scripts/architecture-harness.ts`](../../scripts/architecture-harness.ts)):
   - `INVARIANT_INSTALL_IGNORE_SCRIPTS`: Makefile/CI/Dockerfile で
     `bun|npm|pnpm|yarn install` が `--ignore-scripts` 無しで現れたら error。
   - `INVARIANT_NO_GIT_DEPENDENCY`: `package.json` の任意の依存セクションが
     `git+`, `github:`, `gitlab:`, `https://` などを指していたら error。
     Wave 2 の入口を直接塞ぐ。
   - `INVARIANT_LIFECYCLE_HOOK_SCOPED`: `package.json` の `preinstall` /
     `install` / `postinstall` / `prepare` 系で `husky` 以外のコマンドが
     現れたら error。`prepare && exit 1` トリックを禁止する。
   - `INVARIANT_NO_KNOWN_IOC`: 既知 IOC のファイル名 (`tanstack_runner.js`,
     `router_init.js`, `gh-token-monitor.*`, `.claude/setup.mjs`,
     `.vscode/setup.mjs`, `codeql_analysis.yml`) を error として検出。
   - `INVARIANT_LOCKFILE_NO_GIT_RESOLUTION`: `bun.lock` / `package-lock.json`
     / `pnpm-lock.yaml` に git/github 解決された依存が含まれていたら error。
   - `INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT`: `bunfig.toml` に
     `trustedDependencies = []` が明示されているか確認。
5. **harness は既定ゲート (`make before-commit`) に組み込み済み** なので、
   コミット前と CI の両方で必ず走る。

ローカル開発者が husky を使いたい場合は、`make install && make setup-hooks` の
2 ステップで明示的に hook をセットアップする。CI は `safe-chain` + 上記設定で
重ね合わせる。

## Consequences

- **Good**:
  - Wave 2 タイプの攻撃 (optionalDependencies + git URL + prepare exit 1) は
    `INVARIANT_NO_GIT_DEPENDENCY` と `INVARIANT_LIFECYCLE_HOOK_SCOPED` の
    どちらかで commit ゲートを通れない。
  - 仮に依存ツリーに混入しても `ignore-scripts=true` で `prepare` が起動しない。
  - IOC ファイル名がコミットに含まれた瞬間に error で止まる。
  - 検査ロジックは `architecture-harness.ts` 一本に集約されており、CI と
    pre-commit hook の両方で同じ判定が動く。
- **Bad**:
  - 正当な目的で git URL 依存を使いたい場合 (社内パッケージ等) は ADR で
    緩和を Supersede する必要がある。
  - `husky` の `prepare` が `make install` 時点で動かないので、新規 clone 直後に
    hook が無効になる。`make setup-hooks` を README で目立たせる必要がある
    (本 PR で対応済み)。
  - `npm install` / `pnpm install` / `yarn install` を誤って叩いた場合の
    防御は無い。本テンプレートは Bun 専用なので意図的にスコープ外とする。
- **Tradeoff**:
  - 第二案として `safe-chain` のような第三者プロキシ単独で十分という選択肢が
    あった。しかし `safe-chain` 単独だと「ローカル開発で正しく走らないと
    bypass される」「IOC ファイルの commit を止めるレイヤーが無い」ため、
    多層化を選んだ。`safe-chain` は CI で併用継続。
  - 再検討トリガー: Bun が公式に `min-release-age` 相当をサポートしたとき、
    `bunfig.toml` に最低公開経過日数を追加する。pnpm/npm を併用する派生
    プロジェクトが出てきたら、その時点で `.npmrc` を足すか検討する。
    新規の攻撃ベクトル (例: Wave 3) が観測されたら invariant を追記する。

## References

- 関連コード:
  - `scripts/architecture-harness.ts` (invariant 実装)
  - `Makefile` (`install` / `install_ci` / `setup-hooks`)
  - `bunfig.toml`
  - `.github/workflows/ci.yml` (safe-chain との二重化)
- 関連 PR: <https://github.com/susumutomita/typescript-template/pull/103>
- 関連 invariant 一覧: [`docs/architecture/harness.md`](../architecture/harness.md)
- 外部資料:
  - <https://blog.flatt.tech/entry/mini_shai_hulud_2nd>
  - <https://socket.dev/blog/shai-hulud-second-wave>
