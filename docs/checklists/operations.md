# 運用チェックリスト

## ログ、メトリクス、アラーム

- [ ] frontend error、5xx、auth error、timeout、queue failure を検知できる
- [ ] request / trace ID で入口から依存先まで追跡できる
- [ ] logs / metrics / alarms の owner、通知先、閾値、抑制条件を確認する
- [ ] 404 / 50x ページに安全な戻り導線と問い合わせ情報がある
- [ ] audit log に actor、target、action、result、時刻が残る
- [ ] 利用量、queue depth、storage、外部 API 課金に cost backstop がある

## 復旧と lifecycle

- [ ] DB / object storage / 設定データの backup 頻度、保持期間、暗号化を確認する
- [ ] restore を実際に試し、RPO / RTO と手順を記録する
- [ ] create / deploy / retry / rollback / destroy / sweeper の対象が一致する
- [ ] partial failure と再実行で二重作成、重複課金、孤児リソースが発生しない
- [ ] 手動復旧の判断条件、権限、コマンド、検証 signal を runbook に残す

## メールと通知

- [ ] SPF / DKIM / DMARC の設定と alignment を確認する
- [ ] at-least-once 実行でも idempotency key で重複通知を抑止する
- [ ] 大量通知の rate limit、backoff、dead letter、再送上限を確認する
- [ ] unsubscribe、bounce、complaint、suppression の処理を確認する
- [ ] template 変数の欠落や個人情報の誤送信を防ぐ境界検証がある

## リリース

- [ ] migration の forward / rollback、互換期間、長時間 lock を確認する
- [ ] feature flag の default、段階展開、緊急停止、削除期限を確認する
- [ ] deploy 後の正常 signal と異常時の rollback 条件を明記する
