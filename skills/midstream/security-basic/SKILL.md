---
id: 'security-basic'
name: Baseline Security Checks
description: Check common security risks in application code (SQLi, XSS, secrets, open redirect).
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/{api,routes,db,ui,components,auth,security,config}/**/*.{ts,tsx,js,jsx}'
tags:
  - security
  - midstream
  - web
severity: major
inputContext:
  - diff
outputKind:
  - findings
  - actions
modelHint: balanced
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: セキュリティチェックはチェックリスト型評価が主だが、セキュリティ無関係の変更では実行を止めるゲートが必要

## Guidance

- Look for string-concatenated queries or unsafe ORM calls; require parameterization.
- Flag unescaped HTML sinks (`dangerouslySetInnerHTML`/`innerHTML`) and missing sanitization.
- Catch secrets or tokens hardcoded in code; prefer environment/config inputs.
- Ensure input validation and authz/CSRF/error handling paths exist without leaking sensitive detail.
- Open redirect: a return URL may pass a same-host check by a server-side parser (e.g. PHP `parse_url`), then reach `Location` / `redirect()` / `href`. Check that values containing `\` are rejected before that check.
  - PHP `parse_url('http://evil.example\\@self.example/', PHP_URL_HOST)` returns `self.example`.
  - Browsers (WHATWG URL) treat `\` as `/` and navigate to `evil.example`.
  - If the value is decoded again after the check (double encoding, a later `urldecode`), reject `%5C` as well.
  - Rejecting `\` / `%5C` alone is not enough. A check that skips values without a `parse_url` host lets `http:evil.example` and `/<TAB>/evil.example` through. Browsers resolve both to `evil.example`.
  - Raise confidence when a sibling implementation in the same repository already rejects `\` / `%5C`.

## Non-goals

- テスト用ダミー値や意図された緩和を推測で脆弱と決めつけない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にアプリケーションコード（api/, routes/, db/, auth/等）の変更が含まれている
- [ ] 差分がテストファイルやフィクスチャのみでない
- [ ] 外部入力の処理、認証/認可、データ永続化のいずれかに関連するコードが含まれている

ゲート不成立時の出力: `NO_REVIEW: security-basic — セキュリティ関連のアプリケーションコード変更が検出されない`

## False-positive guards

- 環境変数経由や既存バリデーションが確認できる場合は黙る。
- 戻り先 URL が次の両方を満たすときだけ、open redirect として指摘しない。
  - `\` と制御文字を含む値を拒否している。
  - 先頭が単一の `/`（`//` と `/\` は除く）の相対パスだけを許可しているか、WHATWG 相当のパーサーで解決した URL の origin を自サイトと比較している。
- `\` / `%5C` を拒否しているだけで、`parse_url` のホストが無い値を素通しする判定は抑制条件に当たらない。
