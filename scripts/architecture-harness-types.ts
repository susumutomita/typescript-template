type Severity = 'error' | 'warning';
type RuleGroup = 'pre-release';

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
  groups?: readonly RuleGroup[];
  standalone?: boolean;
  scope: (filePath: string) => boolean;
  check: (file: { path: string; content: string }) => Finding[];
}

interface RepoCheck {
  id: string;
  description: string;
  check: (root: string) => Promise<Finding[]>;
}

export type { Finding, RepoCheck, Rule, RuleGroup, Severity };
