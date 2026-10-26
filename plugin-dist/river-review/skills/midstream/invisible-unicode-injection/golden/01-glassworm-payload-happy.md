# Golden: GlassWorm / Trojan Source Payload

The review should produce findings equivalent to the following (wording may vary; the
file/line anchors and categories are what matter):

```text
(invisible-unicode):1: [要約] src/plugins/loader.ts に双方向制御文字とゼロ幅・異体字セレクターが混入している

src/plugins/loader.ts:3: [不可視Unicode1] 双方向制御文字（U+202E）がコードに混入
  種別: 双方向制御
  混入: 代入式に RIGHT-TO-LEFT OVERRIDE が追加され、表示順と実行順が食い違う(src/plugins/loader.ts:3)
  影響: 表示上のコードと実際に実行されるコードがすり替わる（Trojan Source）
  Fix: U+202E を削除する。方向制御が必要な文脈でもコードには使わない

src/plugins/loader.ts:5: [不可視Unicode2] 異体字セレクター（U+FE0F）が非絵文字に付与
  種別: 異体字セレクター
  混入: 識別子直後に不可視の異体字セレクターが追加されている(src/plugins/loader.ts:5)
  影響: 目視できないコードが混入し、サプライチェーン経由で任意コード実行につながる
  Fix: 該当の不可視文字を削除する

src/plugins/loader.ts:7: [不可視Unicode3] ゼロ幅スペース（U+200B）でトークンが分割
  種別: ゼロ幅
  混入: 識別子内にゼロ幅スペースが追加され、別トークンに見える(src/plugins/loader.ts:7)
  影響: 見た目と実体の異なる識別子が生まれ、レビューを回避できる
  Fix: 該当の不可視文字を削除する
```

Key assertions: three findings, anchored to `src/plugins/loader.ts` lines 3 / 5 / 7, with
categories bidi-control, variation-selector (invisible), and zero-width (invisible). The
raw invisible bytes are never reprinted.
