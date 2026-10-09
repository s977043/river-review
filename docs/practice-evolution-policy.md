# Practice Evolution Policy — アジャイルの価値観と実践の進化

> **Status:** Living Policy（実践で検証し、必要なら更新する）
> **Owner:** River Review メンテナ（方針変更と最終判断は人間が所有）
> **Scope:** River Review 自身の開発・保守と、レビュー実践の改善判断
> **Nature:** 価値観と判断のガイド。新しい Gate、実行契約、必須チェックリストではない。
> **起点:** [Issue #2631](https://github.com/s977043/river-review/issues/2631)（2026-10-10）

## 1. 価値観は守り、実践方法は問い直す

私たちは[アジャイルソフトウェア開発宣言（公式日本語訳）](https://agilemanifesto.org/iso/ja/manifesto.html)の4つの価値を大切にします。右側に価値がないという意味ではなく、**個人と対話、動くソフトウェア、顧客との協調、変化への対応**をより重視します。[背後にある原則](https://agilemanifesto.org/iso/ja/principles.html)の短いフィードバック、技術的卓越性、シンプルさ、振り返りも参考にします。

River Review の開発では次のように解釈します。これらは**私たちの適用解釈**であり、宣言の引用そのものではありません。

| 価値観 | このリポジトリでの実践 |
| --- | --- |
| 個人と対話 | AIレビューの verdict や手順だけで合意を代替せず、指摘の理由・影響・異論を関係者と確かめる |
| 動くソフトウェア | 設計説明や「テストあり」だけで完了とせず、実行結果・回帰評価・利用状況から価値と品質を確かめる |
| 顧客との協調 | 利用者・コントリビューターの課題とフィードバックを、内部の都合や定型ルールより重視する |
| 変化への対応 | 現行プロセスも改善仮説として扱う。新たな Evidence が出たら変更・撤回を検討する |

## 2. 変化させるものと守る境界

| 層 | 扱い |
| --- | --- |
| **Values / Principles** | 対話、価値ある成果、協調、変化への対応、事実への誠実さと学習を重視。目先の効率のために軽々しく手放さない |
| **Safety / Authority** | Evidence と判断を区別し、出典・検証可能性を守る。高リスク変更の Human Judgment と Host / Human の承認・merge / release 権限を維持する |
| **Policies / Decisions** | 既存の承認済み方針はそれぞれの正本で変更する。この文書は規約・契約の上書きに使わない |
| **Practices / Tools** | Skill、Agent、レビュー方法、fixture、会議、手順、測定方法は試し、評価して改善・廃止できる |
| **Evidence / History** | 実装、テスト、PR、review run、実際のフィードバック、当時の判断理由を区別して残し、後から検証できるようにする |

**Review Verdict ≠ Approval、Evidence ≠ Judgment、Role ≠ Judgment Placement ≠ Authority** です。River Review は読み取り専用のレビュー・判断材料を担い、コード自動修正、開発フローの停止・継続、merge、release を自ら決定しません。判断の責務は [設計思想](philosophy.md)、[ビジョン](vision.md)、[Governance](governance.md) および [ADR-003](adr/003-risk-tiered-human-supervision.md) など各正本を優先します。

「守る」は将来の正式な方針改訂を禁止する意味ではありません。安全境界・承認権限・契約を変える必要があるときは、メンテナが既存の意思決定・承認ルートで明示的に扱います。

## 3. 現場の実践知 × 外部の知識

**Local Evidence:** 現在のコード、テスト、fixture / eval、レビュー指摘の disposition、PR / Issue、run record、利用者の観察。測定事実、体験談、推論、未確認の仮説を混同しません。

**External Knowledge:** アジャイル・リーンの原則、論文、公式ドキュメント、標準、OSSと他チームの実践。原典、適用条件、検証方法、時点、ライセンスを確かめます。

「対等に検討する」は「証拠の重みが同じ」という意味ではありません。一次性・再現性・測定条件・対象の近さ・リスクを踏まえて判断します。**定石だから採用する**、**自分たち独自だから守る**、どちらも自動的な正解にはしません。食い違うときは、可能なら反証可能な小さな実験を探します。

判断の選択肢に序列はありません。

| Choice | 使う場面 |
| --- | --- |
| **Adopt / 採用** | 条件が近く、導入価値・安全性・適用可能性が確認できる |
| **Adapt / 適応** | 原則は有効だが、River Review 固有の責務や利用者の状況に合わせる必要がある |
| **Transform / 前提の変革** | 既存の役割、運用や評価指標そのものが価値提供を妨げている可能性がある |
| **Defer / Reject / 見送り** | 効果が不明、適合しない、過剰な負担がある、または安全性が不足している |

## 4. Fast Feedback / Quick Recovery

- **最小の有用な検証から始める。** 長い事前設計より、既存の仕組みを使った小さな fixture、再現テスト、限定的なレビュー運用を優先する。
- **見える失敗を歓迎する。** 検証が失敗を捉えるか、誤検知を増やさないか、利用者の判断を助けたかを確かめる。「Green」の文字だけを品質の Evidence としない。
- **戻せる範囲で速く進む。** 影響範囲、停止条件、切り戻し方法を必要なリスクに応じて決める。不可逆の操作や Human-owned の境界は飛び越えない。
- **ルールを増やす前に減らせないか問う。** レビュー待ち時間、繰り返しの指摘、誤検知、保守負担も観測する。仕組みの複製・形式的な Gate・新しい Agent は必要性が確認できてから検討する。

## 5. 軽量な判断・振り返り

大きな方針変更や外部知識の採用では、既存の Issue / PR / Decision Record に、必要な項目だけを残します。**すべての作業に新しいテンプレートの提出を義務付けません。**

- **Problem / Outcome:** 何が困りごとで、どの成果を変えるのか
- **Evidence / Source:** 観測と仮説は何か。外部知識の原典・適用条件は何か
- **Choice / Trade-off:** Adopt / Adapt / Transform / Defer とした根拠
- **Small experiment / Stop:** 最小の検証、成功・失敗・撤回の条件は何か
- **Judgment / Owner / Revisit:** 誰が判断し、何が変わったら再評価するか

[Improvement Flow](development/improvement-flow.md) は再発する失敗を Guard / Script / Test などに codify する既存手順です。本方針はその前段で「そもそも固定化する価値があるか」「現行のルールを減らす選択はないか」も考えるための指針です。既存の必須検証とマージ条件をこの文書で緩和しません。

### River Review での適用例（仮説であり成果の実績ではない）

同じ finding が繰り返される場合、まず既存の review run・disposition・fixture を調べる。外部のプラクティスを参考にしても、無条件に新しい Skill を増やさず、既存の Riverbed、eval、Judgment Promotion の仕組みに適応できないか考える。小さなサンプルでレビューの有効性、誤検知、判断に要する負担を比較し、改善しなければ見送るか戻す。

## 6. この文書の再評価

この方針自体も完成品ではありません。実際の改善案件で**判断の質・速度、不要な工程や説明コスト**への影響を観察し、利用者の反証や新しい証拠が出たら見直します。役立たなければ既存文書への統合・簡素化・撤回も選択します。

関連する正本: [設計思想](philosophy.md) / [ビジョン](vision.md) / [Governance](governance.md) / [Improvement Flow](development/improvement-flow.md)。

参考: [アジャイル宣言](https://agilemanifesto.org/iso/ja/manifesto.html) / [PlanGateでの関連する検討PR](https://github.com/s977043/PlanGate/pull/1549)（出発点であり、この文書の実行契約ではない）。
