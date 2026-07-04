import type { Finding, Rule, Severity } from './architecture-harness-types';

const PRE_RELEASE_GROUP = ['pre-release'] as const;
const CHECKLIST = 'docs/checklists/pre-release.md';
const WEB_SOURCE = /\.(html|tsx|jsx)$/;
const SCRIPT_SOURCE = /\.(ts|tsx|js|jsx)$/;

interface OpeningTag {
  name: string;
  source: string;
  start: number;
  end: number;
  line: number;
}

function isTestArtifact(filePath: string): boolean {
  return (
    /\.(test|spec)\.[^.]+$/.test(filePath) ||
    /(^|\/)(__fixtures__|__mocks__|__tests__|tests?)\//.test(filePath)
  );
}

function isAppFile(filePath: string, extension: RegExp): boolean {
  return (
    (filePath.startsWith('packages/') || filePath.startsWith('src/')) &&
    extension.test(filePath) &&
    !isTestArtifact(filePath)
  );
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}

function nextQuote(quote: string, char: string, previous: string): string {
  if (!quote) return char === '"' || char === "'" || char === '`' ? char : '';
  return char === quote && previous !== '\\' ? '' : quote;
}

function nextBraceDepth(depth: number, char: string): number {
  if (char === '{') return depth + 1;
  if (char === '}') return Math.max(0, depth - 1);
  return depth;
}

function findTagEnd(content: string, start: number): number {
  let quote = '';
  let braceDepth = 0;
  for (let index = start; index < content.length; index++) {
    const char = content[index];
    const updatedQuote = nextQuote(quote, char, content[index - 1] ?? '');
    if (updatedQuote !== quote) {
      quote = updatedQuote;
      continue;
    }
    if (quote) continue;
    braceDepth = nextBraceDepth(braceDepth, char);
    if (char === '>' && braceDepth === 0) return index;
  }
  return -1;
}

function openingTags(content: string): OpeningTag[] {
  const tags: OpeningTag[] = [];
  const startPattern = /<([A-Za-z][\w.:-]*)\b/g;
  for (const match of content.matchAll(startPattern)) {
    const start = match.index;
    const end = findTagEnd(content, start + match[0].length);
    if (end === -1) continue;
    tags.push({
      name: match[1],
      source: content.slice(start, end + 1),
      start,
      end: end + 1,
      line: lineAt(content, start),
    });
  }
  return tags;
}

function hasVisibleText(content: string): boolean {
  let cursor = 0;
  while (cursor < content.length) {
    const char = content[cursor];
    if (/\s/.test(char)) {
      cursor++;
      continue;
    }
    if (char !== '<') return true;
    const end = findTagEnd(content, cursor + 1);
    if (end === -1) return true;
    cursor = end + 1;
  }
  return false;
}

function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*=`, 'i').test(tag);
}

function quotedAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'is').exec(tag);
  return match?.[2] ?? null;
}

function finding(
  rule: string,
  severity: Severity,
  file: string,
  line: number,
  message: string
): Finding {
  return {
    rule,
    severity,
    file,
    line,
    message: `${message}。確認先: ${CHECKLIST}`,
  };
}

function regexFindings(
  rule: string,
  filePath: string,
  content: string,
  pattern: RegExp,
  message: string
): Finding[] {
  return Array.from(content.matchAll(pattern), (match) =>
    finding(rule, 'error', filePath, lineAt(content, match.index), message)
  );
}

function externalLinkFinding(
  filePath: string,
  tag: OpeningTag
): Finding | null {
  if (!hasAttribute(tag.source, 'rel')) {
    return finding(
      'INVARIANT_EXTERNAL_LINK_SAFE',
      'error',
      filePath,
      tag.line,
      'target="_blank" には rel="noopener noreferrer" を指定する'
    );
  }
  const rel = quotedAttribute(tag.source, 'rel');
  if (rel === null) {
    return finding(
      'INVARIANT_EXTERNAL_LINK_SAFE',
      'warning',
      filePath,
      tag.line,
      '動的 rel が noopener noreferrer の両方を常に返すことを確認する'
    );
  }
  const values = new Set(rel.toLowerCase().split(/\s+/));
  if (values.has('noopener') && values.has('noreferrer')) return null;
  return finding(
    'INVARIANT_EXTERNAL_LINK_SAFE',
    'error',
    filePath,
    tag.line,
    'target="_blank" には rel="noopener noreferrer" を指定する'
  );
}

const PRE_RELEASE_RULES: Rule[] = [
  {
    id: 'INVARIANT_NO_CLIENT_AUTH_STORAGE',
    description:
      'localStorage / sessionStorage に認証情報らしいキーや値を保存しない',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, SCRIPT_SOURCE),
    check: ({ path: filePath, content }) => {
      const setItem =
        /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(([\s\S]*?)\)/gi;
      const property =
        /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*(?:\.|\[\s*["'`])(?:[\w-]*(?:token|auth|session|credential)[\w-]*)/gi;
      const sensitive =
        /\b(?:accessToken|refreshToken|idToken|token|auth|session|credential)s?\b/i;
      const findings = Array.from(content.matchAll(setItem))
        .filter((match) => sensitive.test(match[1]))
        .map((match) =>
          finding(
            'INVARIANT_NO_CLIENT_AUTH_STORAGE',
            'error',
            filePath,
            lineAt(content, match.index),
            '認証情報を JavaScript から読めるブラウザストレージへ保存しない'
          )
        );
      findings.push(
        ...regexFindings(
          'INVARIANT_NO_CLIENT_AUTH_STORAGE',
          filePath,
          content,
          property,
          '認証情報を JavaScript から読めるブラウザストレージへ保存しない'
        )
      );
      return findings;
    },
  },
  {
    id: 'INVARIANT_NO_DANGEROUS_HTML',
    description:
      'React の危険な HTML 注入と DOM innerHTML 代入をアプリ実装に残さない',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, SCRIPT_SOURCE),
    check: ({ path: filePath, content }) =>
      regexFindings(
        'INVARIANT_NO_DANGEROUS_HTML',
        filePath,
        content,
        /\bdangerouslySetInnerHTML\b|\.\s*innerHTML\s*=/g,
        '未検証の HTML 注入経路を使わず、React のテキストエスケープを維持する'
      ),
  },
  {
    id: 'INVARIANT_EXTERNAL_LINK_SAFE',
    description: 'target blank のリンクに noopener noreferrer の両方を指定する',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, WEB_SOURCE),
    check: ({ path: filePath, content }) =>
      openingTags(content)
        .filter((tag) =>
          /\btarget\s*=\s*(?:["']_blank["']|\{\s*["'`]_blank["'`]\s*\})/i.test(
            tag.source
          )
        )
        .map((tag) => externalLinkFinding(filePath, tag))
        .filter((result): result is Finding => result !== null),
  },
  {
    id: 'INVARIANT_IMAGE_ALT_REQUIRED',
    description: 'ネイティブ img 要素に alt 属性を必須にする',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, WEB_SOURCE),
    check: ({ path: filePath, content }) =>
      openingTags(content)
        .filter(
          (tag) =>
            tag.name.toLowerCase() === 'img' && !hasAttribute(tag.source, 'alt')
        )
        .map((tag) =>
          finding(
            'INVARIANT_IMAGE_ALT_REQUIRED',
            'error',
            filePath,
            tag.line,
            'img に内容を表す alt、または装飾画像を示す空 alt を指定する'
          )
        ),
  },
  {
    id: 'INVARIANT_ICON_BUTTON_ACCESSIBLE_NAME',
    description:
      'アイコンだけの button に accessible name があることを確認する',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, WEB_SOURCE),
    check: ({ path: filePath, content }) =>
      openingTags(content)
        .filter((tag) => tag.name.toLowerCase() === 'button')
        .filter(
          (tag) =>
            !['aria-label', 'aria-labelledby', 'title'].some((attribute) =>
              hasAttribute(tag.source, attribute)
            )
        )
        .filter((tag) => {
          const close = content.toLowerCase().indexOf('</button>', tag.end);
          if (close === -1) return false;
          return !hasVisibleText(content.slice(tag.end, close));
        })
        .map((tag) =>
          finding(
            'INVARIANT_ICON_BUTTON_ACCESSIBLE_NAME',
            'warning',
            filePath,
            tag.line,
            'アイコンだけの button に aria-label などの accessible name を指定する'
          )
        ),
  },
  {
    id: 'INVARIANT_PUBLIC_METADATA_PRESENT',
    description:
      '公開 index.html に言語、description、canonical、OGP、Twitter Card を必須にする',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) =>
      isAppFile(filePath, /\.html$/) && /(^|\/)index\.html$/.test(filePath),
    check: ({ path: filePath, content }) => {
      const requirements: Array<[string, RegExp]> = [
        ['html lang', /<html\b[^>]*\blang\s*=/i],
        ['meta description', /<meta\b[^>]*\bname=["']description["']/i],
        [
          'canonical URL',
          /<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["']/i,
        ],
        ['og:title', /<meta\b[^>]*\bproperty=["']og:title["']/i],
        ['og:description', /<meta\b[^>]*\bproperty=["']og:description["']/i],
        ['og:url', /<meta\b[^>]*\bproperty=["']og:url["']/i],
        ['og:image', /<meta\b[^>]*\bproperty=["']og:image["']/i],
        ['twitter:card', /<meta\b[^>]*\bname=["']twitter:card["']/i],
      ];
      return requirements
        .filter(([, pattern]) => !pattern.test(content))
        .map(([label]) =>
          finding(
            'INVARIANT_PUBLIC_METADATA_PRESENT',
            'error',
            filePath,
            1,
            `公開 index.html に ${label} を指定する`
          )
        );
    },
  },
  {
    id: 'INVARIANT_NO_PRODUCTION_NOINDEX',
    description: '本番向けの HTML / JSX / TSX に noindex を残さない',
    groups: PRE_RELEASE_GROUP,
    scope: (filePath) => isAppFile(filePath, WEB_SOURCE),
    check: ({ path: filePath, content }) =>
      regexFindings(
        'INVARIANT_NO_PRODUCTION_NOINDEX',
        filePath,
        content,
        /\bnoindex\b/gi,
        '本番向けページの noindex を外す。検索非公開が要件なら ADR に残す'
      ),
  },
];

export { PRE_RELEASE_RULES };
