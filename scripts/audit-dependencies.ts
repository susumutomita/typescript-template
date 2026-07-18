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
 * 固定し、baseline との乖離を CI で fail させる (攻撃面の変化に「気づく」防御、
 * ADR-0007)。乖離は増減どちらの方向も対象にする。
 *
 *   1. baseline に無い新規パッケージの出現
 *   2. 既存依存への新規 hook の追加
 *   3. 既存依存の hook 縮小・パッケージ消滅 (stale な承認が baseline に残ると、
 *      後日の同 hook 再追加がレビューなしで通ってしまうため、縮小方向も
 *      `--update` で焼き直させる)
 *
 * 対象は install 時に実際に発火する script のみ:
 *   preinstall / install / postinstall / preprepare / prepare / postprepare
 * prepublish / prepublishOnly は publish 時のみ発火するため対象外。
 *
 * node_modules はネストも含めて再帰スキャンする (version 競合で
 * node_modules/<a>/node_modules/<b> に置かれたコピーも同じ攻撃面になるため)。
 * workspace の除外は package.json の name (攻撃者が制御できる値) ではなく
 * 「node_modules 直下の symlink がリポジトリ内の実体を指すか」で判定する。
 * 名前だけ workspace を騙る通常ディレクトリは除外されず、baseline diff に現れる。
 *
 * baseline の更新は `bun scripts/audit-dependencies.ts --update`。更新時は対象
 * script を目視レビューし、要約と理由を PR 本文に書く (AGENTS.md の制約)。
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
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
  readonly shrunk: readonly {
    name: string;
    removed: readonly LifecycleKey[];
  }[];
  readonly removed: readonly string[];
}

export interface AuditOutcome {
  readonly ok: boolean;
  readonly totalScanned: number;
  readonly skippedWorkspace: readonly string[];
  readonly diff?: DiffResult;
  readonly mode: 'baseline-missing' | 'baseline-corrupt' | 'diff' | 'updated';
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

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function readPackageJson(dir: string): PackageJson | undefined {
  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
  } catch {
    // package.json が JSON として壊れた entry は lifecycle script も読めないため
    // skip する (install 自体が失敗する状態であり、監査の関心対象外)。
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

// pkgDir が workspace (リポジトリ内の実体を指す symlink) かを path で判定する。
// bun は workspace を node_modules へ symlink で置くため、実体がリポジトリ内かつ
// node_modules 配下でないものだけを workspace とみなす。package.json の name は
// 攻撃者が自由に書ける値なので判定に使わない。
function isWorkspaceLink(pkgDir: string, realRoot: string): boolean {
  try {
    if (!lstatSync(pkgDir).isSymbolicLink()) return false;
  } catch {
    return false;
  }
  const target = safeRealpath(pkgDir);
  if (!target) return false;
  const rel = path.relative(realRoot, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return !rel.split(path.sep).includes('node_modules');
}

function lifecycleKeysOf(pkg: PackageJson): LifecycleKey[] {
  const scripts = pkg.scripts;
  if (!scripts) return [];
  return LIFECYCLE_SCRIPT_KEYS.filter((key) => {
    const value = scripts[key];
    return typeof value === 'string' && value.length > 0;
  });
}

interface ScanContext {
  readonly realRoot: string;
  readonly byName: Map<string, Set<LifecycleKey>>;
  readonly skippedWorkspace: string[];
  /** 実体 path の訪問記録。symlink ループと重複コピーの二重走査を防ぐ。 */
  readonly visited: Set<string>;
}

// 1 パッケージ分の lifecycle key を byName へ union で集約する。
function recordLifecycleEntry(
  pkgDir: string,
  pkg: PackageJson | undefined,
  ctx: ScanContext
): void {
  if (!pkg) return;
  const keys = lifecycleKeysOf(pkg);
  if (keys.length === 0) return;
  const name = pkg.name ?? path.basename(pkgDir);
  const set = ctx.byName.get(name) ?? new Set<LifecycleKey>();
  for (const key of keys) set.add(key);
  ctx.byName.set(name, set);
}

// node_modules を再帰的に辿り、lifecycle script を持つパッケージを
// 「name → hook key 集合 (複数コピーは union)」に集約する。
function collectLifecyclePackages(nodeModules: string, ctx: ScanContext): void {
  for (const pkgDir of iteratePackageDirs(nodeModules)) {
    if (isWorkspaceLink(pkgDir, ctx.realRoot)) {
      const pkg = readPackageJson(pkgDir);
      ctx.skippedWorkspace.push(pkg?.name ?? path.basename(pkgDir));
      continue;
    }
    const real = safeRealpath(pkgDir);
    if (!real || ctx.visited.has(real)) continue;
    ctx.visited.add(real);
    recordLifecycleEntry(pkgDir, readPackageJson(pkgDir), ctx);
    collectLifecyclePackages(path.join(pkgDir, 'node_modules'), ctx);
  }
}

function baselinePathOf(root: string): string {
  return path.join(root, 'scripts', 'audit-baseline.json');
}

function isLifecycleKey(value: unknown): value is LifecycleKey {
  return (
    typeof value === 'string' &&
    (LIFECYCLE_SCRIPT_KEYS as readonly string[]).includes(value)
  );
}

// baseline の shape を検証して読む。壊れた JSON / 不正な形式は「無い」と区別する
// (改竄・破損を無レビューの --update 再生成へ誘導しないため)。
function parseBaseline(content: string): BaselineSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) return null;
  const entries = obj.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return null;
  }
  for (const value of Object.values(entries)) {
    if (!Array.isArray(value) || !value.every(isLifecycleKey)) return null;
  }
  return {
    version: 1,
    description: typeof obj.description === 'string' ? obj.description : '',
    entries: entries as Record<string, readonly LifecycleKey[]>,
  };
}

type BaselineLoadResult =
  | { readonly kind: 'ok'; readonly snapshot: BaselineSnapshot }
  | { readonly kind: 'missing' }
  | { readonly kind: 'corrupt' };

function loadBaseline(root: string): BaselineLoadResult {
  const p = baselinePathOf(root);
  if (!existsSync(p)) return { kind: 'missing' };
  const snapshot = parseBaseline(readFileSync(p, 'utf8'));
  return snapshot ? { kind: 'ok', snapshot } : { kind: 'corrupt' };
}

const BASELINE_DESCRIPTION =
  'install 時に発火する lifecycle script を持つ依存パッケージの承認済み snapshot (INVARIANT_DEPS_LIFECYCLE_AUDITED / ADR-0007)。実行は --ignore-scripts と trustedDependencies = [] が止めており、この baseline は攻撃面の変化を検出する。更新は bun scripts/audit-dependencies.ts --update + 目視レビュー + PR 本文への理由記載。';

// biome の JSON formatter (indent 2 / 短い配列はインライン) と一致する形で書き、
// `--update` 直後のファイルがそのまま lint を通るようにする。
function saveBaseline(
  root: string,
  current: ReadonlyMap<string, readonly LifecycleKey[]>
): void {
  const names = [...current.keys()].sort();
  const entryLines = names.map((name) => {
    const keys = (current.get(name) ?? [])
      .map((key) => JSON.stringify(key))
      .join(', ');
    return `    ${JSON.stringify(name)}: [${keys}]`;
  });
  const body = [
    '{',
    '  "version": 1,',
    `  "description": ${JSON.stringify(BASELINE_DESCRIPTION)},`,
    entryLines.length === 0 ? '  "entries": {}' : '  "entries": {',
    ...(entryLines.length === 0 ? [] : [entryLines.join(',\n'), '  }']),
    '}',
    '',
  ].join('\n');
  writeFileSync(baselinePathOf(root), body, 'utf8');
}

function diffAgainstBaseline(
  current: ReadonlyMap<string, readonly LifecycleKey[]>,
  baseline: BaselineSnapshot
): DiffResult {
  const added: { name: string; scriptKeys: readonly LifecycleKey[] }[] = [];
  const newHooks: { name: string; added: readonly LifecycleKey[] }[] = [];
  const shrunk: { name: string; removed: readonly LifecycleKey[] }[] = [];
  for (const name of [...current.keys()].sort()) {
    const keys = current.get(name) ?? [];
    const prior = baseline.entries[name];
    if (!prior) {
      added.push({ name, scriptKeys: keys });
      continue;
    }
    const priorSet = new Set(prior);
    const keySet = new Set(keys);
    const gained = keys.filter((key) => !priorSet.has(key));
    if (gained.length > 0) newHooks.push({ name, added: gained });
    const lost = [...prior].filter((key) => !keySet.has(key)).sort();
    if (lost.length > 0) shrunk.push({ name, removed: lost });
  }
  const removed = Object.keys(baseline.entries)
    .filter((name) => !current.has(name))
    .sort();
  return { added, newHooks, shrunk, removed };
}

export function runAudit(opts: AuditOptions = {}): AuditOutcome {
  const root = opts.root ?? REPO_ROOT;
  const realRoot = safeRealpath(root) ?? root;
  const ctx: ScanContext = {
    realRoot,
    byName: new Map<string, Set<LifecycleKey>>(),
    skippedWorkspace: [],
    visited: new Set<string>(),
  };
  collectLifecyclePackages(path.join(root, 'node_modules'), ctx);

  const current = new Map<string, readonly LifecycleKey[]>();
  for (const [name, keys] of ctx.byName) {
    current.set(name, [...keys].sort());
  }
  const skippedWorkspace = ctx.skippedWorkspace;

  if (opts.update) {
    saveBaseline(root, current);
    return {
      ok: true,
      totalScanned: current.size,
      skippedWorkspace,
      mode: 'updated',
    };
  }

  const loaded = loadBaseline(root);
  if (loaded.kind !== 'ok') {
    return {
      ok: false,
      totalScanned: current.size,
      skippedWorkspace,
      mode: loaded.kind === 'missing' ? 'baseline-missing' : 'baseline-corrupt',
    };
  }
  const diff = diffAgainstBaseline(current, loaded.snapshot);
  const ok =
    diff.added.length === 0 &&
    diff.newHooks.length === 0 &&
    diff.shrunk.length === 0 &&
    diff.removed.length === 0;
  return {
    ok,
    totalScanned: current.size,
    skippedWorkspace,
    diff,
    mode: 'diff',
  };
}

function printFailure(diff: DiffResult): void {
  console.error('NG 依存 lifecycle script が baseline から乖離している。\n');
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
  if (diff.shrunk.length > 0) {
    console.error(
      `hook が縮小したパッケージ ${diff.shrunk.length} 件 (stale な承認を baseline に残さない):`
    );
    for (const entry of diff.shrunk) {
      console.error(`  ~ ${entry.name}  -[${entry.removed.join(', ')}]`);
    }
    console.error('');
  }
  if (diff.removed.length > 0) {
    console.error(
      `baseline のみに残るパッケージ ${diff.removed.length} 件 (stale な承認を baseline に残さない):`
    );
    for (const name of diff.removed) {
      console.error(`  - ${name}`);
    }
    console.error('');
  }
  console.error(
    '増加方向は script を目視レビューして安全を確認、縮小方向は stale 承認の掃除として、\n' +
      'どちらも次を実行して baseline を更新し、要約と理由を PR 本文に書く:\n' +
      '  bun scripts/audit-dependencies.ts --update\n\n' +
      '見覚えのないパッケージならサプライチェーン侵害の可能性がある。\n' +
      '参照: https://blog.flatt.tech/entry/mini_shai_hulud_2nd'
  );
}

function parseCliOptions(argv: string[]): AuditOptions {
  let root: string | undefined;
  let update = false;
  for (const arg of argv) {
    if (arg === '--update') update = true;
    else if (arg.startsWith('--root=')) root = path.resolve(arg.slice(7));
  }
  return root ? { root, update } : { update };
}

function main(): void {
  const opts = parseCliOptions(process.argv.slice(2));
  const outcome = runAudit(opts);

  if (outcome.mode === 'updated') {
    console.warn(
      `baseline を更新した: ${outcome.totalScanned} package(s)、workspace 除外 ${outcome.skippedWorkspace.length} 件。目視レビューの要約を PR 本文に書くこと。`
    );
    return;
  }
  if (outcome.mode === 'baseline-missing') {
    console.error(
      'NG baseline (scripts/audit-baseline.json) が無い。パッケージ集合をレビューしたうえで `bun scripts/audit-dependencies.ts --update` を実行する。'
    );
    process.exit(1);
  }
  if (outcome.mode === 'baseline-corrupt' || !outcome.diff) {
    console.error(
      'NG baseline (scripts/audit-baseline.json) が JSON として壊れているか形式が不正。改竄の可能性もあるため `git log -p scripts/audit-baseline.json` で履歴を確認してから `--update` で作り直す。'
    );
    process.exit(1);
  }
  if (!outcome.ok) {
    printFailure(outcome.diff);
    process.exit(1);
  }
  console.warn(
    `OK lifecycle script 持ち ${outcome.totalScanned} package(s)、baseline との差分なし。`
  );
}

if (import.meta.main) {
  main();
}
