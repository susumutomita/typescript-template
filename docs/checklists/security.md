# セキュリティチェックリスト

## セッションと Cookie

- [ ] 認証 token を `localStorage` / `sessionStorage` に保存していない
- [ ] セッション Cookie の `HttpOnly` / `Secure` / `SameSite` / `Domain` / expiry を確認した
- [ ] CSRF、セッション rotation、logout 後の失効方針を確認した
- [ ] 秘匿値、token、Cookie、個人情報をログとエラー応答に含めていない

## 入力と出力

- [ ] 外部入力をサーバー境界で型・長さ・形式・許可値まで検証する
- [ ] クライアント側検証だけに依存していない
- [ ] URL は許可する protocol を列挙し、危険な protocol を拒否する
- [ ] ユーザー入力を HTML として直接出力していない
- [ ] `dangerouslySetInnerHTML`、DOM HTML 代入、template injection の経路がない
- [ ] エラー応答に stack trace、SQL、内部 path、依存バージョンを出していない

## 認証と認可

- [ ] tenant / organization / project / user の境界を API 側で検証する
- [ ] read / create / update / delete の全操作で object-level authorization を確認する
- [ ] role / audience / issuer / expiry を信頼境界ごとに検証する
- [ ] メール確認前に許可する操作を明記する
- [ ] login / invite / password reset の応答や時間差でアカウントを列挙できない
- [ ] 招待・再設定リンクの有効期限、単回利用、再発行時の失効を確認する

## ヘッダとキャッシュ

- [ ] HSTS を HTTPS の全本番ホストに設定する
- [ ] CSP を設定し、少なくとも `frame-ancestors` で埋め込み元を制限する
- [ ] `X-Content-Type-Options: nosniff` と `Referrer-Policy: strict-origin-when-cross-origin` 以上に制限的な方針を設定する
- [ ] ユーザー別応答を共有 CDN / ブラウザ cache に保存しない
- [ ] CORS は必要な origin、method、header、credential だけを許可する

## 秘匿値と権限

- [ ] secret をソース、画像、bundle、ログ、CI artifact に含めていない
- [ ] signing key の保管、rotation、失効、複数鍵移行を確認する
- [ ] cross-account / cross-tenant の trust policy と最小権限を確認する
- [ ] dependency と action の追加を supply-chain 規則に沿って確認する
