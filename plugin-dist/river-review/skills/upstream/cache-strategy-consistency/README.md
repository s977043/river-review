# Cache Strategy Consistency Guard

設計ドキュメントのキャッシュ戦略レビューを行うスキルです。
スキル定義: `skills/upstream/cache-strategy-consistency/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、設計ドキュメントの差分（diff）を分析し、キャッシュ戦略の未定義や矛盾を検出します：

- **キャッシュ層の未定義**: どの層（CDN/Redis/インメモリ/DB クエリキャッシュ）でキャッシュするか不明確
- **整合性戦略の欠如**: キャッシュとオリジンデータの整合性担保方法が未定義
- **無効化戦略の不備**: いつ、どのようにキャッシュを無効化するか未定義
- **TTL 設計の問題**: TTL 未定義、またはビジネス要件との矛盾
- **障害時挙動の未定義**: キャッシュ障害時のフォールバック戦略が不明確

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
docs/**/*.md
design/**/*.md
specs/**/*.md
rfc/**/*.md
**/*design*.md
**/*spec*.md
**/*architecture*.md
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/upstream/cache-strategy-consistency
npx promptfoo eval
```

## 出力例

```text
**Finding:** Cache layer undefined - technology choice not specified
**Evidence:** Section "Caching Strategy": "we will implement caching" without specifying Redis, CDN, or in-memory
**Impact:** Implementation team may choose inconsistent caching layers
**Fix:** Specify cache technology: "User profiles cached in Redis" with rationale
**Severity:** minor
**Confidence:** high
```

## テストケース

### Happy Path (fixtures/01-undefined-cache-layer-happy.md)

検出対象のドキュメント例：

- キャッシュ層が未定義
- TTL が未指定
- 無効化戦略が曖昧
- 障害時挙動が未定義

### False Positive Test (fixtures/02-well-defined-cache-strategy.md)

偽陽性を避けるケース：

- すべてのキャッシュ層が明確に定義
- TTL が各層で指定
- 整合性・無効化戦略が明確
- 障害時挙動が定義済み

## 設計判断

### なぜ upstream?

キャッシュ戦略は設計段階で決定すべき重要なアーキテクチャ判断。実装後の変更はコストが高く、本番障害につながるリスクがある。

### なぜ minor severity?

キャッシュ戦略の未定義は直接的な障害ではないが、実装時の混乱やデータ不整合の原因となる。ただし、ビジネス要件との矛盾（TTL vs SLA）は major として扱う。

### 検出シグナル

- CDN（CloudFront, Fastly, Akamai 等）
- Redis / Memcached / ElastiCache
- アプリ内キャッシュ（LRU, Caffeine, node-cache 等）
- DB クエリキャッシュ（PostgreSQL, MySQL query cache）
- HTTP キャッシュヘッダー（Cache-Control, ETag, Last-Modified）

## 改善履歴

- v0.1.0 (2025-12-30): 初版リリース

## 関連スキル

- `logging-observability`: キャッシュヒット/ミスの観測性
- `api-design`: API レスポンスのキャッシュヘッダー設計

## 参考資料

- [Caching Strategies and How to Choose the Right One](https://codeahoy.com/2017/08/11/caching-strategies-and-how-to-choose-the-right-one/)
- [AWS Caching Best Practices](https://aws.amazon.com/caching/best-practices/)
- [Redis Caching Solutions](https://redis.io/solutions/caching/)
