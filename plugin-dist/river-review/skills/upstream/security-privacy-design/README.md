# Security & Privacy Design Review

設計ドキュメントのセキュリティ・プライバシー設計をレビューするスキルです。
スキル定義: `skills/upstream/security-privacy-design/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、設計ドキュメントやADRの差分を分析し、セキュリティとプライバシーに関する設計考慮の欠如を検出します：

- **データ保持ポリシーの欠如**: データの保持期間が定義されていない
- **削除リクエスト対応の欠如**: GDPR等の「忘れられる権利」への対応方法がない
- **バックアップPII残存の考慮不足**: バックアップにおけるPII削除計画がない
- **データレジデンシの未定義**: データの保存場所・越境転送ポリシーがない
- **監査ログ設計の欠如**: セキュリティ関連の監査証跡がない
- **暗号化ポリシーの欠如**: 保存時・転送時の暗号化要件がない
- **アクセス制御設計の欠如**: 認証・認可の設計がない

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
**/*.md
**/design/**/*
**/rfc/**/*
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/upstream/security-privacy-design
npx promptfoo eval
```

## 出力例

```text
**Finding:** データ保持ポリシーが定義されていません
**Evidence:** Line 15-20: ユーザーデータを保存する設計ですが、保持期間の定義がありません
**Impact:** 不要なデータが蓄積し、データ侵害時のリスクが増大。GDPR/個人情報保護法の遵守が困難
**Fix:** 追記テンプレート: `## データ保持ポリシー\n- アクティブユーザーデータ: 無期限\n- 非アクティブユーザー: 最終ログインから2年で削除\n- ログデータ: 90日\n- バックアップ: 30日ローテーション`
**Severity:** major
**Confidence:** high
```

## テストケース

### 保持ポリシー欠如 (fixtures/01-missing-retention.md)

検出対象の設計ドキュメント例：

- ユーザーデータを保存するがデータ保持ポリシーがない
- 削除リクエストへの対応方法が記載されていない
- バックアップにおけるPII残存が考慮されていない
- データレジデンシが明示されていない
- 監査ログの設計がない

### 適切な設計 (fixtures/02-well-designed.md)

指摘を出さないケース：

- データ保持ポリシーが期間・条件付きで定義されている
- 削除リクエスト対応フローが記載されている
- バックアップからのPII削除方法が考慮されている
- データレジデンシが明示されている（リージョン、越境転送ポリシー）
- 監査ログが設計されている（対象イベント、保持期間、アクセス制御）
- 暗号化要件が定義されている
- アクセス制御が設計されている

## 設計判断

### なぜ upstream?

設計フェーズでセキュリティ・プライバシー要件を検討することで、実装後の大規模な修正を防ぐ。「Security by Design」「Privacy by Design」の原則に従い、後付けではなく設計段階で組み込む。

### なぜ minor severity?

セキュリティ・プライバシー要件の欠如は直接的な脆弱性ではないが、規制違反リスクやデータ侵害時の影響拡大につながるため、設計段階で対処すべき。ただし、すべての設計に完全なセキュリティ設計を求めるのは過剰なため minor とする。

### なぜ medium confidence?

設計ドキュメントは組織によって粒度が異なり、セキュリティ要件が別ドキュメント（セキュリティ設計書等）で管理されている可能性もあるため、差分のみからは確定的な判断が難しい場合がある。

## 改善履歴

- v0.1.0 (2025-12-30): 初版リリース

## 関連スキル

- `architecture-validation-plan`: 検証計画の設計
- `adr-decision-quality`: ADRの意思決定品質
- `operability-slo`: 運用性・SLO設計

## 参考資料

- [GDPR - Right to erasure ('right to be forgotten')](https://gdpr-info.eu/art-17-gdpr/)
- [OWASP Secure Product Design Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html)
- [Privacy by Design - 7 Foundational Principles](https://student.cs.uwaterloo.ca/~cs492/papers/7foundationalprinciples_longer.pdf)
- [AWS Data Sovereignty](https://aws.amazon.com/what-is/data-sovereignty/)
