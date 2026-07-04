# Blindspot pass 実行例

## Fixture

対象設計 `docs/design/jobs.md`:

```text
API が Job を DB に作成して queue へ publish する。
Worker が queue を consume して Job を完了にする。
Job 削除時は DB row を削除する。
```

対象実装:

```text
src/api/jobs.ts       createJob と deleteJob
src/queue/publish.ts  publishJob
src/worker/run.ts     processJob
deploy/api.yml        API と queue binding
deploy/worker.yml     Worker。queue event source の記載なし
```

## Invocation

```text
/blindspot-pass docs/design/jobs.md
```

## Expected evidence and classification

- `deploy/worker.yml` に queue event source がなく、Worker consumer が起動しないことは、
  path と設定 symbol を示せるため High finding にする。
- `deleteJob` が DB row だけを削除し、queue 内の未処理 message を失効させる経路がないことは、
  API symbol と検索結果を根拠に lifecycle finding にする。
- retry 時に外部副作用が重複するかは、外部 API 実装が fixture にないため断定しない。
  「未検証のまま残る事項」に仮説として置く。

## Expected conclusion

consumer の未接続が主経路を無効化するため「blocker を先に解くべき」と判定する。
スキルは設定やコードを修正せず、接続と lifecycle の最小是正方向だけを報告する。
