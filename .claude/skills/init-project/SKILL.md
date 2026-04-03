---
name: init-project
description: プロジェクトを Bun + Hono（バックエンド）+ Vite + React（フロントエンド）+ Biome でスキャフォールドする初期化スキル。
---

このスキルはプロジェクトの初期化を行う。以下の手順を順番に実行すること。

## 前提

- ランタイム: Bun
- バックエンド: Hono + TypeScript
- フロントエンド: Vite + React + TypeScript
- リンター/フォーマッター: Biome（ルートの `biome.json` を共有）
- テスト: `bun test`

---

## 手順 1: ユーザーに確認する

まずユーザーに以下を確認する。

1. バックエンドのみ、フロントエンドのみ、フルスタックのどれか。
2. プロジェクト固有の追加依存（例: Prisma, Drizzle, Zod など）があるか。

---

## 手順 2: packages/backend をスキャフォールドする（バックエンドあり）

### packages/backend/package.json

```json
{
  "name": "backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.4.0"
  }
}
```

### packages/backend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"]
}
```

### packages/backend/src/index.ts

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok' }));

export default app;
```

### packages/backend/src/index.test.ts

```typescript
import { describe, expect, it } from 'bun:test';
import app from './index';

describe('アプリケーション', () => {
  describe('GET /', () => {
    it('ステータス ok を返すべき', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });
});
```

---

## 手順 3: packages/frontend をスキャフォールドする（フロントエンドあり）

### packages/frontend/package.json

```json
{
  "name": "frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

### packages/frontend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### packages/frontend/vite.config.ts

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

### packages/frontend/index.html

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### packages/frontend/src/main.tsx

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

createRoot(root).render(
  <StrictMode>
    <div>Hello</div>
  </StrictMode>
);
```

---

## 手順 4: ファイルを作成する

上記の内容で各ファイルを Write ツールで作成する。ファイル名が `.keep` の場合は上書きしない。

## 手順 5: 依存をインストールする

```bash
cd packages/backend && bun install
cd packages/frontend && bun install  # フロントエンドあり
```

## 手順 6: 動作確認する

```bash
nr test       # bun test で全テストがパスすること
nr typecheck  # 型エラーがないこと
```

## 手順 7: ユーザーに完了報告する

作成したファイル一覧と次のステップ（機能追加、DB 設定など）を簡潔に報告する。
