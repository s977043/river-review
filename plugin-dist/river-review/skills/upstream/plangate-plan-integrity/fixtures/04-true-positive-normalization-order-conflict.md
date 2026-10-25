# Test Case: Normalization Order Defect and Conflicting Acceptance Criteria (Should Trigger Finding)

`plan.md` の正規化ステップの**適用順序**により、`pbi-input.md` が塞ぐ対象としている入力表記が保護パターンに一致せず素通りするケース。さらに 2 つの受け入れ条件が同一の入力クラスで衝突しており、実装中にどちらかを緩める判断が発生する構造になっている。`critical` 指摘が期待される。

計画成果物は未追跡の新規ファイル群として与えるため、各 artifact を `--- /dev/null` の新規追加 diff として記述する。

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
+- AC-1: `CONFIG.md` への書き込みは block される
+- AC-2: `./CONFIG.md` への書き込みは block される
+- AC-3: `//` を含むパス表記は、指す先に関わらずすべて block される
+- AC-4: `docs/CONFIG.md` は保護対象ではないため block されない
+- AC-5: 先頭が `/` のパスは、作業ディレクトリでの書き込みを止めてしまうため block しない
```

### plan.md

```diff
--- /dev/null
+++ b/plan.md
@@ -0,0 +1,28 @@
+# 計画: 保護パス書き込みガード
+
+## 方針
+
+- 書き込み対象パスを正規化してから、保護パターン `CONFIG.md` と完全一致で照合する。
+- 完全一致した場合のみ block する。
+
+## 正規化ステップ（この順に 1 回ずつ適用する）
+
+1. 末尾の空白を除去する
+2. 先頭の `./` を除去する（先頭 2 文字を取り除く）
+3. `//` を `/` に畳み込む
+4. リポジトリルートの絶対パス接頭辞を除去する
+
+## 受け入れ条件 (再掲)
+
+- AC-1 / AC-2 / AC-3 を満たす
+- AC-4 / AC-5 は block 対象外とする
+
+## 変更履歴
+
+- v2: 「先頭の `/` を除去する」ステップを削除した（絶対パスを一律 block すると作業ディレクトリへの書き込みが止まる、という指摘への対応）
+
+## 作業範囲
+
+- 正規化関数の実装
+- 保護パターン照合の実装
+- 単体テスト
```

### todo.md

```diff
--- /dev/null
+++ b/todo.md
@@ -0,0 +1,7 @@
+# TODO
+
+- [ ] 正規化関数 `normalizePath` 実装（ステップ 1〜4）
+- [ ] 保護パターン照合の実装
+- [ ] 単体テスト: `CONFIG.md` → block
+- [ ] 単体テスト: `./CONFIG.md` → block
+- [ ] 単体テスト: `docs/CONFIG.md` → block されない
```

### test-cases.md

```diff
--- /dev/null
+++ b/test-cases.md
@@ -0,0 +1,10 @@
+# Test Cases
+
+| ID  | 入力              | 期待結果       | 対応 AC |
+| --- | ----------------- | -------------- | ------- |
+| TC1 | `CONFIG.md`       | block          | AC-1    |
+| TC2 | `./CONFIG.md`     | block          | AC-2    |
+| TC3 | `docs/CONFIG.md`  | block されない | AC-4    |
+| TC4 | `//CONFIG.md`     | block されない | AC-5    |
+
+補足: 上記以外の表記は実装時に随時追加する。
```

## Expected Behavior

The skill should detect:

1. `plan.md` の正規化ステップ 2 → 3 の順序により、`.//CONFIG.md` は「先頭 `./` 除去」で `/CONFIG.md` となり、続く `//` 畳み込みでは対象が残らず、保護パターン `CONFIG.md` に一致しない。PBI が塞ごうとしている入力クラスが plan どおりの実装で開いたままになる（`pbi-input.md` の AC-1 / AC-2 / AC-3 の意図に対する不足）。
2. AC-3 と AC-5 が `//CONFIG.md` という同一入力クラスで衝突する。`//CONFIG.md` は `//` を含むため AC-3 が block を要求し、同時に先頭が `/` であるため AC-5 が block しないことを要求する。両者を同時に満たす実装は存在しない。`test-cases.md` の TC4 は AC-5 側だけを pin しており、AC-3 に反する期待値になっている。
3. `todo.md` / `test-cases.md` のいずれにも `.//CONFIG.md` を含む混在表記のケースが無い。

`plan` どおりに実装すると受け入れ条件との不一致が確定するため、severity は `critical`。

<!-- expected:
findings:
  - severity: critical
    reason: >-
      plan の正規化ステップが「先頭 ./ 除去」を「// 畳み込み」より先に適用するため、
      .//CONFIG.md は /CONFIG.md となり保護パターン CONFIG.md に一致せず素通りする。
      pbi-input が塞ぐ対象としている入力クラスが plan どおりの実装で開いたままになり、
      受け入れ条件との不一致が確定する。あわせて //CONFIG.md は AC-3（// を含む表記はすべて block）
      と AC-5（先頭が / のパスは block しない）の両方に該当し、両者を同時に満たす実装は存在しない。
      test-cases の TC4 は AC-5 側だけを pin しており、AC-3 に反する期待値になっている。
    anchor: plan.md:12
-->
