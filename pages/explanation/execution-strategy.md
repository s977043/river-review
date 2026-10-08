---
title: Execution Strategy と Orchestration Guardrails
---

# Execution Strategy と Orchestration Guardrails

このページは、AI 支援開発で **どの順序・実行方式で候補成果物を作るか** と、**その候補を River Review でどう検証するか** の境界を説明します。Issue [#2564](https://github.com/s977043/river-review/issues/2564) の Phase 2 に対応する**設計上の整理**であり、新しい CLI オプション、設定フィールド、JSON Schema、実行エンジンが導入されたことは意味しません。

Project HydraFusion の Single / Cascade / Critique と 5 つの原則から着想を得ていますが、外部の実装やベンチマークをそのまま採用しません。River Review 固有の効果は [レビュー実行の保存と比較](../guides/track-runs-and-regressions.md) などの証跡を使った別途の評価が必要です。

## 何を分離するか

| 軸 | 問い | 例 | 主な所有者 |
| --- | --- | --- | --- |
| **Model** | どのモデル・プロバイダーか | provider / model / version | Host / Harness |
| **Effort** | どれだけ推論資源を使うか | effort / budget | Host / Harness |
| **Role** | 誰がどの職務を担うか | Builder / Reviewer / Verifier | Host（River Review 内では Review Team） |
| **Execution Strategy** | どの呼び出し順・段構成で候補を作るか | Single / Cascade / Critique | Host / Harness |
| **Autonomy** | どの範囲まで自律実行を許すか | 提案のみ / 実装可 | Host / Human |
| **Judgment Placement** | 判断をどの評価層へ配置するか | Deterministic / Heuristic / Agentic Review / Human Judgment | [Judgment Placement](./judgment-placement.md) |
| **Authority** | 承認・変更適用・マージを誰が決めるか | Host / Human | Host / Human |

**Execution Strategy ≠ reviewer role ≠ review mode ≠ Judgment Placement ≠ Authority** です。上記は実験を記述するための分析上の軸であり、現行設定に同名のフィールドがあるという意味ではありません。

## 実行境界

```text
Goal / task
  -> Host / Agent Harness
       -> Execution Strategy: Single | Cascade | Critique
       -> Candidate artifact or change
  -> River Review
       -> review skill / concern and risk signals
       -> Review Team: role selection -> fan-out -> findings merge
       -> verification / coverage / evidence / recommendation
  -> Host / Human: revise / stop / approve / merge / release
```

- **Single**: 1 系統の実行で候補を生成する方式。
- **Cascade**: 先行する実行結果を条件付きで次段へ渡す方式。追加段を実行しないケースもある。
- **Critique**: 候補を独立した批評段へ渡し、その指摘を Builder が検討する方式。名前だけではレビューの独立性を証明しない。

これらは外側の **候補生成方式の例**です。River Review の `--reviewers auto` は既存の **観点別レビュアー選択**であり、Single / Cascade / Critique の自動選択ではありません。River Review がコードを自動修正したり、Host の worker scheduler やマージ権限を引き受けたりすることはありません。詳しくは [アーキテクチャ](./river-architecture.md) を参照してください。

## 5 つの Orchestration Guardrails

| 原則 | River Review の現状・根拠 | 不足・誤認リスク | 責務・次の検証 |
| --- | --- | --- | --- |
| **Complete accounting** | `src/lib/usage-persistence.mjs` は opt-in の file×skill token 使用量を記録。`src/lib/reviewer-orchestrator.mjs` は role の duration / timeout を記録 | Builder〜reviewer〜verifier を通した leg 別 token / retries / fallback / cost は一括計測されていない | Host は全 leg、River Review は自分が観測できる review leg。後述の観測契約から始める |
| **Bounded execution** | PR [#2566](https://github.com/s977043/river-review/pull/2566) で reviewer timeout 時の host cancellation を LLM fetch / retry backoff へ伝播 | カスタム実行器や他の呼び出し経路まで無条件に取消保証があるわけではない | 各実行器の cancel coverage / timeout / partial-result 契約を個別に検証 |
| **Isolated review** | `src/lib/reviewer-independence.mjs` は論理 execution ID の分離を判定 | 異なる ID は別モデル・別プロバイダー・文脈隔離・tool 権限制限の証明にはならない | 観測可能な provenance を増やし、証明不能なら `unknown` を維持（[#2543](https://github.com/s977043/river-review/issues/2543)） |
| **Fail-safe application** | River Review は findings / verdict を返し、変更適用・マージは行わない | 信号を Host が無条件 GO と解釈すると権限逸脱する | Host / Human の最終判断を保持。[Judgment Placement](./judgment-placement.md) と独立に制御 |
| **Validated routing** | 現在は deterministic / explainable な reviewer role 自動選択 | 候補生成 strategy の adaptive routing は実証されていない | [#1574](https://github.com/s977043/river-review/issues/1574) の baseline/candidate paired replay を前提に shadow → 評価 → opt-in |

## Strategy / leg accounting — 提案する最小の観測契約

**以下は Phase 3 以降を設計するための概念契約であり、現行の persisted schema や API ではありません。** 既存の Review Artifact、Run store、Execution Manifest、opt-in usage telemetry を重複して再定義せず、外側の Harness が持つ実行記録と結合する際の比較単位を定めます。

**実行単位の考え方**

- `run`: 同一タスクに対する比較のまとまり。比較には task / input artifact / base commit / dataset を固定する。
- `strategy`: Host が選んだ候補生成パターン。River Review が自動決定した値ではない。
- `leg`: retry を内包する **1 つの論理的な LLM 操作、または明確に定義された deterministic 処理**。Builder / Reviewer / Verifier などの role は属性であり、複数 leg にまたがり得る。
- `attempt`: 1 回の provider transport 要求（初回を含む）。同じ leg の再試行を別の leg として重複計上しない。失敗した attempt も課金され得るため、使用量が取得できなければ `unknown` とする。
- `observation source`: 値をどの provider response / telemetry / trace / host event から得たか。直接観測・推定・不明を区別する。

| 提案フィールド | 目的 | 現時点の扱い |
| --- | --- | --- |
| `runId` / `legId` / `parentLegId` | run・leg の関連付け。ID の namespace と発行元を保存 | **設計のみ**。既存 `runId` と異なる値の相互同一性を推測しない |
| `strategy` / `role` / `provider` / `model` | routing と model attribution の分離 | role/model の一部は既存証跡にあるが strategy は Host 情報 |
| `startedAt` / `durationMs` / `outcome` | wall-clock と成功・失敗・timeout・skip を区別 | reviewer role の duration / timeout は存在。leg 完全性は未保証 |
| `attemptCount` / `fallbackReason` | retry / fallback で負荷が増えた原因 | Review Team 全 leg に対する安定記録は**未実装** |
| `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` | 使用量の内訳 | file×skill usage telemetry が opt-in で存在。ただし leg との 1:1 対応は**未保証** |
| `costUsd` / `priceSource` / `priceVersion` / `costKind` | 計測費用と単価ベースの推定を分離 | 単価による推定機能は既存。全 leg の確定課金値は取得できていない |
| `evidenceSource` / `completeness` | 観測の根拠と欠測状態 | **設計のみ**。採取開始時に明示する |
| `reviewCoverage` / `independenceEvidence` | 検証の網羅性・独立性を費用と併記 | Review Coverage と論理 provenance は存在。強い隔離の保証にはならない |

観測が欠けたフィールドは `unknown` / `null` / `not_collected` 相当として扱い、**未観測のコストを $0、未観測のretryを0回、未観測の隔離を達成済みに置換しません**。新たな enum / JSON Schema の正本化は、Phase 3 の実データと移行要件が揃ってから判断します。

### 集計と比較の不変条件

1. **漏れと二重計上を防ぐ**: Host の Builder leg と River Review の Reviewer leg を識別し、すべての provider attempt を一度だけ数える。file×skill 集計を、同じ通話の role 集計と足し合わせない。
2. **費用と時間を混同しない**: 呼び出し費用は leg / attempt 単位で加算可能だが、並列実行した role の `durationMs` を単純合計しても wall-clock latency にならない。経過時間は run の開始・終了時刻から測る。
3. **不明値を隠さない**: provider 使用量を収集できない retry や失敗 leg があれば run total は `partial` / `unknown` として提示。完全な比較だと主張しない。**0 と確定できるのは実際に provider call が発生しなかった証拠がある場合だけ**。
4. **再現性を固定する**: baseline/candidate の task、入力commit、fixture、model、prompt、skill、context、評価条件を pin する。複数条件が同時変更されたなら個別効果と主張しない。
5. **独立性を盛らない**: logical execution ID の違いは provenance の一要素にすぎない。context / provider / tool 分離の証拠がない評価は `unknown`。
6. **安全境界を保持する**: cost / latency が改善しても critical regression、未充足 coverage、Human 承認要件を相殺しない。実行中止と結果判定は別に扱う。
7. **秘匿データを保存しない**: raw prompt / diff / secret / hidden chain-of-thought を leg accounting に複写せず、ID・hash・集計値・root cause code を使う。

### 受け入れ前の評価

Phase 3 は **shadow（推奨を記録するだけ）** で actual / recommended strategy を比較します。routing 変更はまだ行いません。

Phase 4 は [#1574](https://github.com/s977043/river-review/issues/1574) の baseline/candidate paired replay を再利用し、品質・critical-finding recall・false positives・必要観点の coverage・総費用・wall-clock latency・human correction burden を評価します。held-out / verifier trust が不足した評価は採用根拠にしません。**critical regression = 0** は最低条件であり、それだけで GO にはなりません。

Phase 5 で adaptive routing を試す場合も opt-in / bounded budget / fallback / Human-owned irreversible authority を維持します。外部 HydraFusion benchmark の値を River Review の受け入れ閾値には使用しません。

### 失敗時・例外時の扱い

- **未計測**: データが無いから合格とするのではなく、比較不能な metric として観測を拡充する。critical / independence / total cost の必須情報が無ければ active routing へ昇格しない。
- **実行なし**: dry-run / skipped など、provider call が発生していないことを検証できたときだけその leg の使用量を 0 とする。集計に未観測 leg が含まれる場合は run total を完全値にしない。
- **ソフトな境界**: reviewer role 数・モデル数・token 削減だけでは independence や品質を証明しない。影響範囲が限定された観測改善は shadow に留め、Human 判断を不要にしない。
- **再開条件**: frozen baseline / held-out / source attribution / trusted verifier / critical regression なし、必要な metric の完全性を再度確認できた場合に限り、別PRで opt-in の検討を再開する。

## 未着手の範囲

- Single / Cascade / Critique を選択する実行 Router
- strategy / leg accounting の persisted API、schema、telemetry collector
- 実際の provider 請求値の完全突合
- モデル・プロバイダー・文脈・ツールの強い隔離証明
- Builder の自動修正、PR 自動マージ、release automation

既存の使用量見積もりは [コスト見積もりガイド](../guides/cost-estimation.md)、実行来歴は [Review Artifact](../reference/review-artifact.md) を参照してください。
