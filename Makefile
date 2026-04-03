.PHONY: install
install:
	bun install
	cd packages/frontend && bun install
	cd packages/backend && bun install

.PHONY: install_ci
install_ci:
	bun install --frozen-lockfile
	cd packages/frontend && bun install --frozen-lockfile
	cd packages/backend && bun install --frozen-lockfile

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
	cd packages/backend && bun test --coverage
	cd packages/frontend && bun test --coverage

.PHONY: test_watch
test_watch:
	cd packages/backend && bun test --watch

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

.PHONY: before-commit
before-commit: lint_text lint typecheck test build

.PHONY: run_frontend
run_frontend:
	bun run start:frontend

.PHONY: run_backend
run_backend:
	bun run start:backend
