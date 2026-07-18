#!/usr/bin/env bun
/**
 * 依存 lifecycle script auditor — INVARIANT_DEPS_LIFECYCLE_AUDITED の検出器。
 *
 * 背景: mini Shai-Hulud 2nd (https://blog.flatt.tech/entry/mini_shai_hulud_2nd)
 * では悪意ある transitive 依存の prepare / postinstall で credential exfil が
 * 行われた。本テンプレートは `--ignore-scripts` と `trustedDependencies = []` で
 * 「実行させない」防御 (ADR-0001) を既定にしているが、それだけでは lifecycle
 * script 付き依存が増えたことに誰も気づけない。この監査は install 時に発火しうる
 * script を持つパッケージ集合を `scripts/audit-baseline.json` に snapshot として
 * 固定し、次の 2 つを CI で fail させる (攻撃面の増加に「気づく」防御、ADR-0007)。
 *
 *   1. baseline に無い新規パッケージの出現
 *   2. 既存依存への新規 hook の追加
 *
 * 対象は install 時に実際に発火する script のみ:
 *   preinstall / install / postinstall / preprepare / prepare / postprepare
 * prepublish / prepublishOnly は publish 時のみ発火するため対象外。
 *
 * node_modules はネストも含めて再帰スキャンする (version 競合で
 * node_modules/<a>/node_modules/<b> に置かれたコピーも同じ攻撃面になるため)。
 * workspace パッケージ (root と workspaces 配下) は自リポジトリのコードなので
 * 除外する。
 *
 * baseline の更新は `bun scripts/audit-dependencies.ts --update`。更新時は対象
 * script を目視レビューし、要約と理由を PR 本文に書く (AGENTS.md の制約)。
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '..');

const LIFECYCLE_SCRIPT_KEYS = [
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
] as const;
type LifecycleKey = (typeof LIFECYCLE_SCRIPT_KEYS)[number];

interface PackageJson {
  readonly name?: string;
  readonly workspaces?: unknown;
  readonly scripts?: Readonly<Record<string, unknown>>;
}

interface BaselineSnapshot {
  readonly version: 1;
  readonly description: string;
  readonly entries: Readonly<Record<string, readonly LifecycleKey[]>>;
}

interface DiffResult {
  readonly added: readonly {
    name: string;
    scriptKeys: readonly LifecycleKey[];
  }[];
  readonly newHooks: readonly {
    name: string;
    added: readonly LifecycleKey[];
  }[];
  readonly removed: readonly string[];
}

export interface AuditOutcome {
  readonly ok: boolean;
  readonly totalScanned: number;
  readonly skippedWorkspace: readonly string[];
  readonly diff?: DiffResult;
  readonly mode: 'baseline-missing' | 'diff' | 'updated';
}

export interface AuditOptions {
  /** リポジトリ root。省略時は本 script の 1 つ上 (テストでは temp dir を渡す)。 */
  readonly root?: string;
  /** true なら現在のスキャン結果で baseline を書き換える (要・目視レビュー)。 */
  readonly update?: boolean;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readPackageJson(dir: string): PackageJson | undefined {
  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

// `@scope/` ディレクトリ配下の package dir を列挙する。metadata dir は skip。
function* iterateScopedPackageDirs(scopeDir: string): Generator<string> {
  for (const scoped of readdirSync(scopeDir)) {
    if (scoped.startsWith('.')) continue;
    const scopedPath = path.join(scopeDir, scoped);
    if (isDirectory(scopedPath)) yield scopedPath;
  }
}

// `node_modules/<pkg>` と `node_modules/@scope/<pkg>` の package dir を列挙する。
// `.bin` / `.cache` のような metadata dir は skip。
function* iteratePackageDirs(nodeModules: string): Generator<string> {
  if (!isDirectory(nodeModules)) return;
  for (const entry of readdirSync(nodeModules)) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(nodeModules, entry);
    if (!isDirectory(entryPath)) continue;
    if (entry.startsWith('@')) {
      yield* iterateScopedPackageDirs(entryPath);
    } else {
      yield entryPath;
    }
  }
}

function lifecycleKeysOf(pkg: PackageJson): LifecycleKey[] {
  const scripts = pkg.scripts;
  if (!scripts) return [];
  return LIFECYCLE_SCRIPT_KEYS.filter((key) => {
    const value = scripts[key];
    return typeof value === 'string' && value.length > 0;
  });
}

// node_modules を再帰的に辿り、lifecycle script を持つパッケージを
// 「name → hook key 集合 (複数コピーは union)」に集約する。
function collectLifecyclePackages(
  nodeModules: string,
  byName: Map<string, Set<LifecycleKey>>
): void {
  for (const pkgDir of iteratePackageDirs(nodeModules)) {
    const pkg = readPackageJson(pkgDir);
    if (pkg) {
      const keys = lifecycleKeysOf(pkg);
      if (keys.length > 0) {
        const name = pkg.name ?? path.basename(pkgDir);
        const set = byName.get(name) ?? new Set<LifecycleKey>();
        for (const key of keys) set.add(key);
        byName.set(name, set);
      }
    }
    collectLifecyclePackages(path.join(pkgDir, 'node_modules'), byName);
  }
}

// root package.json の workspaces glob (`packages/*` 形式) から workspace dir を
// 列挙する。glob でない entry はそのままの path として扱う。
function* iterateWorkspaceDirs(
  root: string,
  patterns: readonly string[]
): Generator<string> {
  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      const dir = path.join(root, pattern);
      if (isDirectory(dir)) yield dir;
      continue;
    }
    const base = path.join(root, pattern.slice(0, -2));
    if (!isDirectory(base)) continue;
    for (const entry of readdirSync(base)) {
      const child = path.join(base, entry);
      if (isDirectory(child)) yield child;
    }
  }
}

function listWorkspaceNames(root: string): Set<string> {
  const names = new Set<string>();
  const rootPkg = readPackageJson(root);
  if (!rootPkg) return names;
  if (rootPkg.name) names.add(rootPkg.name);
  const patterns = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces.filter((w): w is string => typeof w === 'string')
    : [];
  for (const dir of iterateWorkspaceDirs(root, patterns)) {
    const pkg = readPackageJson(dir);
    if (pkg?.name) names.add(pkg.name);
  }
  return names;
}

function baselinePathOf(root: string): string {
  return path.join(root, 'scripts', 'audit-baseline.json');
}

function loadBaseline(root: string): BaselineSnapshot | undefined {
  const p = baselinePathOf(root);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as BaselineSnapshot;
  } catch {
    return undefined;
  }
}

function saveBaseline(
  root: string,
  current: ReadonlyMap<string, readonly LifecycleKey[]>
): void {
  const entries: Record<string, readonly LifecycleKey[]> = {};
  for (const name of [...current.keys()].sort()) {
    entries[name] = current.get(name) ?? [];
  }
  const snapshot: BaselineSnapshot = {
    version: 1,
    description:
      'install 時に発火する lifecycle script を持つ依存パッケージの承認済み snapshot (INVARIANT_DEPS_LIFECYCLE_AUDITED / ADR-0007)。実行は --ignore-scripts と trustedDependencies = [] が止めており、この baseline は攻撃面の増加を検出する。更新は bun scripts/audit-dependencies.ts --update + 目視レビュー + PR 本文への理由記載。',
    entries,
  };
  writeFileSync(
    baselinePathOf(root),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8'
  );
}

function diffAgainstBaseline(
  current: ReadonlyMap<string, readonly LifecycleKey[]>,
  baseline: BaselineSnapshot
): DiffResult {
  const added: { name: string; scriptKeys: readonly LifecycleKey[] }[] = [];
  const newHooks: { name: string; added: readonly LifecycleKey[] }[] = [];
  for (const name of [...current.keys()].sort()) {
    const keys = current.get(name) ?? [];
    const prior = baseline.entries[name];
    if (!prior) {
      added.push({ name, scriptKeys: keys });
      continue;
    }
    const priorSet = new Set(prior);
    const gained = keys.filter((key) => !priorSet.has(key));
    if (gained.length > 0) newHooks.push({ name, added: gained });
  }
  const removed = Object.keys(baseline.entries)
    .filter((name) => !current.has(name))
    .sort();
  return { added, newHooks, removed };
}

export function runAudit(opts: AuditOptions = {}): AuditOutcome {
  const root = opts.root ?? REPO_ROOT;
  const byName = new Map<string, Set<LifecycleKey>>();
  collectLifecyclePackages(path.join(root, 'node_modules'), byName);

  const workspaceNames = listWorkspaceNames(root);
  const skippedWorkspace: string[] = [];
  const current = new Map<string, readonly LifecycleKey[]>();
  for (const [name, keys] of byName) {
    if (workspaceNames.has(name)) {
      skippedWorkspace.push(name);
      continue;
    }
    current.set(name, [...keys].sort());
  }

  if (opts.update) {
    saveBaseline(root, current);
    return {
      ok: true,
      totalScanned: current.size,
      skippedWorkspace,
      mode: 'updated',
    };
  }

  const baseline = loadBaseline(root);
  if (!baseline) {
    return {
      ok: false,
      totalScanned: current.size,
      skippedWorkspace,
      mode: 'baseline-missing',
    };
  }
  const diff = diffAgainstBaseline(current, baseline);
  const ok = diff.added.length === 0 && diff.newHooks.length === 0;
  return {
    ok,
    totalScanned: current.size,
    skippedWorkspace,
    diff,
    mode: 'diff',
  };
}

function printFailure(diff: DiffResult): void {
  console.error('NG 依存 lifecycle script が baseline から増えている。\n');
  if (diff.added.length > 0) {
    console.error(`新規パッケージ ${diff.added.length} 件:`);
    for (const entry of diff.added) {
      console.error(`  + ${entry.name}  [${entry.scriptKeys.join(', ')}]`);
    }
    console.error('');
  }
  if (diff.newHooks.length > 0) {
    console.error(`既存依存への hook 追加 ${diff.newHooks.length} 件:`);
    for (const entry of diff.newHooks) {
      console.error(`  ~ ${entry.name}  +[${entry.added.join(', ')}]`);
    }
    console.error('');
  }
  console.error(
    '全 script を目視レビューして安全なら、次を実行して baseline を更新し、\n' +
      '要約と理由を PR 本文に書く:\n' +
      '  bun scripts/audit-dependencies.ts --update\n\n' +
      '見覚えのないパッケージならサプライチェーン侵害の可能性がある。\n' +
      '参照: https://blog.flatt.tech/entry/mini_shai_hulud_2nd'
  );
}

function main(): void {
  const update = process.argv.slice(2).includes('--update');
  const outcome = runAudit({ update });

  if (outcome.mode === 'updated') {
    console.warn(
      `baseline を更新した: ${outcome.totalScanned} package(s)、workspace 除外 ${outcome.skippedWorkspace.length} 件。目視レビューの要約を PR 本文に書くこと。`
    );
    return;
  }
  if (outcome.mode === 'baseline-missing' || !outcome.diff) {
    console.error(
      'NG baseline (scripts/audit-baseline.json) が無い。パッケージ集合をレビューしたうえで `bun scripts/audit-dependencies.ts --update` を実行する。'
    );
    process.exit(1);
  }
  if (!outcome.ok) {
    printFailure(outcome.diff);
    process.exit(1);
  }
  const removedNote =
    outcome.diff.removed.length > 0
      ? ` (baseline のみに残る ${outcome.diff.removed.length} 件は --update で掃除できる)`
      : '';
  console.warn(
    `OK lifecycle script 持ち ${outcome.totalScanned} package(s)、baseline との差分なし${removedNote}。`
  );
}

if (import.meta.main) {
  main();
}
