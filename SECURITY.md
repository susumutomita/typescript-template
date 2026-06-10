# Security Policy

## サポート対象

本リポジトリは Claude Code 向けモノレポテンプレートです。最新の `main` ブランチのみをサポートします。派生プロジェクト側のセキュリティ対応はそれぞれの責任で行ってください。

## 脆弱性の報告

セキュリティ上の問題を見つけた場合は、**Public な Issue で開示せず**、以下のいずれかで連絡してください。

- GitHub の **[Private vulnerability reporting](https://github.com/susumutomita/typescript-template/security/advisories/new)** を使う（推奨）
- メール: `oyster880@gmail.com`

48 時間以内に受領確認を返します。修正方針と公開時期は、必要であれば調整可能なリードタイムで合意します。

## サプライチェイン防御の前提

本テンプレートは Shai-Hulud 系のサプライチェイン攻撃を多層で防ぐ設定を既定にしています。設計判断と invariant の詳細:

- [ADR-0001: サプライチェイン攻撃 (Shai-Hulud 系) への多層防御を既定にする](./docs/adr/0001-supply-chain-hardening.md)
- [docs/architecture/harness.md](./docs/architecture/harness.md) (invariant 一覧)

これらの invariant が誤検知 / 取りこぼしを起こしている場合も、上記の報告経路で連絡してください。

## 報告に含めると助かる情報

- 影響範囲（テンプレート派生プロジェクトに継承される / 本リポジトリ単独）
- 再現手順（PoC スクリプト、コマンド列）
- 関連する invariant ID または該当ファイル名
- 提案する修正方針があれば
