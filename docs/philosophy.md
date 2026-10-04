# River Review の設計思想

River Review が向き合う課題、設計意図、PlanGate との責務分担、Harness Engineering との関係を説明する文書です。利用者向けの導入・操作手順は [`pages/`](../pages/)、現在のプロダクト概要は [README](../README.md) を参照してください。

## 向き合う課題

AI 支援開発では、実装や成果物を作る速度が上がる一方、「何を信頼してよいか」を判断する負荷は増えている。River Review は次の課題を出発点とする。

1. **実装速度と判断速度の非対称**—成果物の生成が速くなっても、意思決定の品質は自動では高まらない。
2. **レビュー知識の散逸**—判断基準が PR コメント、個人の経験、会話に埋もれ、次の開発で再利用されにくくなる。
3. **同じレビューの繰り返し**—チームは同じ観点を毎回説明し、レビュアーの認知負荷と待ち時間が増える。
4. **判断基準の所有権**—モデルやレビューサービスを乗り換えても、チーム固有の基準はチームの資産として残る必要がある。

レビューの価値はバグ発見だけではありません。成果物に異なる視点・根拠・リスク・代替案を示し、より信頼できる意思決定を支援することです。プロンプトを磨くだけでなく、レビュー判断を再利用・評価・改善できる形にすることを目指します。

## 設計意図

**Review Judgment as Code** は、レビュー観点、判断基準、責任範囲、Evidence、エスカレーション条件、品質評価方法を、再利用・評価・改善できる形で管理する考え方です。

現在の提供価値は **Review Judgment Platform / team-owned audit layer** です。

- **Skills define judgment.** チーム固有のレビュー職務と基準を skill としてリポジトリ内に置き、versioned / testable / portable にする。
- **Gates execute judgment.** plan、diff、tests などの構造化された artifact を入力に、適切な段階で skill を実行し、findings を返す。
- **Riverbed remembers judgment.** 過去のレビュー結果や判断を operating memory として活用し、繰り返しの判断を一貫させる。
- **Evaluation makes quality inspectable.** fixtures、golden outputs、evals でレビュー品質の回帰を検出し、改善を測れるようにする。

skill は単なる工程ではなく、責任範囲と人への引き継ぎ条件を持つレビュー職務として設計します。リスクに応じて監督を配分し、高リスクの変更では人間承認を必須とします。自動化は根拠と評価のある範囲に限ります（[ADR-003](adr/003-risk-tiered-human-supervision.md)）。

## Harness Engineering との関係

Harness Engineering は、エージェントに良い指示を与えるだけでなく、エージェントが作業する環境・ツール・制約・検証・フィードバックの仕組みを整える考え方として捉えています。River Review はその全体を提供するものではなく、**レビュー判断を再現可能にする検証・フィードバック層**を担います。

レビュー基準を repo-owned skills として管理し、artifact 契約に沿って適用し、fixtures / evals で結果を確かめることで、プロンプト単発の巧拙に依存しにくくします。運用上の実測でも、手順を文書化するだけでなく実行前に一度通すことが不具合の早期発見につながっています（[2026-09-05 Harness retrospective](development/retrospectives/2026-09-05-harness.md)）。

この位置づけは、エージェント実行環境や開発 harness 全体を置き換えるという主張ではありません。River Review はレビューを読み取り専用で行い、コードを自動修正せず、承認・停止・マージの最終制御も引き受けません。

### Harness 内での責務境界

River Review では、外部の固定的な「N 層」を新しい taxonomy や owner table として導入しません。既存コンポーネントが Harness のどの責務を補強するかを説明する lens として、次のように整理します。

| Harness の責務             | River Review が担う範囲                                                             | River Review が所有しないもの                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Capabilities               | repo-owned Skills、review agent、reviewer lens                                      | 汎用実装エージェントの能力全体                          |
| Context / steering         | diff、artifact、rules、memory の選択と review context 構築                          | プロジェクト全体の agent context / task planning        |
| Coordination               | Review Team の role 選択、fan-out、finding merge                                    | project-wide agent orchestration、worker scheduling     |
| State / memory             | Riverbed、saved run、review evidence                                                | 汎用 long-term agent memory の正本                      |
| Evaluation / observability | fixtures、evals、Review Coverage、Evidence / provenance surface                     | 実装 agent 全体の observability platform                |
| Judgment / enforcement     | Judgment Placement、review verdict、Gate recommendation、opt-in enforcement adapter | merge / release / production promotion の最終 authority |

この表は ownership を新設するものではありません。各 contract の正本は既存 schema / ADR / reference docs に置き、同じ artifact に値が入っていても責務を統合しません。

### Agent Team Topology との関係

Review Team は「誰がレビュー作業を行うか」という実行 topology です。一方、[Judgment Placement](../pages/explanation/judgment-placement.md) は「その判断を Deterministic / Heuristic / Agentic Review / Human Judgment のどこで実行するか」を決めます。さらに、承認・merge・release など不可逆な実行 authority は Host / Human に残します。

したがって、River Review では **Role ≠ Judgment Placement ≠ Authority** を維持します。reviewer role の数や多数決で truth / authority を強めません。Evidence と Agent role の分離は [ADR-013](adr/013-evidence-architecture.md#relationship-to-agent-team-topology) に従います。

## PlanGate との関係

River Review は PlanGate に依存せず、特定の計画手法も要求しません。artifact-based な入力契約により、plan がないチームは diff やテスト成果物から始められる。plan ゲートは利用できますが、verify ゲートの実行は現時点で未実装です。

PlanGate は River Review の主要な統合例です。PlanGate が計画・ワークフローを管理し、River Review は渡された `plan` / `pbi-input` / `diff` などを独立に検査して findings と verdict（判断材料）を返します。**River Review がレビューし、PlanGate が GO / NO-GO や停止・継続を制御する**責務分担を保ちます。承認・反復・停止・merge は呼び出し側または人間の責務です。

## 位置づけと非ゴール

River Review の持続的な差別化は「AI」そのものではなく、判断基準をチームが所有できることです。実装エージェントやモデルが変わっても、repo-owned skills、artifact 契約、評価資産を維持できます。

- 汎用 AI コードレビュー SaaS、実装エージェント、静的解析を置き換えません。
- 人間レビュアーを完全代替せず、自動承認・自動マージを行わない。
- 問題の指摘を担い、コードを自動修正しない。
- Evidence が足りない観点を自律判断へ広げない。

長期的には ADR、設計、運用、SRE などの判断職務にも適用できる **Engineering Judgment Infrastructure** を目指します。これは長期の方向性であり、現在の提供価値とは区別します。

関連する公開解説は [コンセプト](../pages/explanation/concept.md)、[導入](../pages/explanation/intro.md)、[River Review アーキテクチャ](../pages/explanation/river-architecture.md)を参照してください。
