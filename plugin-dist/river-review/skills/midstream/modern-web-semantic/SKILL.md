---
id: 'modern-web-semantic'
name: Modern Web Semantic + Platform-Native
description: legacy workaround を避け、semantic HTML / Web Platform Native API / modern CSS の利用機会を提示する。
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
tags: [community, modern-web, semantic-html, accessibility, ui, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- generic な JS / CSS 実装が「セマンティクスを失った車輪の再発明」になっていないかを検出する。
- semantic HTML / Web Platform Native API / modern CSS の利用機会があれば、より少ないコードで同じ結果が得られる選択肢を提示する。
- 出力は「強制」ではなく「検討してほしい代替案」として suggestion 扱いにする。

## Non-goals / 扱わないこと

- ブラウザ互換性のフル評価（Baseline / Can I Use 表の機械的読み取り）。
- フロントエンドフレームワーク選定や状態管理ライブラリの議論。
- パフォーマンス計測値（LCP / INP）の数値検証。
- 既存コードの大規模リファクタ提案（差分の範囲内のみ）。

## False-positive guards / 抑制条件

- 既に `<dialog>` / `<details>` / `<summary>` などの semantic 要素を使っている箇所は指摘しない。
- ライブラリ提供のコンポーネント (`<Dialog>`, `<Popover>`, ...) は内部実装の選択を尊重し、差分でその利用方法だけが変わった場合は指摘しない。
- 古いブラウザサポート（IE11 / Safari < 15 など）が `.river/rules.md` や README に明示されているリポジトリでは指摘を抑制してよい。
- 差分が typo 修正・rename・import 整理のみで意味的変化を伴わない場合は指摘しない。

## Rule / ルール

### Semantic-first

- click ハンドラ付きの generic 要素 (`<div onClick>`, `<span onClick>`) は、`<button>` / `<a>` / `<label>` などの semantic 要素を検討する。
- ヘッダー / フッター / ナビ / 主要コンテンツ領域は、`role` 属性より `<header>` / `<footer>` / `<nav>` / `<main>` を優先する。
- 開閉可能なコンテンツは custom toggle より `<details>` / `<summary>` の利用を検討する。

### Platform-native API

- modal / dialog 実装では `<dialog>` 要素と `showModal()` / `close()` API を検討する（focus trap / inert / top-layer が無償で得られる）。
- tooltip / popover では Popover API (`popover` 属性 + `popovertarget`) と Anchor Positioning の利用機会に触れる。
- form validation は HTML 標準の `required` / `pattern` / `:invalid` / `:user-invalid` を起点にし、JS 実装は補強にとどめる。

### Modern CSS

- レスポンシブ実装で要素サイズに依存する場合は Container Queries (`@container`) を検討する。
- subgrid / grid の出番がある領域で過剰な flex ネストを行っていないか確認する。
- アニメーションでは `view-transition`, CSS transitions, `prefers-reduced-motion` を検討し、JS 駆動の差分計算に頼らない方法があれば触れる。

## Evidence / 根拠の取り方

- 差分のコードスニペットを引用し、どの行がどの代替に対応するかを示す。
- 提示する API / プロパティの MDN / W3C / WHATWG 規格名を 1 つ挙げる（例: "HTML `<dialog>` element", "Popover API", "CSS Container Queries"）。
- 抑制条件（既存の semantic 利用 / ライブラリコンポーネント）に該当しないことを明示する。

## Heuristics / 判定の手がかり

- `onClick` / `onKeyDown` / `tabIndex` を手で組み合わせている generic 要素。
- `position: fixed` + 自前 z-index 管理で modal っぽい振る舞いをしている要素。
- `useEffect` の中で `getBoundingClientRect` を取って位置計算している tooltip / popover。
- `addEventListener('resize'|'scroll', ...)` で要素サイズに応じてスタイルを切り替えるレイアウト。
- `setInterval` / `requestAnimationFrame` で位置や寸法をアニメートしている箇所。

## Actions / 改善案

- 「`<div onClick={...}>` → `<button onClick={...}>` （focus / Enter キー / ARIA roles が自動付与される）」など、最小差分のリファクタ案を 1〜2 行で示す。
- 採用すると失われるもの（古いブラウザでの fallback、特定スタイルの上書きしやすさ）も短く触れる。
- 採用しない判断もあり得るため、`suggestion` 扱いを明示する文言を必ず添える。

## Output / 出力

- `Finding:` 短い問題提示
- `Evidence:` 差分のコード抜粋 + 該当行
- `Suggestion:` 代替 API / 要素名 + 1〜2 行の理由
- `Severity:` minor 固定（情報提示を目的とする）
- `Confidence:` 抑制条件を確認できたなら medium / high、推測が混じる場合は low

## 評価指標（Evaluation）

- 合格基準: 差分に直接根拠があり、代替 API 名が具体的に挙がっており、抑制条件が考慮されている。
- 不合格基準: 差分と無関係な一般論、フレームワーク選定への踏み込み、強制トーン、根拠のないリファクタ要求。

## 人間に返す条件（Human Handoff）

- 既存ライブラリ / デザインシステムの制約で代替案が採用できるか判断できない場合は質問として返す。
- ブラウザサポート方針が repo に明文化されておらず、提案する API が古い環境で動かない可能性がある場合は判断を人間に返す。
- 提案が API 設計や情報設計の論点に踏み込みそうな場合は人間レビューへ返す。

## 参考

- GoogleChrome / modern-web-guidance
- Chrome for Developers: Modern Web Guidance
- MDN: HTML `<dialog>`, Popover API, Anchor Positioning, Container Queries, View Transitions
