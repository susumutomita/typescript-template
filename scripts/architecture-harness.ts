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
import { readdir, readFile, stat } from 'node:fs/promises';
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
  // リポジトリ前提 (REPO_CHECKS) なしで単体スキャン可能なルール。
  // --skills-only モードではこのフラグを持つルールだけが実行される。
  standalone?: boolean;
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

// packages/ src/ scripts/ のアプリ・ツール実装 (テスト・モック・fixture を除く)。
// anti-MVP 系ルールが共有する scope。
const isImplSource = (p: string, ext = /\.(ts|tsx|js|jsx)$/): boolean =>
  (p.startsWith('packages/') ||
    p.startsWith('src/') ||
    p.startsWith('scripts/')) &&
  ext.test(p) &&
  !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) &&
  !/(^|\/)(__mocks__|__fixtures__|__tests__|tests?)\//.test(p);

// INVARIANT_NO_GIT_DEPENDENCY: version specifier の許可形 (registry-style のみ)。
// semver ranges, ^x.y.z, ~x.y.z, x.y.z, *, latest, workspace:* など。
const REGISTRY_SPEC =
  /^(workspace:|catalog:|npm:|file:packages\/|[\^~><=*]|\d|latest$|\*$)/;
// git+, github:, gitlab:, http(s)://, file:, link: など、レジストリ外参照。
const NON_REGISTRY_URL =
  /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:)/;

// 1 依存の version specifier を検査する。NO_GIT_DEPENDENCY の per-dep ロジックを
// 切り出して check 本体の認知的複雑度を下げる (Quality Bar の単一責務)。
function inspectDependencySpec(
  filePath: string,
  section: string,
  name: string,
  spec: unknown
): Finding | null {
  if (typeof spec !== 'string') return null;
  if (REGISTRY_SPEC.test(spec)) return null;
  if (NON_REGISTRY_URL.test(spec)) {
    return {
      rule: 'INVARIANT_NO_GIT_DEPENDENCY',
      severity: 'error',
      file: filePath,
      message: `${section}.${name} がレジストリ外参照 (${spec}) — Shai-Hulud 2nd 系は github URL の optionalDependencies で侵入する。レジストリ公開版を使う`,
    };
  }
  // 想定外のフォーマットは警告止まりにとどめる (将来の表記ゆれを許容)
  return {
    rule: 'INVARIANT_NO_GIT_DEPENDENCY',
    severity: 'warning',
    file: filePath,
    message: `${section}.${name} の version 表記 (${spec}) を確認。レジストリ semver 以外は避ける`,
  };
}

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
  {
    id: 'INVARIANT_INSTALL_IGNORE_SCRIPTS',
    description:
      'パッケージインストール (install / add / ci) は --ignore-scripts 付きで叩く (Shai-Hulud 系 lifecycle 攻撃対策)',
    scope: (p) =>
      p === 'Makefile' ||
      p.endsWith('.mk') ||
      p.endsWith('.sh') ||
      p.endsWith('.yml') ||
      p.endsWith('.yaml') ||
      p.endsWith('Dockerfile') ||
      /(^|\/)Dockerfile(\.|$)/.test(p),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const lines = content.split('\n');
      // (bun|npm|pnpm|yarn) の install / add / ci 系コマンドのうち
      // --ignore-scripts を含まない行を検出。
      // - bun add / bun install / bun i / bun ci
      // - npm install / npm i / npm ci / npm add
      // - pnpm add / pnpm install / pnpm i / pnpm ci
      // - yarn add / yarn install
      // パッケージを取り込むコマンドはすべて lifecycle script 経由の侵入経路になり得るので、
      // CLI フラグで明示的に止める。例外: コメント行、`npm install -g typescript` のような
      // グローバルインストールも同じ扱い (危険なので明示的に --ignore-scripts を付けさせる)。
      const INSTALL_VERB = /\b(bun|npm|pnpm|yarn)\s+(install|add|i|ci|a)\b/;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        if (!INSTALL_VERB.test(line)) continue;
        if (/--ignore-scripts\b/.test(line)) continue;
        findings.push({
          rule: 'INVARIANT_INSTALL_IGNORE_SCRIPTS',
          severity: 'error',
          file: filePath,
          line: i + 1,
          message:
            'install / add / ci 系コマンドに --ignore-scripts を付ける (lifecycle script 経由のサプライチェーン攻撃を封じる)',
        });
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_GIT_DEPENDENCY',
    description:
      'package.json の依存は npm レジストリ経由のみ (git/github/任意 URL を避ける)',
    scope: (p) => p === 'package.json' || /\/package\.json$/.test(p),
    check: ({ path: filePath, content }) => {
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(content);
      } catch {
        return []; // 壊れた JSON は別ルールで検出される
      }
      const sections = [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ];
      const findings: Finding[] = [];
      for (const section of sections) {
        const deps = pkg[section];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, spec] of Object.entries(
          deps as Record<string, unknown>
        )) {
          const finding = inspectDependencySpec(filePath, section, name, spec);
          if (finding) findings.push(finding);
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_KNOWN_IOC',
    description:
      'Shai-Hulud 系の既知 IOC (tanstack_runner.js / router_init.js / gh-token-monitor 等) をリポジトリに混入させない',
    scope: (p) => {
      // ファイル名で判定 (内容は読み込まない)。下の check は file path のみを見る。
      const name = p.split('/').pop() ?? p;
      return (
        /^tanstack_runner\.(js|cjs|mjs|ts)$/.test(name) ||
        /^router_init\.(js|cjs|mjs|ts)$/.test(name) ||
        /^gh[-_]token[-_]monitor\.(plist|service|sh|js|ts)$/i.test(name) ||
        /^com\.user\.gh-token-monitor\.plist$/.test(name) ||
        /^codeql_analysis\.ya?ml$/.test(name) ||
        // .claude/setup.mjs / .vscode/setup.mjs は Wave 2 が永続化に使うファイル
        p === '.claude/setup.mjs' ||
        p === '.vscode/setup.mjs'
      );
    },
    check: ({ path: filePath }) => [
      {
        rule: 'INVARIANT_NO_KNOWN_IOC',
        severity: 'error' as Severity,
        file: filePath,
        message:
          'Shai-Hulud 2nd 等で観測された IOC (Indicator of Compromise) のファイル名と一致。リポジトリに混入していないか確認',
      },
    ],
  },
  {
    id: 'INVARIANT_LIFECYCLE_HOOK_SCOPED',
    description:
      'package.json の lifecycle hook (preinstall/postinstall/prepare/postprepare) は許可リスト内のコマンドのみ',
    scope: (p) => p === 'package.json' || /\/package\.json$/.test(p),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(content);
      } catch {
        return findings;
      }
      const scripts = pkg.scripts;
      if (!scripts || typeof scripts !== 'object') return findings;
      const HOOKS = [
        'preinstall',
        'install',
        'postinstall',
        'prepare',
        'postprepare',
        'preprepare',
      ];
      // 許可: husky (hook setup), 空文字, "echo ..." 程度
      const ALLOW = /^(husky( |$)|echo( |$)|: ?$|true$)/;
      for (const hook of HOOKS) {
        const cmd = (scripts as Record<string, string>)[hook];
        if (typeof cmd !== 'string') continue;
        if (ALLOW.test(cmd.trim())) continue;
        findings.push({
          rule: 'INVARIANT_LIFECYCLE_HOOK_SCOPED',
          severity: 'error',
          file: filePath,
          message: `scripts.${hook} = "${cmd}" — lifecycle hook は許可リスト (husky 等) のみ。攻撃面を増やす任意処理は別 script に分けて手動実行する`,
        });
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_SKILL_FRONTMATTER_VALID',
    description:
      'SKILL.md は frontmatter に name/description を持ち、name はディレクトリ名と一致する',
    standalone: true,
    scope: (p) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(p),
    check: ({ path: filePath, content }) =>
      checkFrontmatterDoc({
        rule: 'INVARIANT_SKILL_FRONTMATTER_VALID',
        filePath,
        content,
        // スキル名はディレクトリ名と同期させる (公開 API として扱う)。
        expectedName: filePath.split('/')[2],
        docLabel: 'SKILL.md',
        nameSource: 'ディレクトリ名',
      }),
  },
  {
    id: 'INVARIANT_AGENT_FRONTMATTER_VALID',
    description:
      'subagent 定義 (.claude/agents/<name>.md) は frontmatter に name/description を持ち、name はファイル名と一致する',
    standalone: true,
    scope: (p) => /^\.claude\/agents\/[^/]+\.md$/.test(p),
    check: ({ path: filePath, content }) =>
      checkFrontmatterDoc({
        rule: 'INVARIANT_AGENT_FRONTMATTER_VALID',
        filePath,
        content,
        // subagent 名はファイル名 (拡張子除く) と同期させる (公開 API として扱う)。
        expectedName: (filePath.split('/').pop() ?? filePath).replace(
          /\.md$/,
          ''
        ),
        docLabel: 'subagent 定義',
        nameSource: 'ファイル名',
      }),
  },
  {
    id: 'INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS',
    description:
      '.claude 配下のファイルに隠し指示チャネル (不可視 Unicode / base64 ブロック / HTML コメント) を置かない',
    standalone: true,
    scope: (p) => p.startsWith('.claude/'),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const isMarkdown = filePath.endsWith('.md');
      // 隠し指示チャネルの検出テーブル。新しいチャネルは 1 エントリ追加で足せる。
      const CHANNELS: Array<{
        pattern: RegExp;
        severity: Severity;
        mdOnly?: boolean;
        message: string;
      }> = [
        {
          // ゼロ幅・双方向制御文字 (prompt injection の隠蔽に使われる)
          pattern:
            /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/,
          severity: 'error',
          message:
            'ゼロ幅/双方向 Unicode 制御文字を検出。不可視文字に隠した指示は prompt injection の典型チャネル',
        },
        {
          // ZWNJ/ZWJ は複合絵文字やペルシア語等で正当に使われるため warning 止まり
          pattern: /[\u200C\u200D]/,
          severity: 'warning',
          message:
            'ZWNJ/ZWJ (U+200C/U+200D) を検出。複合絵文字等の正当な用途もあるが隠し指示にも使われるため、意図を確認する',
        },
        {
          // 連続 120 文字以上の base64 風ブロック (デコードして実行する系の payload)
          pattern: /[A-Za-z0-9+/]{120,}={0,2}/,
          severity: 'error',
          message:
            '120 文字以上の base64 風ブロックを検出。デコード実行型 payload の混入が疑われるため、内容を平文で書くか外部ファイルに逃がす',
        },
        {
          // HTML コメントは markdown のみ対象 (他形式では正当な構文に現れうる)
          pattern: /<!--/,
          severity: 'warning',
          mdOnly: true,
          message:
            'HTML コメントを検出。モデルには見えるが人間のレビューでは見落としやすい隠し指示チャネルになるため、平文で書く',
        },
      ];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const channel of CHANNELS) {
          if (channel.mdOnly && !isMarkdown) continue;
          if (!channel.pattern.test(lines[i])) continue;
          findings.push({
            rule: 'INVARIANT_SKILL_NO_HIDDEN_INSTRUCTIONS',
            severity: channel.severity,
            file: filePath,
            line: i + 1,
            message: channel.message,
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_SKILL_NO_EXFIL_EXEC',
    description:
      'スキル・フックにリモート取得のシェルパイプ実行や base64 デコード実行を置かない',
    standalone: true,
    scope: (p) =>
      p.startsWith('.claude/skills/') ||
      p.startsWith('.claude/scripts/') ||
      p.startsWith('.claude/rules/') ||
      p === '.claude/settings.json',
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      // 注意: このファイル群に検出対象パターンをリテラルで書くと自己検出する。
      // ドキュメントやスキル本文では「リモート取得のシェルパイプ実行」のように言い換える。
      // 既知の限界 (行単位の静的検査): プロセス置換 sh <(...)、バッククォート置換、
      // shell 以外への パイプ (python 等)、\ による行継続は検出しない。
      // curl/wget の結果をシェルに流す (リモートコード実行)。sudo/env 経由も拾う
      const FETCH_PIPE_SHELL =
        /\b(curl|wget)\b[^|;&\n]*\|\s*((sudo|env)\s+)*\w*sh\b/;
      // base64 デコードを実行系に流す
      const BASE64_EXEC =
        /\bbase64\s+(-d|-D|--decode)\b[^|;&\n]*\|\s*((sudo|env)\s+)*(\w*sh|node|bun)\b/;
      // eval "$(curl ...)" / bash -c "$(curl ...)" 型
      const EVAL_REMOTE =
        /\b(eval|\w*sh\s+(-\w+\s+)*-c)\s+["']?\$\(\s*(curl|wget)\b/;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          FETCH_PIPE_SHELL.test(line) ||
          BASE64_EXEC.test(line) ||
          EVAL_REMOTE.test(line)
        ) {
          findings.push({
            rule: 'INVARIANT_SKILL_NO_EXFIL_EXEC',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message:
              'リモート取得・base64 デコードをシェルに流す実行パターンを検出。スキル/フック経由のコード実行はサプライチェーン攻撃の入口になるため、取得と実行を分離してレビュー可能にする',
          });
        }
      }
      return findings;
    },
  },
  // 既知の限界 (以下 2 ルールの行単位静的検査): 文字列・コメント中にパターンを「言及」
  // しただけの行もマッチしうる。語彙レベルの精密判定は Biome (AST) に委ね、
  // まれな曖昧ケースは /review で見る。手書きで字句解析を再実装しない。
  {
    id: 'INVARIANT_NO_MVP_PLACEHOLDER',
    description:
      '実装に手抜き・未完成のシグナル (作業中マーカー / 未実装 throw) を残さない。空 catch・any は Biome が拾う',
    standalone: true,
    scope: (p) => isImplSource(p),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      const flag = (line: number, message: string) =>
        findings.push({
          rule: 'INVARIANT_NO_MVP_PLACEHOLDER',
          severity: 'error',
          file: filePath,
          line,
          message,
        });
      // 検出語をソースに連続文字列で書くと自己検出する (本ファイルも scripts/ で scope 内)。
      // 断片から組み立てて回避する。
      const markers = [
        ['T', 'ODO'],
        ['FIX', 'ME'],
        ['HA', 'CK'],
        ['X', 'XX'],
      ].map((parts) => parts.join(''));
      // 作業中マーカーはコメント内だけを大小無視で検出する。識別子・文字列を誤検知しない。
      // 行コメント // は直前が : でない場合のみ扱い、文字列中の https:// を除外する。
      const commentMarker = new RegExp(
        `((?<!:)//|/\\*|^\\s*\\*).*\\b(${markers.join('|')})\\b`,
        'i'
      );
      // not implemented / unimplemented / NotImplementedError 等を語幹で拾う (大小無視)。
      const impl = ['imple', 'ment'].join('');
      const notImpl = new RegExp(`(not[\\s_-]*${impl}|un${impl})`, 'i');
      const throwKeyword = /\bthrow\b/;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (commentMarker.test(line)) {
          flag(
            i + 1,
            'やり残しを示す作業中マーカーをコメントに残さない。/follow-up に切るか、その場で完了させる'
          );
        }
        if (throwKeyword.test(line) && notImpl.test(line)) {
          flag(
            i + 1,
            '未実装を示す throw を残さない。仮実装ではなく完成した実装を出す'
          );
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_TYPE_ESCAPE_HATCH',
    description:
      'TypeScript の型エスケープのうち Biome が拾わないもの (unknown 経由の二段キャスト / nocheck・expect-error ディレクティブ) を残さない',
    standalone: true,
    scope: (p) => isImplSource(p, /\.(ts|tsx)$/),
    check: ({ path: filePath, content }) => {
      const findings: Finding[] = [];
      // 役割分担: any 系のキャストは Biome の noExplicitAny、ts-ignore ディレクティブは
      // Biome の noTsIgnore が AST で拾う。ここでは Biome に対応ルールが無いものだけを見る。
      // 自己検出回避のため検出語は断片から組み立てる。
      const asUnknownAs = /\bas\s+unknown\s+as\b/;
      const suppress = new RegExp(
        `@ts-(${['noche', 'ck'].join('')}|${['expect', '-error'].join('')})`
      );
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (asUnknownAs.test(line) || suppress.test(line)) {
          findings.push({
            rule: 'INVARIANT_NO_TYPE_ESCAPE_HATCH',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message:
              '型を回避しない。unknown 経由の二段キャストや型抑制ディレクティブをやめ、外部入力は境界で検証して型を保つ',
          });
        }
      }
      return findings;
    },
  },
];

// frontmatter (name/description) を持つサプライチェーン成果物 (SKILL.md / agents) の
// 共通検証ロジック。name の期待値と表示ラベルだけがルール間で異なるため、ここに集約して
// スキル invariant と agent invariant の重複実装を避ける (ADR-0002 / ADR-0005)。
interface FrontmatterDocSpec {
  rule: string;
  filePath: string;
  content: string;
  // frontmatter の name と一致すべき値 (スキルはディレクトリ名、agent はファイル名)。
  expectedName: string;
  // メッセージに出すドキュメント種別の表示名 (例: "SKILL.md" / "subagent 定義")。
  docLabel: string;
  // name の期待値の出所をメッセージに出すラベル (例: "ディレクトリ名" / "ファイル名")。
  nameSource: string;
}

function checkFrontmatterDoc(spec: FrontmatterDocSpec): Finding[] {
  const findings: Finding[] = [];
  const flag = (message: string, severity: Severity = 'error', line?: number) =>
    findings.push({
      rule: spec.rule,
      severity,
      file: spec.filePath,
      line,
      message,
    });
  const fm = parseFrontmatter(spec.content);
  if (!fm) {
    flag(
      `${spec.docLabel} に YAML frontmatter (--- で囲まれた name/description) が無い、または YAML として読めない`,
      'error',
      1
    );
    return findings;
  }
  const name = fm.name?.trim();
  if (!name) {
    flag('frontmatter に name が無い');
  } else if (name !== spec.expectedName) {
    flag(
      `frontmatter の name (${name}) が${spec.nameSource} (${spec.expectedName}) と一致しない。名前は公開 API として扱い、${spec.nameSource}と同期させる`
    );
  }
  const description = fm.description?.trim();
  if (!description) {
    flag('frontmatter に description が無い');
  } else {
    if (description.length < 50) {
      flag(
        `description が ${description.length} 文字と短い。発火条件が曖昧になるため、対象・サブコマンド・「いつ使うか」をトリガー語彙として 50 文字以上で書く`,
        'warning'
      );
    }
    if (description.length > 1024) {
      flag(
        `description が ${description.length} 文字。Claude Code の上限 (1024 文字) を超えている`
      );
    }
  }
  return findings;
}

// frontmatter (--- で囲まれた YAML) を Bun ランタイム組み込みの YAML パーサで読む。
// 依存ゼロ方針 (ADR-0001) は維持 — Bun.YAML はランタイム同梱でありライブラリ追加ではない。
function parseFrontmatter(content: string): Record<string, string> | null {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return null; // 終端の --- が無い
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(lines.slice(1, end).join('\n'));
  } catch {
    return null; // YAML として壊れている
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null || typeof value === 'object') continue;
    out[key] = String(value);
  }
  return out;
}

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
  {
    id: 'INVARIANT_LOCKFILE_NO_GIT_RESOLUTION',
    description:
      'bun.lock / package-lock.json / pnpm-lock.yaml に github / git+ 解決された依存が無い',
    check: async (root) => {
      const findings: Finding[] = [];
      const lockfiles = [
        'bun.lock',
        'bun.lockb',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
      ];
      for (const name of lockfiles) {
        const p = path.join(root, name);
        try {
          await stat(p);
        } catch {
          continue;
        }
        if (name === 'bun.lockb') {
          // バイナリロックファイルは grep できないため、警告のみ
          findings.push({
            rule: 'INVARIANT_LOCKFILE_NO_GIT_RESOLUTION',
            severity: 'warning',
            file: name,
            message:
              'bun.lockb はバイナリ形式で静的検査が難しい。bunfig.toml saveTextLockfile=true で bun.lock (text) に切り替えるとサプライチェーン監査がやりやすい',
          });
          continue;
        }
        let content: string;
        try {
          content = await readFile(p, 'utf8');
        } catch {
          continue;
        }
        // git+ / github: / 任意の git URL で解決された行を検出
        const suspicious =
          /(git\+ssh:|git\+https?:|git:\/\/|github\.com\/[^/\s"']+\/[^/\s"']+(\.git)?#|resolved":\s*"git\+|resolution":\s*\{[^}]*"type":\s*"git")/i;
        if (suspicious.test(content)) {
          findings.push({
            rule: 'INVARIANT_LOCKFILE_NO_GIT_RESOLUTION',
            severity: 'error',
            file: name,
            message: `${name} に git/github で解決された依存がある。Shai-Hulud 2nd は optionalDependencies + github URL で侵入する。レジストリ公開版に切り替える`,
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT',
    description:
      'bunfig.toml に trustedDependencies = [] が明示されている (Bun の暗黙信頼を空にする)',
    check: async (root) => {
      const findings: Finding[] = [];
      const bunfigPath = path.join(root, 'bunfig.toml');
      try {
        const content = await readFile(bunfigPath, 'utf8');
        if (!/trustedDependencies\s*=\s*\[\s*\]/m.test(content)) {
          findings.push({
            rule: 'INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT',
            severity: 'error',
            file: 'bunfig.toml',
            message:
              'bunfig.toml に trustedDependencies = [] が無い。Bun は top 500 npm パッケージを暗黙信頼するため、明示的に空配列で上書きする',
          });
        }
      } catch {
        findings.push({
          rule: 'INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT',
          severity: 'error',
          file: 'bunfig.toml',
          message:
            'bunfig.toml が存在しない。Bun の trustedDependencies = [] を明示する正本として置く',
        });
      }
      return findings;
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
  // standalone フラグ付きルールのみ実行し、REPO_CHECKS をスキップする。
  // リポジトリ外に置いたサードパーティスキル候補を /skill-audit pre-install で
  // 検査する用途 (bunfig.toml 等のリポジトリ前提を要求しない)。
  skillsOnly: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    root: process.cwd(),
    staged: false,
    skillsOnly: false,
  };
  for (const arg of argv) {
    if (arg === '--staged') opts.staged = true;
    else if (arg === '--skills-only') opts.skillsOnly = true;
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

  // 1) repository-level checks (--skills-only ではスキップ)
  if (!opts.skillsOnly) {
    for (const r of REPO_CHECKS) {
      findings.push(...(await r.check(opts.root)));
    }
  }

  // 2) file-level checks
  const activeRules = opts.skillsOnly
    ? RULES.filter((r) => r.standalone)
    : RULES;
  const candidatePaths = opts.staged
    ? listStagedFiles(opts.root)
    : await walkRepo(opts.root);

  for (const rel of candidatePaths) {
    const applicable = activeRules.filter((r) => r.scope(rel));
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

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error('[architecture-harness] failed:', err);
    process.exitCode = 1;
  });
}

export type { Finding, RepoCheck, Rule, Severity };
// テスト (scripts/architecture-harness.test.ts) から invariant を直接検証するための export。
export { parseFrontmatter, REPO_CHECKS, RULES };
