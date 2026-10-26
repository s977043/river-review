---
id: 'trust-boundaries-authz'
name: 'Trust Boundaries & Authorization Architecture'
description: 'Ensure designs define trust boundaries, authn/authz responsibilities, and propagation of identity/claims across services.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*security*.md'
  - 'docs/**/*auth*.md'
  - 'docs/**/*design*.md'
  - 'docs/**/*architecture*.md'
  - 'docs/adr/**/*'
  - 'pages/**/*security*.md'
  - 'pages/**/*auth*.md'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
tags: [architecture, security, authz, trust-boundary, upstream]
severity: critical
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: high-accuracy
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 信頼境界・認可設計はチェックリスト型評価が主だが、セキュリティ設計無関係の差分では実行を止めるゲートが必要

## Goal / 目的

- 設計差分から、信頼境界（trust boundary）と認証/認可（authn/authz）の責務が曖昧なまま実装に入るリスクを減らす。

## Non-goals / 扱わないこと

- 具体プロダクトやクラウドの “正解構成” の押し付け。
- 実装コードの脆弱性レビュー（設計上の責務/契約のレビューに限定）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にセキュリティ設計・認証/認可・信頼境界に関連するドキュメント変更が含まれている
- [ ] 誤字・リンク更新のみの変更ではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: trust-boundaries-authz — 信頼境界・認可設計に関連する変更が検出されない`

## False-positive guards / 抑制条件

- 参照先（セキュリティ設計書/権限仕様）ですでに明確で、差分が参照更新のみの場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（新規/変更された境界、主体、権限の要点）。
- 指摘は最大 8 件まで。`[severity=critical]` は “権限漏れ/越境の温床” に限定する。
- 質問だけで終わらせず、可能なら “追記案（貼れる形）” を付ける。

## Checklist / 観点チェックリスト

- Trust boundary
  - どこが信頼境界か（外部→内部、サービス間、ネットワーク境界）が明示されているか。
  - 境界を跨ぐときに “何を信頼できる/できない” かが書かれているか。
- Authn/Authz の責務
  - 認証（authn）と認可（authz）を “どこで” 判定するかが明示されているか。
  - Gateway/BFF/各サービスの責務分担（中央集約か分散か）が明記されているか。
- Identity/Claims の伝播
  - ユーザーID/tenantId/role/scope などの claims をどの形で伝播するか（token/headers/mtls 等）があるか。
  - 伝播情報の検証（署名/改ざん防止）と、サービス側での再検証の方針があるか。
- 監査と特権操作
  - 管理操作やデータ閲覧など、監査対象の操作が明示されているか。
  - 誰がいつ何をしたか（監査ログの最低要件）があるか。
- 認可の粒度
  - 代表的なユースケースの権限マトリクス（役割×操作×リソース）があるか。
  - マルチテナントなら tenant 境界（越境防止）の前提があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <信頼境界/権限境界の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記案” を 1 行付ける。

追記案例:

- `権限マトリクス: role={Admin,User}, action={read,write,delete}, resource={X} を表に追記`
- `境界: 外部→Gateway→ServiceA の trust boundary と、token 検証責務を明記`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく信頼境界/認可責務の曖昧さが、優先度付きで指摘され、追記案がある。
- 不合格基準: 根拠のない断定、差分と無関係な一般論、指摘過多。

## 人間に返す条件（Human Handoff）

- 権限設計が規制/契約/組織ポリシーに跨る場合は人間（セキュリティ/法務）へ返す。
