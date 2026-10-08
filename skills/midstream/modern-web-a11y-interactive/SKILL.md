---
id: 'modern-web-a11y-interactive'
name: Modern Web Accessibility for Interactive UI
description: キーボード操作 / focus 管理 / 動的コンテンツ更新 / ARIA role / フォームの自動遷移など、インタラクティブ UI のアクセシビリティ観点を suggestion で提示する。
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
tags: [community, modern-web, accessibility, a11y, ui, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- インタラクティブ UI 差分（modal / popover / menu / tabs / live updates / form interactions）に対し、キーボード操作と支援技術ユーザーの操作可能性を確保する suggestion を返す。
- accessible name（既存 `a11y-accessible-name`）が扱わない「動的振る舞い」「focus state」「role / state semantics」を担当する。
- 出力は suggestion 扱い。「強制」ではなく「検討すべき代替案 / 確認ポイント」として返す。

## Non-goals / 扱わないこと

- accessible name（alt / aria-label）の網羅的チェック → `a11y-accessible-name` の担当。
- コントラスト比 / 視覚的アクセシビリティ → 別 skill / 別 audit ツールの領域。
- 完全な WCAG 等級判定。
- screen reader を直接 emulate しての挙動検証。

## False-positive guards / 抑制条件

- 既に library / design system のコンポーネント (`<Dialog>`, `<Popover>`, `<MenuButton>` 等) を使い、a11y 振る舞いが library 内で保証されている場合は指摘しない。
- `tabIndex` / `aria-*` 属性が既に明示的に設定されている差分（意図的な制御）は指摘しない。
- 差分が CSS のみのスタイル微調整（色変更・余白調整など）で、interaction が変わらない場合は指摘しない。
- focus visibility 関連で `:focus-visible` / `outline` が既に明示制御されている場合は新たに指摘しない。
- 任意の設問に「回答しない」などのスキップ用の選択肢や操作が明示されている場合は、フォームの自動遷移による任意項目の実質必須化として指摘しない。

## Rule / ルール

### キーボード操作

- click 専用ハンドラ (`onClick` のみ、`onKeyDown` なし) を持つ generic 要素は、`<button>` への切り替え or `onKeyDown` + `role="button"` + `tabIndex="0"` セットの検討を提案する。
- ナビゲーション要素 (menu, tabs, breadcrumb) には WAI-ARIA Authoring Practices の roving tabindex / arrow key navigation 検討を促す。
- `onMouseOver` / `onMouseOut` だけで状態切替する hover-only UI は、keyboard focus でも同等の状態が出るかを確認する。
- shortcut key を追加する差分では、`<kbd>` 表示 / disable 手段 / 既存ショートカット重複の確認を促す。

### Focus 管理

- modal / dialog / drawer を開いた時に focus が initial element に移るか、閉じた時に開いた element に戻るかを確認する。
- `<dialog>` の native `showModal()` は focus / inert を自動でやる → そちらに寄せる方が安全な suggestion を出す。
- focus trap を自前で実装している差分（querySelector で focusable elements を集める等）は `<dialog>` または `inert` 属性ベースへの寄せ替え検討を提案する。
- `tabIndex="-1"` で focus を奪う / `tabIndex="0"` 以上の正の値を追加する差分は副作用が大きいので根拠を確認する（positive tabIndex は基本的にアンチパターン）。

### 動的コンテンツ / live regions

- `aria-live` / `role="status"` / `role="alert"` の選択が用途に合っているかを確認する（`polite` vs `assertive` vs `off`）。
- toast / snackbar / inline validation message 追加では live region 経由のアナウンスが必要か検討を促す。
- DOM を一括書き換えで「画面の意味が大きく変わる」変更では、focus 移動 or live region 更新の必要性に触れる。

### Role / state semantics

- expandable UI (accordion, disclosure) には `aria-expanded` の連動を確認する。
- toggle button (icon button, pressed state) には `aria-pressed` 検討を促す。
- 選択リスト (radio group, listbox, combobox) には role / `aria-selected` / `aria-checked` の整合を確認する。
- 「装飾要素」と「操作要素」が混在しているマークアップでは `aria-hidden` / `pointer-events` の使い分けに触れる。

### フォームの自動遷移

- 単一選択（radio）1 問だけのステップで「次へ」ボタンを隠し、選択時に自動で次へ進める差分では、自動遷移の条件に `required` が含まれているかを確認する。
- radio は未選択に戻せないため、任意の設問まで自動遷移の対象にすると、答えない限り先へ進めず、任意項目が実質必須になる。
- 改善案は明示的な「次へ」ボタンを残す形を第一にする。ネイティブの radio group は矢印キーで選択が移り、そのたびに `onChange` が発火する。そのため選択変更で進める実装は、キーボード利用者を最初の矢印キーで先へ進めてしまう（WCAG SC 3.2.2 On Input が扱う、入力による予期しない状況の変化）。
- 自動遷移を残す場合は、必須の設問に限ったうえで、`onChange` ではなくクリックや Enter など明示的な操作を起点にする案を示す。

### Focus visibility

- 差分で `outline: none` / `:focus { outline: 0 }` を新たに追加する場合は、`:focus-visible` 代替の検討を強く促す。
- design tokens / theme の focus ring 変更で keyboard ユーザーへの可視性が落ちる差分があれば指摘する。

## Evidence / 根拠の取り方

- 差分のコードを引用し、どの interaction / role が a11y 観点で気になるかを示す。
- WAI-ARIA Authoring Practices / MDN ARIA role / WCAG 2.x success criterion の該当ページ名を 1 つ挙げる（例: "WAI-ARIA Authoring Practices: Dialog (Modal) Pattern", "MDN ARIA: button role", "WCAG SC 2.1.1 Keyboard"）。
- false-positive guards に該当しない（既存 library / 既存 aria 属性で扱われていない）ことを明示する。

## Heuristics / 判定の手がかり

- `<div onClick={...}>` / `<span onClick={...}>` で `role` / `tabIndex` / `onKeyDown` の欠落。
- modal-like UI (`position: fixed` + backdrop) の自前実装で `<dialog>` を使っていない。
- `useEffect` 内で focus を移動するロジックがあるが、初期 focus / close 後の return focus が無い。
- `aria-live` / `role="status"` 無しで動的にメッセージを差し込んでいる差分。
- `outline: none` / `outline: 0` を新規追加。
- positive `tabIndex` (1 以上) の使用。
- radio の `onChange` から次ステップへ進める処理と「次へ」ボタンの非表示が同じ条件で切り替わり、その条件に `required` が無い。

## Actions / 改善案

- 「`<button>` への置換で focus / keyboard / role が自動付与される」「`<dialog>` + `showModal()` で focus trap / inert / Escape close が無償で得られる」など、最小差分の代替案を 1〜2 行で示す。
- 既存 design system / library で同等のパターンが提供されている場合は、そちらを使う選択肢に触れる。
- 採用しない判断もあり得るため `suggestion` 扱いを明示する。

## Output / 出力

- `Finding:` 該当 UI パターン名 + a11y 観点（keyboard / focus / live region / role / form flow / focus visibility）
- `Evidence:` 差分のコード抜粋 + 該当行
- `Suggestion:` 代替 API / ARIA 属性 / library コンポーネント
- `Severity:` minor 固定
- `Confidence:` 既存 a11y 属性 / library 利用が抑制条件を満たすか確認できれば medium / high、推測が混じる場合は low

## 評価指標（Evaluation）

- 合格基準: 差分の interactive UI に直接根拠があり、a11y 観点（keyboard / focus / role / live region / form flow / focus visibility）の 1 つ以上を具体的に指摘し、代替手段が示されている。
- 不合格基準: 「アクセシビリティが心配です」のような曖昧表現、差分と無関係な一般論、強制トーン、false-positive guards 無視、accessible name の二重指摘（既存 skill のスコープ）。

## 人間に返す条件（Human Handoff）

- design system / library のコンポーネント仕様が repo 内で確認できず、a11y 振る舞いを推測するしかない場合。
- 提案が UX デザイン判断（modal を使うべきか別 pattern か等）に深く踏み込む場合。
- WCAG 等級 / 法的要件への適合判断は人間レビュー / a11y 専門家へ。

## 参考

- WAI-ARIA Authoring Practices (APG)
- MDN: ARIA roles, dialog element, inert attribute, :focus-visible
- WCAG 2.x Success Criteria (2.1.1 Keyboard, 2.4.7 Focus Visible, 4.1.2 Name, Role, Value)
- Inclusive Components (Heydon Pickering) — 設計パターン参考
