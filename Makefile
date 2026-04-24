.PHONY: install
install:
	bun install

.PHONY: install_ci
install_ci:
	bun install --frozen-lockfile

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

.PHONY: before-commit
# typecheck / test / build は各 workspace が該当 script を持つ前提に依存するため、本テンプレートの
# 既定ゲートには含めない。利用プロジェクト側で `before-commit: ... typecheck test build` のように
# 拡張するか、"no script ならスキップ" 型 runner を用意して取り込むこと。
before-commit: architecture_harness lint_text lint

.PHONY: dev
dev:
	bun run dev
