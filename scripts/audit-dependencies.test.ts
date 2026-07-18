import { afterAll, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAudit } from './audit-dependencies';

// No Mock 原則: 実ファイル I/O で fixture リポジトリを組み立てて検証する。
const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writePkgSync(
  root: string,
  relDir: string,
  pkg: Record<string, unknown>
): void {
  const dir = path.join(root, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-deps-'));
  createdRoots.push(root);
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writePkgSync(root, '.', {
    name: 'audit-fixture-root',
    workspaces: ['packages/*'],
  });
  return root;
}

describe('audit-dependencies (INVARIANT_DEPS_LIFECYCLE_AUDITED)', () => {
  it('baseline が無い場合は ok=false で更新手順を促す', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { postinstall: 'node build.js' },
    });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.mode).toBe('baseline-missing');
  });

  it('--update で lifecycle script を持つパッケージだけを baseline に書き出す', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { postinstall: 'node build.js', test: 'bun test' },
    });
    writePkgSync(root, 'node_modules/bar', {
      name: 'bar',
      scripts: { test: 'bun test' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('updated');
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries.foo).toEqual(['postinstall']);
    expect(baseline.entries.bar).toBeUndefined();
  });

  it('baseline と一致すれば ok を返す', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    runAudit({ root, update: true });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('diff');
    expect(outcome.diff?.added).toHaveLength(0);
    expect(outcome.diff?.newHooks).toHaveLength(0);
  });

  it('baseline に無い新規パッケージを added として検出し fail する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    runAudit({ root, update: true });
    writePkgSync(root, 'node_modules/evil', {
      name: 'evil',
      scripts: { preinstall: 'node steal.js' },
    });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.diff?.added).toEqual([
      { name: 'evil', scriptKeys: ['preinstall'] },
    ]);
  });

  it('既存依存への新規 hook 追加を newHooks として検出し fail する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    runAudit({ root, update: true });
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy', postinstall: 'node extra.js' },
    });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.diff?.newHooks).toEqual([
      { name: 'foo', added: ['postinstall'] },
    ]);
  });

  it('baseline から消えたパッケージは removed として報告するが fail しない', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    writePkgSync(root, 'node_modules/gone', {
      name: 'gone',
      scripts: { postinstall: 'node x.js' },
    });
    runAudit({ root, update: true });
    rmSync(path.join(root, 'node_modules/gone'), {
      recursive: true,
      force: true,
    });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(true);
    expect(outcome.diff?.removed).toEqual(['gone']);
  });

  it('workspace パッケージ (root と packages/*) は監査対象から除外する', () => {
    const root = makeRoot();
    writePkgSync(root, 'packages/mylib', {
      name: 'my-lib',
      scripts: { prepare: 'bun run build' },
    });
    // bun は workspace を node_modules 配下へ symlink するため、同名 entry を模す。
    writePkgSync(root, 'node_modules/my-lib', {
      name: 'my-lib',
      scripts: { prepare: 'bun run build' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.skippedWorkspace).toEqual(['my-lib']);
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries['my-lib']).toBeUndefined();
  });

  it('@scope 配下のパッケージを列挙する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/@scope/tool', {
      name: '@scope/tool',
      scripts: { postinstall: 'node setup.js' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(1);
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries['@scope/tool']).toEqual(['postinstall']);
  });

  it('ネストされた node_modules のパッケージも再帰的に検出する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/parent', {
      name: 'parent',
      scripts: { test: 'bun test' },
    });
    writePkgSync(root, 'node_modules/parent/node_modules/nested', {
      name: 'nested',
      scripts: { install: 'node hook.js' },
    });
    const outcome = runAudit({ root, update: true });
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(outcome.totalScanned).toBe(1);
    expect(baseline.entries.nested).toEqual(['install']);
  });

  it('同名パッケージが複数コピーある場合は hook を union して 1 entry にする', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/dup', {
      name: 'dup',
      scripts: { prepare: 'tshy' },
    });
    writePkgSync(root, 'node_modules/parent/node_modules/dup', {
      name: 'dup',
      scripts: { postinstall: 'node hook.js' },
    });
    const outcome = runAudit({ root, update: true });
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(outcome.totalScanned).toBe(1);
    expect(baseline.entries.dup).toEqual(['postinstall', 'prepare']);
  });

  it('publish 時のみ発火する script (prepublishOnly) は対象外にする', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/pub', {
      name: 'pub',
      scripts: { prepublishOnly: 'npm run build' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(0);
  });

  it('node_modules が存在しない場合は 0 件として扱う', () => {
    const root = makeRoot();
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(0);
    expect(outcome.ok).toBe(true);
  });
});
