.PHONY: install
# --ignore-scripts: Mini Shai-Hulud 2nd (Flatt Security, 2026-05-12) を含む
# lifecycle script 系サプライチェイン攻撃を一段目で封じるフラグ。
# Bun は npm_config_ignore_scripts 環境変数も .npmrc の ignore-scripts も読まないため
# (公式 docs では bunfig.toml のみが設定経路)、Bun を叩く側で毎回明示する必要がある。
# Bun はデフォルトで「top 500 npm パッケージ」の lifecycle script を暗黙信頼する
# 仕様もあるため、ここで全停止させる方が事故が少ない。Husky の prepare も巻き添えで
# 止まるので、フックを使う場合は make setup-hooks で明示的に再有効化する。
install:
	bun install --ignore-scripts

.PHONY: install_ci
install_ci:
	bun install --frozen-lockfile --ignore-scripts

.PHONY: setup-hooks
# install 時に --ignore-scripts で止めた husky の prepare をここで明示的に走らせる。
# `bun run prepare` は package.json の "prepare": "husky" を叩くため、Husky 一発で済む。
setup-hooks:
	bun run prepare

.PHONY: build
build:
	bun run build

.PHONY: clean
clean:
	bun run clean

.PHONY: test
test:
	bun run test

.PHONY: test_coverage
test_coverage:
	bun run test:coverage

.PHONY: test_watch
test_watch:
	bun run --filter '*' test --watch

.PHONY: lint
lint:
	bun run lint

.PHONY: lint_fix
lint_fix:
	bun run lint:fix

.PHONY: lint_text
lint_text:
	bun run lint:text

.PHONY: typecheck
typecheck:
	bun run typecheck

.PHONY: format
format:
	bun run format

.PHONY: format_check
format_check:
	bun run format:check

.PHONY: architecture_harness
architecture_harness:
	bun scripts/architecture-harness.ts --staged --fail-on=error

.PHONY: harness_test
# harness 自体の invariant 検出ロジックを検証する。workspace 構成に依存しないため
# 既定ゲートに含める (workspace 側のテストは利用プロジェクトで before-commit に足す)。
harness_test:
	bun test scripts/

.PHONY: audit_deps
# 依存 lifecycle script の攻撃面を scripts/audit-baseline.json に固定し、新規
# パッケージ / 新規 hook の出現を検出する (INVARIANT_DEPS_LIFECYCLE_AUDITED /
# ADR-0007)。baseline 更新は `bun scripts/audit-dependencies.ts --update` +
# 対象 script の目視レビュー + PR 本文への理由記載をセットで行う。
audit_deps:
	bun scripts/audit-dependencies.ts

.PHONY: pre_release_check
pre_release_check:
	bun run check:pre-release

.PHONY: before-commit
# typecheck / test / build は各 workspace が該当 script を持つ前提に依存するため、本テンプレートの
# 既定ゲートには含めない。利用プロジェクト側で `before-commit: ... typecheck test build` のように
# 拡張するか、"no script ならスキップ" 型 runner を用意して取り込むこと。
before-commit: architecture_harness harness_test pre_release_check lint_text lint

.PHONY: ci_local
# CI (.github/workflows/ci.yml) が実行する検査を同じ順序でローカル再現する
# 完全ミラー (install は除く)。before-commit は staged 差分向けの高速ゲートで、
# audit_deps と harness 全件スキャンを含まないため、before-commit 緑は CI 緑を
# 保証しない。PR 前に CI 相当を通したいときはこちらを使う (ADR-0007)。
# 前提: audit_deps はローカルの node_modules を見るため、lockfile を変更した後は
# 先に `make install_ci` (または `make install`) を済ませないと CI と結果がずれる。
ci_local: audit_deps
	bun scripts/architecture-harness.ts --fail-on=error
	$(MAKE) before-commit

.PHONY: dev
dev:
	bun run dev
