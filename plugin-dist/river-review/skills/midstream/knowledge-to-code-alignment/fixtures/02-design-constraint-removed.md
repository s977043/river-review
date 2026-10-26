# Test Case: Past design constraint removed without checking (should detect)

## Description

CSV 取込の先頭 BOM 除去分岐を「不要」と判断して削除した。しかしこの分岐は ADR-012 に記録された「一部取引先の CSV は先頭 BOM 付きで、除去しないと parse に失敗する」という過去の設計判断・制約に由来する。過去の design history を確認せず削除しており、回帰リスクがある。knowledge-to-code-alignment は Check 3 で 1 件検出する（issue 検証シナリオ Case 4「過去制約の消失」に対応）。

## Input Diff

```diff
diff --git a/src/import/csv.ts b/src/import/csv.ts
index 1111111..2222222 100644
--- a/src/import/csv.ts
+++ b/src/import/csv.ts
@@ -40,6 +40,2 @@ export function parseCsv(raw: string): Row[] {
-  // 一部取引先の CSV は先頭 BOM 付き（ADR-012）。除去しないと 1 列目の parse が壊れる
-  if (raw.charCodeAt(0) === 0xfeff) {
-    raw = raw.slice(1);
-  }
   return raw.split('\n').map(parseRow);
 }
```

## Design History / 出典

- ADR-012: 「一部取引先の CSV は先頭に BOM (U+FEFF) を含む。BOM を除去しないと 1 列目のヘッダ照合が失敗し取込が壊れる」。
- 削除されたコメントにも ADR-012 への言及があった。
- PR 本文にはこの制約が不要になった旨の記載はない（前提が変わった正当化なし）。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 3（過去の設計判断・制約の保全）を 1 件検出する（ADR-012 由来の BOM 除去例外を根拠確認せず削除）。
2. 制約の実在（ADR-012）を出典として示す。
3. Severity は major（回帰で該当取引先の取込が壊れる）とする。
4. Fix として BOM 除去の復元、または前提が変わった旨を ADR/PR に明記して正当化する案を添える。

<!-- expected:
findings:
  - check: 3
    severity: major
    reason: ADR-012 に記録された BOM 除去制約を根拠確認せず削除。回帰で BOM 付き CSV の取込が壊れる
-->
