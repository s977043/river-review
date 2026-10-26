# Logging and Observability Guard

観測性（ログ/メトリクス/トレース）のレビューを行うスキルです。
スキル定義: `skills/midstream/logging-observability/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、コードの差分（diff）を分析し、障害時の調査を困難にする問題を検出します：

- **例外の握りつぶし**: 空の catch ブロック、ログなしのエラーハンドリング
- **追跡困難なログ**: 文脈のない固定文言ログ、requestId の欠如
- **観測ポイントの欠如**: リトライ/フォールバック/キャッシュにメトリクスがない
- **スタックトレースの欠落**: エラー情報の不完全な伝播
- **既存マスク不変条件の迂回**: 新設の debug/log/artifact 出力経路が、同種データの既存経路が通しているマスク処理（redact/mask）を迂回している（PR #1529 参照。詳細は `SKILL.md` の Origin / 由来を参照）

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
src/**/*
lib/**/*
**/*.js
**/*.mjs
**/*.ts
**/*.tsx
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/midstream/logging-observability
npx promptfoo eval
```

## 出力例

```text
**Finding:** Silent exception handling - error is swallowed without logging
**Evidence:** Line 25: `catch (error) { return null; }`
**Impact:** Failures will be invisible, making debugging production issues impossible
**Fix:** Add logging with context: `catch (error) { logger.error('Operation failed', { requestId, error }); throw error; }`
**Severity:** minor
**Confidence:** high
```

## テストケース

### Happy Path (fixtures/01-silent-catch-happy.md)

検出対象のコード例：

- 空の catch ブロック
- ログなしのエラーハンドリング
- 文脈のないログメッセージ

### Edge Case (fixtures/02-false-positive-test.md)

偽陽性を避けるケース：

- テストファイル内の意図的な例外無視
- コメント付きの意図的な例外無視
- 適切にログを出力しているコード

## 設計判断

### なぜ midstream?

コード実装時のレビューとして最も効果的。upstream では具体的なコードがなく、downstream では修正コストが高い。

### なぜ minor severity?

観測性の問題は直接的な障害を引き起こさないが、障害発生時の調査を困難にするため、一定の優先度で対応すべき。

### なぜ tracing dependency?

トレースコンテキストを参照することで、より正確な相関ID の欠如を検出できる。

## 改善履歴

- v0.1.0 (2025-12-30): 初版リリース（legacy 形式から移植）

## 関連スキル

- `security-basic`: セキュリティイベントのロギング
- `typescript-strict`: 型安全性による例外の削減

## 参考資料

- [OpenTelemetry Best Practices](https://opentelemetry.io/docs/concepts/signals/)
- [The Twelve-Factor App - Logs](https://12factor.net/logs)
