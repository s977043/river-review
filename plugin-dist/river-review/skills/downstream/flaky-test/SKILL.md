---
id: 'flaky-test'
name: Flaky Test Risk Check
description: Detects patterns that make tests flaky and proposes stabilization steps.
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - '**/*.test.ts'
  - '**/*.test.js'
  - '**/*.spec.ts'
  - '**/*.spec.js'
  - 'tests/**/*.ts'
  - 'tests/**/*.js'
tags: [tests, reliability, flakiness, downstream]
severity: major
inputContext: [diff]
outputKind: [findings, actions, summary]
modelHint: balanced
dependencies: [test_runner]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Flakyテストリスク検出はチェックリスト型評価が主だが、テストファイルが差分に含まれない場合は実行を止める必要がある。

## Rule / ルール

- テストを決定的にし、実行順や環境依存を避ける。
- タイミング依存（sleep/timeout）、乱数、時刻依存のまま放置しない。
- ネットワークや外部サービス呼び出しはモック/スタブに置き換える。

## Heuristics / 判定の手がかり

- `setTimeout`/`sleep`/`waitFor` で待ち時間を固定している。
- `Math.random()`/`Date.now()`/`new Date()` をシード・固定値なしで使っている。
- ネットワーク/DB/ファイル I/O への直接依存がある（モックが無い）。
- 並列実行で共有状態を操作している、またはテスト順序に依存している。
- 未 `await` の Promise が残っている、cleanup が `afterEach` で行われていない。

## Good / Bad Examples

- Good: `vi.useFakeTimers(); jest.runAllTimers();` でタイマーを制御。
- Good: `Math.random = () => 0.42;` などで乱数を固定。
- Bad: `await sleep(1000);` に依存するテスト。
- Bad: 実際の外部 API を呼ぶ統合テストをユニットテストに混在させる。

## Actions / 改善案

- タイマー/日時/乱数をモックし、シードを固定する。
- ネットワーク・DB・外部サービスをモック/スタブ化し、リトライやバックオフをテストしない。
- 共有状態を隔離し、`beforeEach`/`afterEach` でクリーンアップする。
- 並列実行に耐えるようテストデータを分離し、副作用を最小化する。

## Non-goals / 扱わないこと

- E2E/負荷試験の設計や実行環境のチューニング。
- テストフレームワークの全面移行。
- 監視/アラートの設計。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にテストファイル（`*.test.*`, `*.spec.*`, `tests/**/*`）の変更が含まれている
- [ ] 差分にテストの実行内容に影響する変更がある（コメントや説明文のみの変更ではない）
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: flaky-test — Flakyテストリスク検出の対象となるテスト変更が検出されない`

## False-positive guards / 抑制条件

- テスト対象が純粋関数で、時間・乱数・外部I/Oを一切使っていない。
- すでにフェイクタイマー/固定シードが導入済みで、差分で逸脱がない。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
