# Test Case: Normalization Order Fixed and Criteria Disjoint (Should NOT Trigger Finding)

`04-true-positive-normalization-order-conflict.md` と**同じ Pre-execution Gate を通過する**入力（`plan` + `pbi-input` / `todo` / `test-cases` が揃っている）。正規化ステップの順序が修正され、受け入れ条件の担当範囲が重複しないよう分割されている。`critical` は出ないべき。

`plan.md` の未決事項と `test-cases.md` の 1 行は「次フェーズで追記」と決定者・期限つきで明示されており、SKILL.md の False-positive guards により指摘対象外となる。ゲート不成立ではなく、ゲート通過後に抑制条件が効くケースである。

## Input Artifacts

### pbi-input.md

```diff
--- /dev/null
+++ b/pbi-input.md
@@ -0,0 +1,13 @@
+# PBI: 保護パスへの書き込みガード
+
+## 目的
+
+エージェントがリポジトリ直下の保護対象ファイル `CONFIG.md` を書き換えることを、パス表記の揺れに関わらず block する。
+
+## 受け入れ条件
+
+- AC-1: 正規化後にリポジトリ相対パスが `CONFIG.md` と一致する表記は、`./` や `//` の混在を含めてすべて block される
+- AC-2: 正規化後にリポジトリ相対パスが `CONFIG.md` と一致しない表記（例: `docs/CONFIG.md`）は block されない
+- AC-3: リポジトリルート配下に解決できない絶対パスは、保護対象の判定範囲外として block されない
+- AC-4: AC-1 と AC-3 は「リポジトリ配下に解決できるか」で入力を分割するため、同一入力が両方に該当することはない
+- AC-5: シンボリックリンク経由の到達可否は本 PBI のスコープ外（Non-goals）
```

### plan.md

```diff
--- /dev/null
+++ b/plan.md
@@ -0,0 +1,31 @@
+# 計画: 保護パス書き込みガード
+
+## 方針
+
+- 書き込み対象パスをリポジトリ相対パスへ正規化してから、保護パターン `CONFIG.md` と完全一致で照合する。
+- 正規化はリポジトリ配下に解決できた場合のみ照合へ進み、解決できない絶対パスは判定範囲外として扱う（AC-3）。
+
+## 正規化ステップ（この順に適用する）
+
+1. 末尾の空白を除去する
+2. 連続する `/` を 1 個へ畳み込む（変化しなくなるまで繰り返す）
+3. 先頭の `./` を除去する（変化しなくなるまで繰り返す）
+4. リポジトリルートの絶対パス接頭辞に一致する場合は除去し、リポジトリ相対パスとする
+5. ここで先頭が `/` のまま残るパスはリポジトリ配下に解決できないため、判定範囲外として照合しない（AC-3）
+
+ステップ 2 をステップ 3 より先に置くことで、`.//CONFIG.md` は `./CONFIG.md` を経て `CONFIG.md` に解決され、AC-1 の対象として block される。
+
+## 受け入れ条件 (再掲)
+
+- AC-1 / AC-2 / AC-3 を満たす
+- AC-5 は Non-goals として実装しない
+
+## 未決事項
+
+- Windows のドライブレター付きパスの正規化方針: 次フェーズで決定（決定者: Tech Lead, 期限: Phase 2 開始時）
+
+## 作業範囲
+
+- 正規化関数の実装（ステップ 1〜5）
+- 保護パターン照合の実装
+- 単体テスト
```

### todo.md

```diff
--- /dev/null
+++ b/todo.md
@@ -0,0 +1,10 @@
+# TODO
+
+- [ ] 正規化関数 `normalizePath` 実装（ステップ 1〜5）
+- [ ] 保護パターン照合の実装
+- [ ] 単体テスト: `CONFIG.md` → block
+- [ ] 単体テスト: `./CONFIG.md` → block
+- [ ] 単体テスト: `.//CONFIG.md` → block
+- [ ] 単体テスト: `//CONFIG.md` → 判定範囲外
+- [ ] 単体テスト: `docs/CONFIG.md` → block されない
+- [ ] 単体テスト: リポジトリ外の絶対パス → 判定範囲外
```

### test-cases.md

```diff
--- /dev/null
+++ b/test-cases.md
@@ -0,0 +1,12 @@
+# Test Cases
+
+| ID  | 入力                                    | 期待結果       | 対応 AC |
+| --- | --------------------------------------- | -------------- | ------- |
+| TC1 | `CONFIG.md`                             | block          | AC-1    |
+| TC2 | `./CONFIG.md`                           | block          | AC-1    |
+| TC3 | `.//CONFIG.md`                          | block          | AC-1    |
+| TC4 | `//CONFIG.md`                           | 判定範囲外     | AC-3    |
+| TC5 | `docs/CONFIG.md`                        | block されない | AC-2    |
+| TC6 | `/etc/CONFIG.md`                        | 判定範囲外     | AC-3    |
+| TC7 | Windows ドライブレター付きパス          | 保留           | 未決    |
+| TC8 | シンボリックリンク経由 — 次フェーズで追記 (担当: Tech Lead, 期限: Phase 2) | 保留 | AC-5 |
```

## Expected Behavior

The skill should NOT emit a `critical` (or any) finding:

1. Pre-execution Gate は成立する（`plan` に加えて `pbi-input` / `todo` / `test-cases` が揃っている）。したがって「対象外だから黙る」ケースではない。
2. 正規化ステップ 2（`//` の畳み込み）がステップ 3（先頭 `./` 除去）より先に適用されるため、`.//CONFIG.md` は `CONFIG.md` に解決され AC-1 の対象になる。04 の順序欠陥は解消している。
3. AC-1 と AC-3 は「リポジトリ配下に解決できるか」で入力を分割しており（AC-4 が明文化）、同一入力クラスで衝突しない。
4. AC-1 / AC-2 / AC-3 の各表記が `test-cases.md` の TC1〜TC6 でカバーされ、`todo.md` にも対応するタスクがある。
5. TC7（未決）と TC8（次フェーズで追記）は決定者・期限つきで明示されているため、SKILL.md「False-positive guards」および Rule 4「未決事項の明示」により指摘しない。AC-5 は `pbi-input.md` で Non-goals として宣言されている。

<!-- expected:
findings: []
reason: >-
  Pre-execution Gate は成立するが、正規化ステップの順序が修正され AC 間の入力クラスも
  分割されているため整合性の欠落が無い。未決事項と次フェーズ項目はいずれも決定者・期限つきで
  明示されており、False-positive guards により抑制される。抑制条件が壊れた場合は
  TC7 / TC8 と plan の未決事項が指摘として現れるため、このケースは緑のままにならない。
-->
