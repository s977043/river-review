# Expected Output: Debug Output Bypasses Existing Redaction Invariant

## Findings

- `src/lib/notification-dispatch.mjs:16`: 新設の `debug.rawProviderResponse` が raw な `rawResponse` をそのまま格納しており、同じ diff 内で `parsed`（`redacted` 経由）に既に適用されている `redactSecrets` マスクを迂回しています。`rawResponse` に secret が含まれる場合、`debug` を経由して CI ログ等へ未マスクのまま露出する可能性があります。Fix: 出力側ではなく格納段階で `redactSecrets` を適用してください（`debug.rawProviderResponse = redactSecrets(rawResponse);`）。
