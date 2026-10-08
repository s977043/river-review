---
title: Execution Strategy と Orchestration Guardrails
---

このページは、AI 支援開発において、**どの順序・実行方式で候補成果物を作るか** と、**その候補を River Review でどう検証するか** の境界を説明します。Issue [#2564](https://github.com/s977043/river-review/issues/2564) の Phase 2 に対応する**設計上の整理**であり、新しい CLI オプション、設定フィールド、JSON Schema、実行エンジンが導入されたことは意味しません。

Project HydraFusion の Single / Cascade / Critique と 5 つの原則から着想を得ていますが、外部の実装やベンチマークをそのまま採用しません。River Review 固有の効果は [レビュー実行の保存と比較](../guides/track-runs-and-regressions.md) などの証跡を使った別途の評価が必要です。

## 何を分離するか


- **Model** — どのモデル・プロバイダーを使うか。例: provider / model / version。主な所有者: Host / Harness。
- **Effort** — 推論資源の配分。例: effort / budget。主な所有者: Host / Harness。
- **Role** — Builder / Reviewer / Verifier の職務分担。Host が管理し、River Review 内では Review Team がレビュー職務を担う。
- **Execution Strategy** — 候補生成の呼び出し順・段構成。例: Single / Cascade / Critique。主な所有者: Host / Harness。
- **Autonomy** — 提案のみ・実装可などの自律実行範囲。主な所有者: Host / Human。
- **Judgment Placement** — 評価層の配置。Deterministic / Heuristic / Agentic Review / Human Judgment。参照: [Judgment Placement](./judgment-placement.md)。
- **Authority** — 承認・適用・マージの最終判断。主な所有者: Host / Human。

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


- **Complete accounting**
  - 現状: `src/lib/usage-persistence.mjs` は opt-in の file×skill token 使用量を記録。`src/lib/reviewer-orchestrator.mjs` は role の duration / timeout を記録。
  - 不足: Builder〜Reviewer〜Verifier の leg 別 token / retries / fallback / cost を一括計測する仕組みはない。
  - 責務: Host が全 leg を所有し、River Review は観測できる review leg に限定する。

- **Bounded execution**
  - 現状: [#2566](https://github.com/s977043/river-review/pull/2566) で reviewer timeout を LLM fetch / retry backoff まで伝播。
  - 不足: 他の呼び出し経路・カスタム実行器に対する取消保証は別途検証が必要。
  - 責務: 各実行器ごとに cancellation と partial-result 契約を検証する。

- **Isolated review**
  - 現状: `src/lib/reviewer-independence.mjs` は論理 execution ID の分離を判定。
  - 不足: 別モデル・別プロバイダー・文脈隔離・tool 制限の証明にはならない。
  - 責務: 証明不能なら `unknown` を維持し、provenance を段階的に拡張（[#2543](https://github.com/s977043/river-review/issues/2543)）。

- **Fail-safe application**
  - 現状: River Review は findings / verdict を返し、コードの適用・マージは行わない。
  - リスク: Host がレビュー信号を無条件 GO と解釈すると権限逸脱になる。
  - 責務: Host / Human の最終権限を保持し、[Judgment Placement](./judgment-placement.md) と分離する。

- **Validated routing**
  - 現状: deterministic / explainable な reviewer role 自動選択がある。
  - 不足: 候補生成 strategy の adaptive routing は未検証。
  - 責務: [#1574](https://github.com/s977043/river-review/issues/1574) の paired replay を前提に shadow → 評価 → opt-in と進める。

## Strategy / leg accounting — 提案する最小の観測契約

これは Phase 3 以降に向けた**概念契約**であり、現行の persisted schema や API ではありません。

既存の Review Artifact / Run store / Execution Manifest / opt-in usage telemetry は再定義しません。外側の Harness の実行記録と結合するときの比較単位だけを示します。

### 実行単位の考え方

- `run`: 同一タスクに対する比較のまとまり。比較には task / input artifact / base commit / dataset を固定する。
- `strategy`: Host が選んだ候補生成パターン。River Review が自動決定した値ではない。
- `leg`: retry を内包する **1 つの論理的な LLM 操作、または明確に定義された deterministic 処理**。Builder / Reviewer / Verifier などの role は属性であり、複数 leg にまたがり得る。
- `attempt`: 1 回の provider transport 要求（初回を含む）。同じ leg の再試行を別の leg として重複計上しない。失敗した attempt も課金され得るため、使用量が取得できなければ `unknown` とする。
- `observation source`: 値をどの provider response / telemetry / trace / host event から得たか。直接観測・推定・不明を区別する。


- **`runId` / `legId` / `parentLegId`** — 実行の関連付け。ID の namespace と発行元を保存する設計案。既存 `runId` と同一だとは推測しない。
- **`strategy` / `role` / `provider` / `model`** — routing とモデル帰属を分離。role/model の一部は既存証跡にあるが、strategy は Host 情報。
- **`startedAt` / `durationMs` / `outcome`** — wall-clock と成功・失敗・timeout・skip を区別。reviewer role の時間は存在するが、全 leg の網羅性は未保証。
- **`attemptCount` / `fallbackReason`** — retry / fallback の負荷を観測。Review Team 全 leg の安定記録は未実装。
- **`inputTokens` / `outputTokens` / cache token counts** — 使用量の内訳。file×skill telemetry は opt-in で存在するが、leg と 1:1 の対応は未保証。
- **`costUsd` / `priceSource` / `priceVersion` / `costKind`** — 実コストと推定コストを分離。全 leg の確定課金値は未取得。
- **`evidenceSource` / `completeness`** — 根拠・欠測を区別するための設計案。collector 実装前に正本化しない。
- **`reviewCoverage` / `independenceEvidence`** — 網羅性と独立性を併記。論理 provenance は強い隔離の証明ではない。

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

Phase 4 は [#1574](https://github.com/s977043/river-review/issues/1574) の baseline/candidate paired replay を再利用します。評価指標は品質・critical-finding recall・false positives・coverage・総費用・wall-clock latency・human correction burden です。held-out / verifier trust が不足した評価は採用根拠にしません。**critical regression = 0** は最低条件であり、それだけで GO にはなりません。

Phase 5 で adaptive routing を試す場合も opt-in / bounded budget / fallback / Human-owned irreversible authority を維持します。外部 HydraFusion benchmark の値を River Review の受け入れ閾値には使用しません。

### 失敗時・例外時の扱い

- **未計測**: データが無いから合格とするのではなく、比較不能な metric として観測を拡充する。critical / independence / total cost の必須情報が無ければ active routing へ昇格しない。
- **実行なし**: dry-run / skipped など、provider call が発生していないことを検証できたときだけその leg の使用量を 0 とする。集計に未観測 leg が含まれる場合は run total を完全値にしない。
- **ソフトな境界**: reviewer role 数・モデル数・token 削減だけでは independence や品質を証明しない。影響範囲が限定された観測改善は shadow に留め、Human 判断を不要にしない。
- **再開条件**: baseline / held-out / source attribution / trusted verifier を確認する。critical regression がなく、必要な metric が揃った場合だけ別 PR で opt-in を再検討する。

## 未着手の範囲

- Single / Cascade / Critique を選択する実行 Router
- strategy / leg accounting の persisted API、schema、telemetry collector
- 実際の provider 請求値の完全突合
- モデル・プロバイダー・文脈・ツールの強い隔離証明
- Builder の自動修正、PR 自動マージ、release automation

既存の使用量見積もりは [コスト見積もりガイド](../guides/cost-estimation.md)、実行来歴は [Review Artifact](../reference/review-artifact.md) を参照してください。
