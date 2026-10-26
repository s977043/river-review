---
id: 'modern-web-performance'
name: Modern Web Performance + Core Web Vitals
description: 画像・スクリプト・スタイル・interaction 変更が LCP / INP / CLS / リソースコストに与える影響を suggestion で提示する。
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
tags: [community, modern-web, performance, core-web-vitals, ui, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- フロントエンド差分が LCP / INP / CLS や読み込みコストへ与える影響を、診断可能な形で示す。
- 「測ってない最適化」を促すのではなく、**今書かれているコードが既知の遅延・ジャンクパターンか**を suggestion として返す。
- 出力は強制ではなく、計測 / プロファイリングの起点を提示する材料にとどめる。

## Non-goals / 扱わないこと

- 実測値（Lighthouse / Real-User Metrics）の数値検証。
- bundler 設定や依存ライブラリ選定の議論。
- backend / DB / network 帯域起因のパフォーマンス問題（別エピックの対象）。
- マイクロベンチマーク的な「より速い書き方」の最適化合戦。

## False-positive guards / 抑制条件

- すでに `loading="lazy"` / `fetchpriority` / `decoding` 属性などが指定されている画像は指摘しない。
- 既存コードのリファクタを跨ぐ変更（命名変更・型注釈追加）で副作用のない差分は指摘しない。
- A/B テスト・実験コード・dev-only コードと明示されている領域は対象外。
- パフォーマンスポリシーが `.river/rules.md` や README で明示されている場合はその方針に従う（過剰指摘の抑制）。

## Rule / ルール

### LCP (Largest Contentful Paint)

- ヒーロー画像 / 主要 visual には `fetchpriority="high"` と `decoding="async"` の検討を促す。
- above-the-fold の画像に `loading="lazy"` が誤って付いていないか確認する。
- リクエスト連鎖（CSS → JS → font → image）が増える変更では preconnect / preload の検討を提案する。
- web font の差し替えでは `font-display: swap` / 適切な fallback の有無を確認する。

### INP (Interaction to Next Paint)

- click / input ハンドラに同期的な重い処理（JSON.parse の大規模ループ、`document.querySelectorAll` 全 traversal）を追加していないか確認する。
- raf / scroll / resize ハンドラに直接 DOM 操作を入れる差分は throttle / `requestIdleCallback` / passive listener の検討を提案する。
- React の場合は `useMemo` / `useCallback` ではなく、**そもそも該当ハンドラが render path に乗らない構造**を優先的に検討する。

### CLS (Cumulative Layout Shift)

- 画像 / iframe / video / placeholder に明示的な `width` / `height` または `aspect-ratio` を指定する変更を促す。
- 後から injection される広告 / バナー / banner / Toast UI でレイアウトが跳ねないよう min-height や reserved space の確保を検討する。
- web font 切り替えで text reflow が起きる可能性を指摘し、`size-adjust` / 適切な fallback metrics の検討を提案する。

### リソースコスト

- 大きな `<img>` を縮小表示している場合、レスポンシブ画像 (`srcset` / `sizes`) や AVIF / WebP の検討を提案する。
- 新規 npm パッケージを import している差分は、tree-shaking 可否 / バンドルサイズの確認を suggestion で示す（実測値は別レビュー）。
- `import …` で大きなライブラリを top-level に持ち込む変更には dynamic import の検討余地を伝える。

## Evidence / 根拠の取り方

- 差分のコードを引用し、どの行がどの Core Web Vital に影響しうるかを示す。
- 該当する仕様 / MDN ドキュメントを 1 つ挙げる（例: "img loading attribute", "Performance Observer", "View Transitions API"）。
- 既に対策属性が付与されている場合の抑制条件を満たさないことを明示する。

## Heuristics / 判定の手がかり

- `<img src="...">` で `width` / `height` / `loading` 属性なし。
- `addEventListener('scroll'|'resize'|'mousemove', ...)` の中で DOM 計測・読み書きを行う変更。
- `useEffect` / `componentDidMount` の中で同期 fetch / 大量データ JSON.parse を行う差分。
- フォント / 大きな静的アセットの追加で preload / `<link rel>` がない。
- `setInterval(fn, <small>ms)` や `requestAnimationFrame` ループで毎フレーム DOM 書き込みを行う変更。

## Actions / 改善案

- 「ヒーロー画像なら `fetchpriority="high"` / `loading="eager"` / `decoding="async"` を検討」など、最小差分案を 1〜2 行で示す。
- 計測を起点にしたい場合は Lighthouse / web-vitals.js / Performance Observer の取り掛かりポイントを 1 行示す。
- 採用しない判断もあり得るため `suggestion` 扱いを明示する。

## Output / 出力

- `Finding:` Core Web Vital の名前 (LCP / INP / CLS) を明示した短い問題提示
- `Evidence:` 差分のコード抜粋 + 該当行
- `Suggestion:` 代替属性 / API / レイアウト案
- `Severity:` minor 固定（情報提示を目的とする）
- `Confidence:` ヒューリスティック由来 = low、属性欠落の事実確認 = medium

## 評価指標（Evaluation）

- 合格基準: 差分に直接根拠があり、影響しうる Core Web Vital を 1 つに絞り、代替手段が具体的に挙がっている。
- 不合格基準: 計測値の捏造、対象差分と無関係な一般論、強制トーン、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 既存コードが意図的に遅延読み込みを抑制している（例: SSR ヒーロー画像）など、文脈で判断が分かれる場合は質問として返す。
- ブラウザサポート方針が repo に明文化されておらず、提案する API が古い環境で動かない可能性がある場合は判断を人間に返す。
- 提案がデザイン / UX / SEO 観点に大きく踏み込む場合は人間レビューへ返す。

## 参考

- web.dev: Core Web Vitals (LCP / INP / CLS)
- MDN: img loading / decoding / fetchpriority, Performance Observer, font-display
- Chrome for Developers: Modern Web Guidance
