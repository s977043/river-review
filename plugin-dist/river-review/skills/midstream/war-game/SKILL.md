---
id: 'war-game'
name: 'War Game 敵対的シミュレーション'
description: '攻撃者・競合・悪意あるユーザーの視点で変更を分析し、防御の盲点と悪用シナリオを可視化する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/{api,routes,db,auth,security,config,middleware,handlers}/**/*.{ts,tsx,js,jsx,mjs}'
  - '**/migrations/**/*'
  - '**/*.env.example'
  - '**/config/**/*.{yaml,yml,json}'
tags: [adversarial, war-game, security, attack-simulation, midstream, cognitive-bias]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 攻撃シナリオ分析はチェックリスト型評価が主だが、攻撃面のない変更では実行を止めるゲートが必要

## Goal / 目的

- 攻撃者の視点に立ち、変更がどのように悪用されうるかを具体的なシナリオとして描写することで、機能比較表やチェックリストでは見えない防御の盲点を発見する。
- 「自分がこのシステムを壊すとしたら、どこを突くか」を体系的に分析する。

## Non-goals / 扱わないこと

- 既知の脆弱性パターンの機械的チェック（SQLi, XSS等は `security-basic` の役割）。
- ペネトレーションテストの代替（実際の攻撃コードは生成しない）。
- ビジネスロジックの正当性判断。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にセキュリティ関連コード（api/, routes/, auth/, config/, middleware/等）の変更が含まれている
- [ ] テストコード・フィクスチャ・ドキュメントのみの変更ではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: war-game — 攻撃面を持つ変更が検出されない`

## False-positive guards / 抑制条件

- すでにセキュリティレビュー済みの箇所で、緩和策が差分内に確認できる場合は抑制。

## Rule / ルール

### 攻撃者ペルソナ

変更内容に応じて、以下のペルソナの中から最も関連性の高いものを選択する：

1. **外部攻撃者**: 認証バイパス、入力操作、API悪用
2. **認証済み悪意ユーザー**: 権限昇格、他者データアクセス、レート制限回避
3. **内部脅威者**: 設定改ざん、ログ改竄、バックドア設置
4. **自動化ボット**: 大量リクエスト、クレデンシャルスタッフィング、スクレイピング

### 分析フレームワーク

1. **攻撃面の特定**: 変更が新たに露出する攻撃面（エンドポイント、入力、状態遷移）を列挙。
2. **攻撃シナリオの構築**: 選択したペルソナの立場で、具体的な攻撃手順を記述。
3. **防御ギャップの評価**: 現在の防御策と攻撃シナリオの間のギャップを特定。
4. **防御策の提案**: ギャップを埋める最小限の変更を提案。

### 制約

- 攻撃シナリオは最大 5 件。悪用可能性が高いものを優先。
- 各シナリオには「ペルソナ」「攻撃手順」「影響」「防御ギャップ」を含める。
- 実際の攻撃コードやエクスプロイトは生成しない。攻撃の概念と経路のみ記述。

## Evidence / 根拠の取り方

- 攻撃面は差分の具体的な行に紐づける（`<file>:<line>`）。
- 攻撃手順は入力→処理→出力の流れで追跡可能にする。
- 既知の攻撃手法（OWASP Top 10等）との対応を示す。

## Output / 出力フォーマット

すべて日本語。

```text
(war-game):1: [要約] 攻撃者視点で最も危険な露出は〈1文〉

<file>:<line>: [攻撃シナリオ1] <タイトル>
  ペルソナ: <外部攻撃者|認証済み悪意ユーザー|内部脅威者|自動化ボット>
  攻撃手順: <step1 → step2 → step3>
  影響: <データ漏洩|サービス停止|権限昇格|...>
  防御ギャップ: <現在の防御で不足している点>
  Fix: <最小限の防御策>

<file>:<line>: [攻撃シナリオ2] ...
```

## Good / Bad Examples

### Good

```text
src/api/routes/users.mjs:28: [攻撃シナリオ] IDOR によるユーザー情報の水平権限昇格
  ペルソナ: 認証済み悪意ユーザー
  攻撃手順: 自分のJWTで /api/users/:id の :id を他ユーザーIDに差し替え → レスポンスに他者のプロフィール情報
  影響: 全ユーザーの個人情報漏洩
  防御ギャップ: ルートハンドラ内でJWTのsubとリクエストの:idの一致を検証していない
  Fix: ミドルウェアで req.user.id === params.id を検証、不一致は 403
```

### Bad

```text
src/api/routes/users.mjs:28: セキュリティに問題がありそう
```

（ペルソナなし、攻撃手順なし、具体性なし）

## 評価指標（Evaluation）

- 合格基準: 攻撃シナリオが差分に紐づき、「ペルソナ」「攻撃手順」「防御ギャップ」「Fix」が揃っている。
- 不合格基準: 差分と無関係な一般的脅威、根拠のない不安、攻撃コードの生成。

## 人間に返す条件（Human Handoff）

- 脅威モデルの変更やセキュリティポリシーの判断が必要な場合。
- 攻撃シナリオの影響が他サービス/他チームに及ぶ場合。
- 緩和策のコスト/トレードオフの判断が必要な場合。
