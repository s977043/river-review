---
id: 'modern-web-browser-compat'
name: Modern Web Browser Compatibility + Baseline Awareness
description: 新しい Web API / CSS の利用追加に対し、Baseline 状態とブラウザ互換性 / progressive enhancement の有無を suggestion で示す。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,html,css}'
  - 'app/**/*.{ts,tsx,js,jsx,html,css}'
  - 'components/**/*.{ts,tsx,js,jsx,html,css}'
  - 'pages/**/*.{ts,tsx,js,jsx,html,css}'
  - 'styles/**/*.css'
  - 'public/**/*.html'
tags: [community, modern-web, browser-compatibility, baseline, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- 新しい Web API / CSS プロパティを差分で導入したときに、Baseline 状態 (Newly available / Widely available / Limited availability) とブラウザサポートを確認する起点を示す。
- progressive enhancement / feature detection / graceful degradation の有無を suggestion で問いかける。
- ブラウザサポート方針が repo に明文化されているなら、その方針との整合を優先する。

## Non-goals / 扱わないこと

- 完全な caniuse データの代替（実際のサポート % は MDN / web-features を参照する起点として扱う）。
- polyfill 推奨そのもの（重い polyfill 追加は別レビュー / 別議論）。
- ブラウザサポート対象範囲のチーム合意形成（人間レビューへ）。

## False-positive guards / 抑制条件

- repo に「Modern browsers only」「Evergreen browser support」等の明示があるなら、Widely available 級の API は指摘しない。
- transpiler / bundler (Babel / SWC) が target ブラウザを設定している場合、JS 構文系は対象外（CSS / Web API は別問題）。
- 既に `@supports` / `if ('xxx' in window)` / `try-catch` 等の feature detection が含まれている差分は指摘しない。
- progressive enhancement の fallback がコメント・docs で明示されている場合は指摘しない。

## Rule / ルール

### Baseline 状態の確認

- **Newly available (緑、新規)**: 過去 30 ヶ月未満で全モダンブラウザに到達した機能。利用は OK だが、Safari 旧バージョン / IE 互換要件があれば fallback を確認。
- **Widely available (青、安定)**: 30 ヶ月以上経過し全モダンブラウザで安定。基本的に suggestion なし。
- **Limited availability (赤、未到達)**: 一部ブラウザで未実装 / experimental flag 越し。**必ず fallback / feature detection を提案する**。

### JavaScript / Web API

- `Object.hasOwn` / `Array.prototype.findLast` / `structuredClone` / `Promise.any` などの比較的新しい API は MDN / Baseline status の確認を促す。
- `URL.parse` (static) / `Set.prototype.intersection` / iterator helper (`map` / `filter` on iterator) などの Limited availability 級は feature detection を提案する。
- Service Worker / Web Workers / Push API のような環境依存 API は graceful degradation を促す。

### CSS

- `:has()` / `@container` / `subgrid` / `text-wrap: balance` / `view-transition-name` などの新 CSS は Baseline 確認を促す。
- `color-mix()` / `oklch()` / `light-dark()` / Anchor Positioning などの 2024 級は `@supports` fallback の検討を提案する。
- Container Queries は Baseline Widely available 寄りだが、初期に書いたコードが古いブラウザ起動を含むかは確認する。

### HTML

- `<dialog>` の Web Platform Native 利用は Baseline Widely available（Safari 15.4+ / Chrome 37+ / Firefox 98+）→ 通常 suggestion なし。
- Popover API (`popover` attribute) は Baseline Newly available（2024 〜）→ Limited availability エリアでの fallback を確認。
- `loading="lazy"` / `decoding="async"` は Widely available。

### Feature detection / progressive enhancement の suggestion

- 「`if (CSS.supports('@container', '...'))` で fallback を切り替える」「`@supports (xxx)` で modern path を限定する」など、最小差分の fallback 案を 1〜2 行で示す。
- 採用しない判断もあり得るため、`suggestion` 扱いを明示する。

## Evidence / 根拠の取り方

- 差分のコードを引用し、どの API / プロパティが Limited availability エリアにあるかを示す。
- MDN / Baseline / web.dev の該当ページ名を 1 つ挙げる（例: "CSS @container", "Popover API", "Object.hasOwn"）。
- repo のブラウザサポート方針が `.river/rules.md` / README / `package.json` の `browserslist` に明示されている場合はそれを引用する。

## Heuristics / 判定の手がかり

- ES2022+ の API を直接呼び出す変更で、feature detection が無い。
- 新しい CSS プロパティを `@supports` なしで使用している差分。
- `Intl.Segmenter` / `Intl.DurationFormat` / `Intl.NumberFormat` の v2 API など、Limited availability の Intl API。
- `navigator.userAgent` / `userAgentData` を見て分岐するロジック（古い UA sniffing パターン）。
- HTML の experimental attribute (`commandfor`, `command`, ...) を `feature flag` なしで使用する差分。

## Actions / 改善案

- 「`@supports (container-type: inline-size) { … }` で Container Queries を modern-path 限定にする」のような最小差分案を 1〜2 行で示す。
- repo の `browserslist` / Modern browsers 方針を確認する一行を必ず添える。
- 採用しない判断 (Baseline Newly available で fallback 不要) もあり得るため、`suggestion` 扱いを明示する。

## Output / 出力

- `Finding:` 該当 API / プロパティ名 + Baseline 状態
- `Evidence:` 差分のコード抜粋 + 該当行
- `Suggestion:` `@supports` / feature detection / fallback 案
- `Severity:` minor 固定
- `Confidence:` Baseline 状態が公的に確認できれば medium / high、推測ベースの場合は low

## 評価指標（Evaluation）

- 合格基準: 差分の API 名が明示され、Baseline 状態に言及し、fallback / progressive enhancement の代替案が具体的にある。
- 不合格基準: 「古いブラウザでは動かないかも」のような曖昧表現、polyfill 採用の強要、`browserslist` 無視。

## 人間に返す条件（Human Handoff）

- repo のブラウザサポート方針が明文化されていない場合（指摘の前提が定まらない）。
- 提案する fallback が UX や paint pipeline に大きく影響しうる場合。
- Limited availability API への代替案が複数存在し、UX / 性能 / DX のトレードオフ判断が必要な場合。

## 参考

- Baseline: <https://web.dev/baseline/>
- MDN: Browser compatibility tables
- web-features / web-platform-dx (Baseline status の機械可読 dataset)
- caniuse.com（補助的に）
- repo の `package.json` `browserslist`, `.browserslistrc`, `.river/rules.md`
