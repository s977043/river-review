# Expected Output: Singleton Closure Retaining Large Scope

## Findings

- `src/lib/skill-cache.mjs:18`: module-level singleton `cachedLookup` の各 accessor が closure で `rawText`（MB級）・`documents`・`allEntries` を保持し、実際に読むのは id と severity のみ。Impact: プロセス生存中ずっと registry 全文とパース済みドキュメントが解放されず、メモリを圧迫する。Fix: 構築時に `id -> severity` の `Map`（と id の `Set`）へ縮約し、accessor は縮約済み構造のみを参照して大きな元データを closure に掴ませない。Severity: major / Confidence: high
