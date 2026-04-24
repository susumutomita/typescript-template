#!/usr/bin/env bun
/**
 * Architecture Harness — リポジトリ全体の invariant を機械的に検証する。
 *
 * 設計:
 * - 依存ゼロ (Bun ランタイム + 標準モジュールのみ)
 * - invariant は本ファイル先頭の RULES に並べる。追加は RULES への push のみで完結する
 * - 実行は `--staged` (git ステージ済の変更だけ) または全件スキャンの 2 モード
 * - `--fail-on=error|warning` で exit code を制御 (CI / pre-commit hook 用)
 * - 出力は markdown 1 形式 (TenkaCloud の architecture-harness と互換)
 *
 * Invariant の正本は docs/architecture/harness.md。本ファイルはあくまで自動検出器。
 * docs にあるが script で検出できない invariant は、コードレビューで担保する。
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

type Severity = 'error' | 'warning';

interface Finding {
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
  message: string;
}

interface Rule {
  id: string;
  description: string;
  // ファイル単位のチェック (false を返したら skip)
  scope: (filePath: string) => boolean;
  check: (file: { path: string; content: string }) => Finding[];
}

interface RepoCheck {
  id: string;
  description: string;
  check: (root: string) => Promise<Finding[]>;
}

// --- File-level invariants ---

const RULES: Rule[] = [
  {
    id: 'INVARIANT_NO_NPX',
    description: 'npx ではなく nlx / bunx を使う',
    scope: (p) =>
      p.endsWith('package.json') ||
      p.endsWith('.sh') ||
      p.endsWith('.yml') ||
      p.endsWith('.yaml'),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // `npx ` (空白付き) を検出。`bunx`/`nlx` は許可。コメントの可能性は許容して error 扱い。
        if (/(^|\s|"|`|\$\()npx\s/.test(line)) {
          findings.push({
            rule: 'INVARIANT_NO_NPX',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: 'npx は禁止。nlx または bunx を使う',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_MOCK_DATA',
    description: 'アプリケーション実装にスタブ/モックデータを混ぜない',
    scope: (p) =>
      (p.startsWith('packages/') || p.startsWith('src/')) &&
      /\.(ts|tsx|js|jsx)$/.test(p) &&
      !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) &&
      !/__mocks__|__fixtures__|test\//.test(p),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\b(MOCK_[A-Z_]+|mockData|stubApi|fakeUsers)\b/.test(line)) {
          findings.push({
            rule: 'INVARIANT_NO_MOCK_DATA',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message:
              'アプリ実装に mock/stub/fake データを置かない (テストでは Real DB / Real API を使う)',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_TEST_FOCUS',
    description: 'コミット前に .only / .skip / xit / xdescribe を残さない',
    scope: (p) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          /\b(it|test|describe)\.(only|skip)\b/.test(line) ||
          /\b(xit|xdescribe)\s*\(/.test(line)
        ) {
          findings.push({
            rule: 'INVARIANT_NO_TEST_FOCUS',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message:
              'テストの .only / .skip / xit / xdescribe をコミット前に外す',
          });
        }
      }
      return findings;
    },
  },
];

// --- Repository-level invariants ---

const REPO_CHECKS: RepoCheck[] = [
  {
    id: 'INVARIANT_HARNESS_DOC_AUTHORITATIVE',
    description: 'harness 正本ドキュメントが存在し空でない',
    check: async (root) => {
      const harnessPath = path.join(root, 'docs/architecture/harness.md');
      try {
        const stats = await stat(harnessPath);
        if (stats.size < 100) {
          return [
            {
              rule: 'INVARIANT_HARNESS_DOC_AUTHORITATIVE',
              severity: 'error',
              file: 'docs/architecture/harness.md',
              message:
                'harness.md が空、または極端に短い。invariant を明文化すること',
            },
          ];
        }
      } catch {
        return [
          {
            rule: 'INVARIANT_HARNESS_DOC_AUTHORITATIVE',
            severity: 'error',
            file: 'docs/architecture/harness.md',
            message: 'docs/architecture/harness.md が存在しない',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'INVARIANT_ADR_TEMPLATE_PRESENT',
    description: 'ADR テンプレート (docs/adr/0000-template.md) が存在する',
    check: async (root) => {
      try {
        await stat(path.join(root, 'docs/adr/0000-template.md'));
        return [];
      } catch {
        return [
          {
            rule: 'INVARIANT_ADR_TEMPLATE_PRESENT',
            severity: 'warning',
            file: 'docs/adr/0000-template.md',
            message:
              'ADR テンプレートが見つからない。新規 ADR を書く際の正本として用意する',
          },
        ];
      }
    },
  },
  {
    id: 'INVARIANT_FOLLOWUP_SKILL_PRESENT',
    description:
      'フォローアップ管理スキル (.claude/skills/follow-up/SKILL.md) が存在する (scope外発見の受け皿)',
    check: async (root) => {
      try {
        await stat(path.join(root, '.claude/skills/follow-up/SKILL.md'));
        return [];
      } catch {
        return [
          {
            rule: 'INVARIANT_FOLLOWUP_SKILL_PRESENT',
            severity: 'warning',
            file: '.claude/skills/follow-up/SKILL.md',
            message:
              '/follow-up スキルが見つからない。PR の scope 外発見を記録する仕組みを用意する',
          },
        ];
      }
    },
  },
];

// --- File walking ---

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'coverage',
  'dist',
  'build',
  'out',
  '.turbo',
  '.cache',
]);

async function walkRepo(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      const rel = path.relative(root, path.join(dir, entry.name));
      out.push(rel);
    }
  }
  await walk(root);
  return out;
}

function listStagedFiles(root: string): string[] {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { cwd: root, encoding: 'utf8' }
  );
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- CLI ---

interface CliOptions {
  root: string;
  staged: boolean;
  failOn?: Severity;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { root: process.cwd(), staged: false };
  for (const arg of argv) {
    if (arg === '--staged') opts.staged = true;
    else if (arg.startsWith('--root=')) opts.root = path.resolve(arg.slice(7));
    else if (arg.startsWith('--fail-on=')) {
      const v = arg.slice(10);
      if (v === 'error' || v === 'warning') opts.failOn = v;
    }
  }
  return opts;
}

function formatReport(findings: Finding[]): string {
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const lines: string[] = [
    '# Architecture Harness Report',
    '',
    '## Summary',
    '',
    `- Error: ${errors.length}`,
    `- Warning: ${warnings.length}`,
    `- Total: ${findings.length}`,
    '',
  ];
  if (findings.length === 0) {
    lines.push('## Findings', '', '(なし)');
    return lines.join('\n');
  }
  lines.push('## Findings', '');
  for (const f of findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`- **[${f.severity.toUpperCase()}] ${f.rule}** — ${loc}`);
    lines.push(`  ${f.message}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const findings: Finding[] = [];

  // 1) repository-level checks (常に走らせる)
  for (const r of REPO_CHECKS) {
    findings.push(...(await r.check(opts.root)));
  }

  // 2) file-level checks
  const candidatePaths = opts.staged
    ? listStagedFiles(opts.root)
    : await walkRepo(opts.root);

  for (const rel of candidatePaths) {
    const applicable = RULES.filter((r) => r.scope(rel));
    if (applicable.length === 0) continue;
    let content: string;
    try {
      content = await readFile(path.join(opts.root, rel), 'utf8');
    } catch {
      continue; // 削除ファイル等
    }
    for (const r of applicable) {
      findings.push(...r.check({ path: rel, content }));
    }
  }

  console.log(formatReport(findings));

  if (opts.failOn) {
    const hit = findings.some((f) =>
      opts.failOn === 'warning' ? true : f.severity === 'error'
    );
    if (hit) process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  console.error('[architecture-harness] failed:', err);
  process.exitCode = 1;
});
