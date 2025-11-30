# CLAUDE.md — Claude Agent 開発ガイドライン

このドキュメントは、Claude Code や AI エージェントが自律的に開発を進めるためのガイドラインです。

---

## 開発の基本原則

### 1. 実装方針

- **動くものをイテレーティブに作る**: 完璧を目指さず、小さく動くものを素早く作り、段階的に改善する
- **Plan.md でプロセスを記録**: すべての意思決定、実装内容、振り返りを `Plan.md` に記録する
- **テスト駆動開発 (TDD)**: コードを書く前にテストを書く
- **カバレッジ 100％**: すべてのコードパスをテストでカバーする
- **BDD スタイルのテスト**: テストは振る舞いを記述し、テストタイトルは日本語で書く

### 2. ドキュメント作成方針

- 文末は「。」で終える。コロンや記号で文を終わらせない
- 日本語と半角英数字の間には半角スペースを入れ、全角・半角の混在を避ける
- 見出しや箇条書きでは過度な装飾をしない。絵文字と太字の併用は避け、簡潔に書く
- 技術用語・記号は原語を保ちつつ、日本語文脈に合わせて表記ゆれをなくす
- lint/textlint は最終安全網と位置づけ、執筆時点で上記ルールを意識してエラーを作らないことを優先する

---

## プロダクションレディ実装原則

**CRITICAL**: モックアップレベルではなく、プロダクションレベルのコードを一発で作成する。

### No Mock, No Stub — 実装する時は本物を作る

- 禁止: モックデータ、ハードコードされた配列、スタブ API
- 必須: 実際のデータベース接続、実際の API 統合、実際のファイル I/O

```typescript
// ❌ NG: モックデータを返す
export async function getUsers() {
  return [
    { id: 1, name: "Mock User" },
  ];
}

// ✅ OK: 実際のデータベース接続
export async function getUsers(session: Session) {
  if (!session?.user) {
    throw new UnauthorizedError('Authentication required');
  }

  try {
    const users = await db.query('SELECT * FROM users WHERE deleted_at IS NULL');
    logger.info('Users retrieved', { userId: session.user.id, count: users.length });
    return users;
  } catch (error) {
    logger.error('Failed to retrieve users', { error });
    throw new DatabaseError('Failed to retrieve users', { cause: error });
  }
}
```

### フルスタック一気通貫実装

新機能を実装する際は、以下をまとめて実装する。

1. **データモデル**: マイグレーション、テーブル定義、リレーション
2. **バックエンド API**: ルート、バリデーション（Zod 等）、ビジネスロジック、エラーハンドリング
3. **フロントエンド**: ページ、コンポーネント、フォームバリデーション、ローディング状態
4. **認証・認可**: アクセス制御、セッション管理
5. **テスト**: ユニット、統合、E2E（カバレッジ 100％）

### 実装必須チェックリスト

すべての新機能実装時に確認する。

- [ ] **データ永続化**: データベースに実際に保存・取得している
- [ ] **認証・認可**: アクセス制御を実装している
- [ ] **入力バリデーション**: すべての入力をサーバーサイドで検証している
- [ ] **エラーハンドリング**: try-catch、エラー境界、ユーザーへのエラー表示
- [ ] **ログ記録**: 重要なイベント、エラーをログに記録している
- [ ] **セキュリティ**: OWASP Top 10 対策（SQLi、XSS、CSRF、認証・認可）
- [ ] **テストカバレッジ 100％**: すべてのコードパスをテストでカバー
- [ ] **型安全性**: TypeScript strict mode で型エラーなし
- [ ] **ドキュメント**: API ドキュメント、README 更新

---

## Plan.md 運用ルール

### Plan.md の構成

```markdown
# Development Plan

## 実行計画 (Exec Plans)

### [機能名] - [日付]

**目的 (Objective)**:
- 何を達成するか

**制約 (Guardrails)**:
- 守るべきルール・制約

**タスク (TODOs)**:
- [ ] タスク 1
- [ ] タスク 2

**検証手順 (Validation)**:
- テスト実行方法
- 確認すべき項目

**未解決の質問 (Open Questions)**:
- 調査が必要な項目

**進捗ログ (Progress Log)**:
- [YYYY-MM-DD HH:MM] 実施内容と結果

**振り返り (Retrospective)**:
- 問題: 何が起きたか
- 根本原因: なぜ起きたか
- 予防策: 今後どう防ぐか
```

### Plan.md 更新ルール

1. コードを書く前に実行計画を作成
2. 進捗ログにタイムスタンプ付きで記録（決して削除しない）
3. 問題が起きたら必ず振り返りを書く
4. コミットメッセージで Plan.md の該当セクションを参照

---

## テスト駆動開発 (TDD) プロトコル

### テストファースト原則

```typescript
// ✅ OK: まずテストを書く
describe('スコア計算', () => {
  describe('calculateScore', () => {
    it('有効な入力に対して正しいスコアを返すべき', () => {
      const input = { /* テストデータ */ };
      expect(calculateScore(input)).toBe(100);
    });

    it('無効な入力に対してエラーをスローすべき', () => {
      const invalidInput = { /* 無効なテストデータ */ };
      expect(() => calculateScore(invalidInput)).toThrow();
    });
  });
});
```

### BDD スタイルのテスト記述

- **describe**: 対象の機能・クラス・関数を日本語で記述
- **it/test**: 期待する振る舞いを「〜すべき」形式で日本語記述
- **Given-When-Then** パターンを意識

```typescript
describe('ユーザー管理サービス', () => {
  describe('createUser', () => {
    it('有効なユーザー情報を渡すと新しいユーザーが作成されるべき', async () => {
      // Given: 有効なユーザー情報
      const userData = { name: 'Test User', email: 'test@example.com' };

      // When: ユーザー作成を実行
      const user = await createUser(userData);

      // Then: ユーザーが正常に作成される
      expect(user.id).toBeDefined();
      expect(user.name).toBe('Test User');
    });
  });
});
```

---

## 自律開発フロー

### 1. 分析と計画 (Analyze & Plan)

- 次に実装すべき機能を GitHub Issue から特定
- `Plan.md` に実行計画を作成（目的、制約、TODO、検証手順）
- TodoWrite で実装ステップを追跡

### 2. テストファースト実装 (Test-First Implementation)

- **Red**: まず失敗するテストを書く
- **Green**: テストを通す最小限のコードを書く
- **Refactor**: コードをクリーンアップ
- `Plan.md` の進捗ログを更新

### 3. 検証 (Validation)

タスク完了時に必ず以下を実行し、すべて Green になることを確認する。

```bash
# lint、型チェック、テスト、ビルドを実行
nr lint
nr typecheck  # または nlx tsc --noEmit
nr test
nr build
```

すべて Green にならない限りタスクは完了とみなさない。失敗したら Plan.md に問題を記録する。

---

## Git ワークフロー

### ブランチ戦略

```bash
# 1. 最新の main をベースにする
git fetch origin main
git rebase origin/main

# 2. 機能ブランチを作成
git checkout -b feat/descriptive-name

# 3. 関連ファイルのみステージング
git add [files]

# 4. Conventional Commits 形式でコミット
git commit -m "feat: 簡潔な説明

- 変更内容の箇条書き
- 技術的な判断

Refs: Plan.md \"実行計画名\"
"

# 5. プッシュ前に再度 rebase（main が進んでいる場合）
git fetch origin main
git rebase origin/main
git push -u origin feat/branch-name
```

### Issue 引用のルール

- コミットメッセージや PR 本文で他の Issue を `#番号` 形式で引用しない
- 理由: GitHub が自動的に相互リンクを作成し、関連 Issue にノイズが発生するため
- 代替: フル URL（`https://github.com/org/repo/issues/番号`）を使用するか、番号のみ（`Issue 番号`）で記述する

### プルリクエスト作成

```bash
gh pr create --title "feat: 機能名" --body "
## 概要
何を実装したか

## 変更内容
- [ ] 変更 1
- [ ] 変更 2

## テスト
- [ ] ユニットテスト（カバレッジ 100％）
- [ ] 型チェック通過
- [ ] ビルド成功

## 参照
- Plan.md の該当セクション
"
```

### CI 検証

プルリクエスト作成後、必ず CI 状態を確認する。

```bash
# CI ステータス確認
gh pr checks <PR番号>

# 失敗している場合、ログ取得
gh run view <RUN_ID> --log-failed

# 修正して同じブランチに push
git add .
git commit -m "fix: CI エラー修正 - [説明]"
git push
```

CI が Green になるまで次に進まない。

---

## セルフレビュープロトコル

プルリクエストを「完了」と報告する前に必ず実行する。

```bash
gh pr diff <PR番号>
```

### セルフレビューチェックリスト

- [ ] コードがプロジェクトのスタイルに従っている
- [ ] すべての検証チェックが通過（lint、typecheck、test、build）
- [ ] コメントアウトされたコードやデバッグ文がない
- [ ] エラーハンドリングが適切
- [ ] ドキュメントが更新されている
- [ ] Plan.md が実装内容を正確に反映
- [ ] コミットメッセージが明確
- [ ] CI が Green

---

## ハンドオフプロトコル

人間のレビュアーに引き継ぐ際に確認すべき項目。

1. **Plan.md に最終状態を記録**
   - 完了した作業
   - 未解決の問題・リスク
   - 次のステップ
   - 最新のテスト状態

2. **プルリクエストに明確な情報**
   - Plan.md へのリンク
   - 検証エビデンス（テスト結果、ビルド成功）
   - レビュー時の注意点

3. **CI が Green であることを確認**

4. **セルフレビュー完了**

これらがすべて揃って初めて、人間のレビューを依頼できる。

---

## 振り返りと改善プロトコル

問題が起きたら必ず振り返りを `Plan.md` に記録する。

```markdown
##### 問題 (Problem)
何が起きたか（具体的に）

##### 根本原因 (Root Cause)
なぜ起きたか（技術的・プロセス的）

##### 予防策 (Prevention)
- CLAUDE.md に追加すべきルール
- 自動化できるチェック
- ドキュメント更新
```

---

## 環境構築ベストプラクティス

### Docker とローカル環境のバージョン統一

Dockerfile で使用する言語ランタイムのバージョンをローカル環境と一致させる。

```dockerfile
# ❌ NG: バージョンを指定しない
FROM node:latest

# ✅ OK: ローカル環境と同じバージョンを明示
FROM node:20.10.0
```

### ni（パッケージマネージャー自動選択ツール）

[@antfu/ni](https://github.com/antfu-collective/ni) を使用すると、lock ファイルを検出して適切なパッケージマネージャーを自動選択する。

| ni コマンド | 用途 |
|------------|------|
| `ni` | 依存関係をインストール |
| `ni <pkg>` | パッケージを追加 |
| `ni -D <pkg>` | devDependencies に追加 |
| `nr <script>` | スクリプトを実行 |
| `nlx <pkg>` | パッケージを一時実行 |
| `nci` | CI 用クリーンインストール |
| `nun <pkg>` | パッケージを削除 |

---

## Issue 管理ポリシー

### Issue クローズの基準

- 受け入れ基準 (Acceptance Criteria) をすべて満たした場合のみクローズ
- 部分実装の場合は Issue を開いたまま保持し、進捗をコメントで記録
- マイルストーンを活用してフェーズを区別

---

## 禁止事項

### rm コマンドの使用禁止

- `rm` コマンドは環境を破損する可能性があるため使用禁止
- ファイル操作は提供されたツール（Write、Edit）を使用する
- ファイル削除が必要な場合はユーザーに依頼する
