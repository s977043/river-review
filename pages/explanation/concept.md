---
id: concept
title: コンセプト（レビューを、組織の判断資産へ）
---

River Review は、チーム固有のレビュー判断を versioned / repo-owned / testable な Skill として明示化し、SDLC 上の Artifact へ適用する OSS フレームワークです。AI が生成した成果物を、チームが所有する判断基準で評価できる状態をつくります。

このページは、River Review が何を課題と捉え、どんな価値を提供し、どこから先を引き受けないのかを整理したコンセプトの解説です。機能や実行モデルの概要は [River Review とは](./what-is-river-review.md)、はじめての方向けの短い導入は [River Review へようこそ](./intro.md) を参照してください。

## なぜ、いまレビューなのか

AI によって「作る速度」は上がりました。一方で「何を信頼してよいか」を判断する負荷は増えています。River Review は、次の 4 つの課題を出発点としています。

1. **実装速度と判断速度の非対称** — AI は大量のコードや Artifact を生成できるが、意思決定の品質は自動では高まらない。
2. **レビュー知識の散逸** — 判断基準が PR コメント・個人の経験・会話に埋もれ、次の開発で再利用されにくい。
3. **同じレビューの繰り返し** — チームは同じ観点を毎回ゼロから説明するため、レビュアーの認知負荷と待ち時間が増える。
4. **判断基準の所有権** — モデルやレビュー SaaS を乗り換えても、チーム固有の判断基準はチーム自身の資産として残す必要がある。

## レビューの価値を再定義する

> レビューの価値は、バグを見つけることだけではない。意思決定の品質を高めることにある。

レビューとは、成果物に対して異なる視点・根拠・リスク・代替案を提示し、より信頼できる意思決定を可能にする活動です。バグ発見は重要な一部ですが、レビューの価値はそこだけに閉じません。River Review は、この「意思決定の品質を高める活動」としてのレビューを、再利用・評価・改善できる形へ変えることを狙いとしています。

## River Review をどう説明するか

コンセプトの語彙は 4 層に分かれます。層ごとに役割が違うため、混ぜずに使い分けます。

| 層                  | 表現                                              | 役割                                     |
| ------------------- | ------------------------------------------------- | ---------------------------------------- |
| Tagline             | レビューを、組織の判断資産へ                      | 価値を一言で伝える                       |
| Core Mechanism      | Review Judgment as Code                           | 中核思想。仕組みの説明はここに集約する   |
| Current Product     | Review Judgment Platform / Team-owned Audit Layer | いま提供しているものの呼び方             |
| Long-term Direction | Engineering Judgment Infrastructure               | 長期の拡張方向であり、現在の看板ではない |

中核思想である **Review Judgment as Code** は、レビュー観点・判断基準・責任範囲・Evidence・エスカレーション条件・品質評価方法を、再利用と評価と改善が可能な形で管理する考え方です。Engineering Judgment Infrastructure は将来の到達点を示す語であり、現在の River Review が提供している機能の説明としては使いません。

**Judgment Placement** は、この 4 層に並ぶ 5 つめの看板ではありません。Core Mechanism をどこで実行するかを決める原則であり、Core Mechanism の層に属します。Review Judgment as Code は「何を判断するか」を資産化する考え方です。これに対し Judgment Placement は、個々の判断をどの評価層へ置くかを設計します。評価層は Deterministic / Heuristic / Agentic Review / Human Judgment の 4 つです（[Judgment Placement](./judgment-placement.md)）。

## 判断を定義し、実行し、記憶する

River Review のコアモデルは 3 つの層で構成されます。

- **Skills define judgment** — Skill はレビュー職務・判断基準・責任境界を表す単位である。versioned / testable / portable な資産として管理する（[Skills](./skills.md)）。
- **Gates execute judgment** — 要件・設計・計画・実装・検証など、適切な SDLC フェーズで Skill を実行する（[上流、中流、下流](./upstream-midstream-downstream.md)）。
- **Riverbed remembers judgment** — suppression・WontFix・過去判断・フィードバックを保持し、将来のレビューの一貫性と改善につなげる（[Riverbed Memory](./riverbed-memory.md)）。

この 3 層は、次の判断ループとして回ります。

```text
レビュー判断 → Skill 化 → Artifact へ適用 → Finding / Evidence / Verdict
  → 人間または呼び出し側が判断 → 結果を記憶・評価 → Skill を改善
```

ループの起点はチームが実際に下したレビュー判断です。その判断を Skill として書き出し、Artifact へ適用し、Finding / Evidence / Verdict という判断材料を得ます。最終的な判断は人間または呼び出し側が下し、その結果を記憶して評価し、Skill の改善へ戻します。

## コードだけでなく、開発の流れをレビューする

River Review は PR の差分だけを見るツールではありません。実装前から実装後まで、SDLC 上の Artifact へチームの判断基準を一貫して適用します。対象とする Artifact は次の 9 種です。

- **Requirement** — 目的・成功条件・スコープの曖昧さを減らす
- **Design** — 既存設計との整合性、責務分離、過剰実装を確認する
- **ADR** — 決定の理由・代替案・影響範囲が残っているか確認する
- **Plan** — 作業分割・リスク・検証方針が実装前に揃っているか確認する
- **Diff** — 実装が要件・設計・計画と整合しているか確認する
- **Tests** — テストが仕様とリスクに対して十分か確認する
- **Security Report** — セキュリティ上の指摘と対応状況を確認する
- **Final Report** — 判断根拠・検証結果・未解決事項が残っているか確認する
- **Operations Artifact** — リリース準備や運用手順に抜けがないか確認する

この 9 種は、[River Review へようこそ](./intro.md) で導入用に示している 5 分類（要件 / 設計 / 計画 / 差分 / レポート）を細分化したものです。対応は次のとおりです。

| 5 分類   | 対応する Artifact              |
| -------- | ------------------------------ |
| 要件     | Requirement                    |
| 設計     | Design / ADR                   |
| 計画     | Plan                           |
| 差分     | Diff / Tests                   |
| レポート | Security Report / Final Report |
| （拡張） | Operations Artifact            |

上流では要件・設計・ADR・計画を確認して後続工程のリスクを減らし、中流ではコードと PR をレビューして設計意図・計画・差分の整合を保ち、下流ではテスト・QA・完了レポート・リリース準備を確認します。

上の 9 種は **コンセプト上のレビュー対象** です。実装済みの入力契約は [Artifact Input Contract](../reference/artifact-input-contract.md) が定義する 14 入力（`plan` / `diff` / `junit` / `test-cases` など）であり、9 種のすべてが専用の入力タイプを持つわけではありません。Skill の充足度もフェーズによって濃淡があります。とくに Security Report と Operations Artifact は、対象領域としては定義済みですが、対応する入力契約と Skill は拡充中です。CLI としてどこまで実装済みかは [レビュー対象と使いどころ](./review-scope.md) を参照してください。

## 判断材料を増やし、責任は肩代わりしない

River Review は判断材料を増やす仕組みであり、責任を委譲する仕組みではありません。役割の分担は次のとおりです。

| 主体                | 担うこと                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| River Review        | Artifact をレビューし、Finding / Evidence / Verdict を提供する。チームの判断基準を再現可能にする |
| 人間                | 最終責任、事業妥当性、不可逆な変更、重大なセキュリティ判断、高リスク領域の承認                   |
| AI 実装エージェント | Artifact を生成・修正する。River Review はその成果物がチーム基準へ適合するかを評価する           |
| PlanGate / Caller   | River Review の出力をもとに、GO / NO-GO / NEEDS_REVISION、反復、停止、承認を決める               |

プロダクト開発フローの中では、役割が次のように分かれます。

- **PlanGate** — 何を作るかを決める
- **AI 開発エージェント** — どう作るかを担う
- **River Review** — 本当に良いかを評価する
- **AI Loop** — どう改善するかを回す

River Review は「レビューする」までを担当し、「止める / 通す」の判断は PlanGate や呼び出し側が決めます。この境界はコンセプトと実装の両方で維持します。

なお、この 4 段は役割の分担を示すものであり、特定プロダクトへの依存ではありません。River Review のコア契約は artifact-based です。PlanGate と AI Loop は有用なワークフロー形態の一例にすぎず、River Review が単一のプランニング手法や特定のループ実装に依存することはありません。

人間監督の重さは、変更のリスクに応じて 3 階層で配分します。

- **崖（cliff）** — リスクの高い変更。人間承認を必須とし、不明なときは ESCALATE する。
- **丘（hill）** — 継続は許すが、期限付きの観測と後続確認を課す。
- **原っぱ（field）** — 低リスク。自律収束を許し、記録を使って事後に監査する。

この 3 階層の詳細は [設計哲学](./design-philosophy.md)、人間の判断をどこへ集中させるかは [Human Judgment Focus](./human-judgment-focus.md) を参照してください。

## Mission と Vision

- **Mission** — レビューを、一度きりのコメントから、再利用・評価・改善できる組織の判断資産へ変える。
- **Vision** — 人と AI が協調し、リスクに応じた責任分界のもとで、レビュー判断を継続的に改善できる状態を実現する。

## 現在の提供価値と、長期的な方向性

現在の River Review は **Review Judgment Platform** です。提供しているのは次の 4 つです。

- レビュー判断の Skill 化
- Artifact を横断したレビュー
- チームが所有する監査レイヤー（team-owned audit layer）
- 評価と operating memory による継続的な改善

長期の拡張方向は **Engineering Judgment Infrastructure** です。レビュー以外の判断職務への展開、ADR・設計・運用・SRE 判断の資産化、良い判断の作り方を組織能力にすることを見据えています。ただしこれは将来の方向性であり、現在の提供価値と混同しないよう分けて扱います。

## River Review が目指さないもの

- **汎用 AI コードレビュー SaaS** — チーム文脈を持ち込めないため目指さない。
- **実装エージェントの置き換え** — 並列して動く検査ゲートとして設計する。
- **静的解析の置き換え** — Artifact を跨ぐ判断に集中する。
- **人間レビュアーの完全代替** — 崖の人間承認を契約に組み込み、監督をリスク階層で配分する。
- **コード自動修正** — 問題の発見と指摘までを担い、コード変換や自動修正は行わない。
- **自動承認・自動マージ** — verdict は判断材料であり、承認そのものではない。
- **Evidence 不足のままの自律判断** — 自動化範囲の拡大は、検証とフィードバック反映の裏付けがある観点に限る。

この一覧の SSoT は内部資料の [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md) にあり、本ページは同じ項目を掲載しています。最後の項目は [設計哲学](./design-philosophy.md) の「精度向上の前提」と同じ原則です。裏付けのない領域を先行させず、検証実績が積み上がった観点から広げます。

## 関連ページ

- [River Review へようこそ](./intro.md) — はじめての方向けの短い導入
- [River Review とは](./what-is-river-review.md) — 機能・利用方法・実行モデルを含むプロダクト概要
- [Human Judgment Focus](./human-judgment-focus.md) — 人間監督・リスク階層・責任境界の詳細
- [Judgment Placement](./judgment-placement.md) — レビュー判断をどの評価層で実行するかを決める原則
- [レビュー対象と使いどころ](./review-scope.md) — 対象 Artifact と利用フェーズの整理
- [設計哲学](./design-philosophy.md) — 設計原則とリスク階層型の人間監督
- [AI レビュー標準ポリシー](../reference/review-policy.md) — レビュー観点と出力形式の SSoT
- [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md) — 内部向けの設計思想 SSoT
