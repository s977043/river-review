# 開発・保守ドキュメント / Maintainer documents

この `docs/` ディレクトリは、River Review の設計・検証・運用記録を管理します。**Docusaurus の公式公開ドキュメントには含まれませんが、公開 GitHub リポジトリ上のファイルなので誰でも閲覧できます。** 機密情報の保管場所ではありません。

This directory stores design notes, experiments, and maintainer runbooks. It is **not published on the documentation website**, but its contents **are publicly accessible on GitHub**. Do not store secrets or private information here.

## 読む目的から探す

- **初めて使う**：[公式ドキュメント](https://river-review.the3396.com/)（公開ページの正本は [`pages/`](../pages/)）
- **OSSへ貢献する**：[貢献ガイド](../.github/CONTRIBUTING.md)、[開発者向け共通ルール](../AGENTS.md)、[ローカル開発](runbook/dev.md)
- **目的・設計を理解する**：[ビジョン](vision.md)、[アーキテクチャ](architecture.md)、[ADR一覧](adr/)
- **レビュー基準を確認する**：[レビュー観点](review/viewpoints.md)、[レビュー出力](review/output-format.md)
- **運用・判断を確認する**：[ガバナンス](governance.md)、[Governance索引](governance/README.md)、[文書配置方針](policy/DOCUMENTATION.md)
- **運用手順を実行する**：[リリース後の確認](runbook/release-smoke.md)、[リバート](runbook/revert.md)、[Runbook一覧](runbook/)
- **進行中の検討を追う**：[開発・検証記録](development/)、[文書整理の判断記録](development/documentation-information-architecture.md)

これらは入口です。個別の設計・実験資料の全件一覧ではありません。公開の仕様や利用手順は公式ドキュメントを優先します。

開発資料は予告なく更新され、安定した公開 API・仕様の保証はありません。公式サイトで説明すべき情報は `pages/` にまとめ、公開ページでは開発途中の資料を仕様として参照しないでください。

詳しくは [Documentation policy](policy/DOCUMENTATION.md) を参照してください。
