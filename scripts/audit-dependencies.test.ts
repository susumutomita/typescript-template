import { afterAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAudit } from './audit-dependencies';

const SCRIPT = path.join(import.meta.dir, 'audit-dependencies.ts');

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

  it('baseline から消えたパッケージは stale 承認として fail する', () => {
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
    expect(outcome.ok).toBe(false);
    expect(outcome.diff?.removed).toEqual(['gone']);
  });

  it('既存依存の hook 縮小も stale 承認として fail する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy', postinstall: 'node extra.js' },
    });
    runAudit({ root, update: true });
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.diff?.shrunk).toEqual([
      { name: 'foo', removed: ['postinstall'] },
    ]);
  });

  it('workspace (リポジトリ内実体への symlink) は監査対象から除外する', () => {
    const root = makeRoot();
    writePkgSync(root, 'packages/mylib', {
      name: 'my-lib',
      scripts: { prepare: 'bun run build' },
    });
    // bun は workspace を node_modules 配下へ symlink で置く。
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(
      path.join(root, 'packages/mylib'),
      path.join(root, 'node_modules/my-lib'),
      'dir'
    );
    const outcome = runAudit({ root, update: true });
    expect(outcome.skippedWorkspace).toEqual(['my-lib']);
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries['my-lib']).toBeUndefined();
  });

  it('workspace 名を騙る通常ディレクトリは除外せず監査する', () => {
    const root = makeRoot();
    writePkgSync(root, 'packages/mylib', {
      name: 'my-lib',
      scripts: { prepare: 'bun run build' },
    });
    // 名前は workspace と同じだが実体は node_modules 内の通常 dir (偽装の想定)。
    writePkgSync(root, 'node_modules/legit/node_modules/my-lib', {
      name: 'my-lib',
      scripts: { postinstall: 'node steal.js' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.skippedWorkspace).toEqual([]);
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries['my-lib']).toEqual(['postinstall']);
  });

  it('リポジトリ外実体への symlink (bun link 等) は除外せず監査する', () => {
    const root = makeRoot();
    const external = mkdtempSync(path.join(tmpdir(), 'audit-ext-'));
    createdRoots.push(external);
    writePkgSync(external, '.', {
      name: 'linked-tool',
      scripts: { prepare: 'npm run build' },
    });
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(external, path.join(root, 'node_modules/linked-tool'), 'dir');
    const outcome = runAudit({ root, update: true });
    expect(outcome.skippedWorkspace).toEqual([]);
    expect(outcome.totalScanned).toBe(1);
  });

  it('symlink ループがあっても無限再帰せず走査を完了する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/cycle', {
      name: 'cycle',
      scripts: { prepare: 'tshy' },
    });
    mkdirSync(path.join(root, 'node_modules/cycle/node_modules'), {
      recursive: true,
    });
    symlinkSync(
      path.join(root, 'node_modules/cycle'),
      path.join(root, 'node_modules/cycle/node_modules/back'),
      'dir'
    );
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(1);
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

  it('JSON として壊れた package.json の entry は skip する', () => {
    const root = makeRoot();
    const dir = path.join(root, 'node_modules/broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{ こわれた json');
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(0);
  });

  it('name が無い package.json はディレクトリ名で記録する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/anonymous', {
      scripts: { postinstall: 'node x.js' },
    });
    const outcome = runAudit({ root, update: true });
    expect(outcome.totalScanned).toBe(1);
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'scripts/audit-baseline.json'), 'utf8')
    );
    expect(baseline.entries.anonymous).toEqual(['postinstall']);
  });

  it('entries を欠いた baseline はクラッシュせず baseline-corrupt として fail する', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    writeFileSync(path.join(root, 'scripts/audit-baseline.json'), '{}');
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.mode).toBe('baseline-corrupt');
  });

  it('JSON として壊れた baseline は missing と区別して baseline-corrupt にする', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'scripts/audit-baseline.json'),
      '{ こわれた json'
    );
    const outcome = runAudit({ root });
    expect(outcome.ok).toBe(false);
    expect(outcome.mode).toBe('baseline-corrupt');
  });

  it('lifecycle key 以外を含む baseline entries も baseline-corrupt にする', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'scripts/audit-baseline.json'),
      JSON.stringify({
        version: 1,
        description: '',
        entries: { foo: ['prepublishOnly'] },
      })
    );
    const outcome = runAudit({ root });
    expect(outcome.mode).toBe('baseline-corrupt');
  });
});

describe('audit-dependencies CLI', () => {
  function runCli(root: string, ...args: string[]) {
    return spawnSync('bun', [SCRIPT, `--root=${root}`, ...args], {
      encoding: 'utf8',
    });
  }

  it('baseline 更新 → 再実行で exit 0 と OK を返す', () => {
    const root = makeRoot();
    writePkgSync(root, 'node_modules/foo', {
      name: 'foo',
      scripts: { prepare: 'tshy' },
    });
    const update = runCli(root, '--update');
    expect(update.status).toBe(0);
    const check = runCli(root);
    expect(check.status).toBe(0);
    expect(check.stderr).toContain('OK');
  });

  it('baseline が無いときは exit 1 で更新手順を案内する', () => {
    const root = makeRoot();
    const res = runCli(root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--update');
  });

  it('baseline が壊れているときは exit 1 で履歴確認を案内する', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'scripts/audit-baseline.json'), '{}');
    const res = runCli(root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('git log');
  });

  it('新規パッケージ検出時は exit 1 で差分を列挙する', () => {
    const root = makeRoot();
    runCli(root, '--update');
    writePkgSync(root, 'node_modules/evil', {
      name: 'evil',
      scripts: { preinstall: 'node steal.js' },
    });
    const res = runCli(root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('+ evil');
  });
});
