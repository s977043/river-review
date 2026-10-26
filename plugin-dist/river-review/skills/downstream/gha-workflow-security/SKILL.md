---
id: 'gha-workflow-security'
name: 'GitHub Actions Workflow Security Review'
description: 'Reviews GitHub Actions workflow diffs for script injection of untrusted input, pull_request_target with untrusted checkout, over-broad GITHUB_TOKEN permissions, and unpinned third-party actions.'
version: 0.1.0
category: downstream
phase: [midstream, downstream]
applyTo:
  - '.github/workflows/**/*.{yml,yaml}'
tags: [github-actions, security, ci, supply-chain, downstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: workflow の意味的なセキュリティ判断（権限の必要性・トリガーの用途）に集中し、決定論ツールが見ない文脈を検査する

## Goal / 目的

- untrusted input の式展開によるスクリプトインジェクションと、特権トリガー + untrusted checkout（pwn request）を検出する。
- GITHUB_TOKEN の過剰権限と third-party action の未ピン留めを検出する。

## Non-goals / 扱わないこと

- 構文的に決定論で判定できる領域（pinned-dependencies / token-permissions の機械検出）は OpenSSF Scorecard / zizmor / CodeQL に委ねる（重複指摘しない）。
- workflow のロジック・効率（セキュリティ以外）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `.github/workflows/` 配下の追加変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: gha-workflow-security — workflow の変更なし`

## False-positive guards / 抑制条件

- 同一 repo / 自 org 内 action（`./.github/actions/...`、自 org reusable workflow）はピン留め不要とする運用が一般的。minor 以下に留める。
- `actions/*` 公式 action の tag 運用は third-party より低リスク。minor 扱い。
- `if:` 条件式内の式展開、`github.event.*.number` / `github.sha` / `github.actor` 等の数値・制約付きフィールドは原則安全。
- checkout なし、または base ref checkout のみの `pull_request_target` は安全パターン。
- repo 可視性が不明な self-hosted runner は major でなく warning + 確認依頼にする。

## Rule / ルール

- 攻撃者制御フィールド（`github.event.issue.title/.body`、`pull_request.title/.body/.head.ref`、`comment.body`、`commits.*.message`、`github.head_ref` 等）を `run:` に直接式展開しない。`env:` 経由で変数化する。
- `pull_request_target` / `issue_comment` / `workflow_run` で `head.sha` / `head.ref` を checkout して PR 由来コードを実行しない（secrets + write 権限の文脈での RCE）。
- `permissions` は top-level を `contents: read` にし、write は必要な job 単位で昇格する（`write-all` を避ける）。
- third-party action は full-length commit SHA でピン留めする（バージョンコメント併記を推奨）。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、出典（securitylab.github.com / docs.github.com の secure-use）を 1 行で添える。
- 重要度: untrusted input の `run:` 直挿し / `pull_request_target` + head checkout = critical、permissions 過剰 / public self-hosted = major、tag ピン / persist-credentials = minor。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: インジェクション / pwn request / 過剰権限 / 未ピンのどれか（1文）
- Impact: RCE / secrets 漏えい / 権限昇格
- Fix: env 経由 / トリガー分離 / job 単位 permissions / SHA ピンの最小案

## Sources / 出典

- GitHub — Secure use of GitHub Actions: <https://docs.github.com/en/actions/reference/security/secure-use>
- GitHub Security Lab — Preventing pwn requests: <https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/>
- GitHub Security Lab — Untrusted input: <https://securitylab.github.com/resources/github-actions-untrusted-input/>
- OpenSSF Scorecard checks: <https://github.com/ossf/scorecard/blob/main/docs/checks.md>
