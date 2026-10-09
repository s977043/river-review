---
id: practice-evolution
sidebar_label: 実践進化方針
---

# アジャイルの価値観に基づく River Review の実践進化

River Review は、レビュー判断をチームが所有・検証・改善できる OSS です。このプロジェクト自体の開発・保守・コミュニティでの意思決定も、**人と対話し、実際の成果を確かめ、変化から学ぶ**ことを重視します。

このページは **OSS運営における公式の公開方針（Living Policy）** です。参加者が Issue・Pull Request・Discussions で提案や異論を示す際の判断指針であり、新しい必須レビュー Gate や承認ステップを追加するものではありません。変更可能な実践と、現在有効な安全・承認ルールは区別します。

## 私たちが重視する価値

[アジャイルソフトウェア開発宣言（公式日本語訳）](https://agilemanifesto.org/iso/ja/manifesto.html)の4価値と[その背後にある原則](https://agilemanifesto.org/iso/ja/principles.html)を尊重します。右側の価値を否定するものではありません。次は River Review での**適用解釈**であり、原典そのものの引用ではありません。

- **個人と対話:** チーム・利用者・コントリビューターとの対話を、AIの verdict や形式的な手順だけで置き換えない。
- **動くソフトウェア:** 説明や計画の完成より、動作、検証、実際の利用者価値を確かめる。
- **顧客との協調:** ユーザーや貢献者の現実の困りごとを把握し、提案の背景と結果を共有する。
- **変化への対応:** 手段や手順は固定せず、根拠が変われば更新・削減・撤回できる。

## 守る価値観と変更できる実践を区別する

- **Values / Principles:** 対話、価値ある成果、協調、実証と学習を重視する。
- **Safety / Authority:** Evidence ≠ Judgment、Review Verdict ≠ Approval、Role ≠ Judgment Placement ≠ Authority を守る。River Review が返すのは判断材料であり、承認・merge・release は人間または Host の責務である。高リスク変更に必要な人間承認も維持する。
- **Policies / Decisions:** 現在有効なセキュリティ、互換性、貢献手順、CI、ガバナンス規則は引き続き適用する。変更には既存の Issue・レビュー・メンテナの正式な判断を要する。
- **Practices / Tools:** Skill、Agent、評価手法、Issue運用、会議、チェックリストなどは、効果を確かめながら変更・統合・削減できる。
- **Evidence / History:** コード、テスト結果、review run、PR、利用者の観察、意思決定の理由を区別し、検証できる形で扱う。

「将来の変更を認める」と「現時点のルールを無視する」は異なります。特に[公開貢献ガイド](https://github.com/s977043/river-review/blob/main/CONTRIBUTING.md)と[レビュー方針](../../reference/review-policy.md)は引き続き適用されます。詳細な製品責務は[設計哲学](../../explanation/design-philosophy.md)と[人間の判断](../../explanation/human-judgment-focus.md)を参照してください。

## 現場の Evidence と外部知識を照合する

**Local Evidence** は、このOSSで観測したコード・テスト・評価・PRの指摘と処理・利用者のフィードバックです。**External Knowledge** は、公式資料、研究、標準、他のOSSや開発チームの経験です。

どちらも参照しますが、**証拠の強さが常に同じとはみなしません**。出典・一次性・再現可能性・適用条件・リスクを確かめます。現行方式を正当化するためだけに現場の実績を使わず、流行だからという理由だけで外部の実践も取り込みません。

提案への判断は、次のいずれも正当な選択です。

- **Adopt / 採用:** River Review に適合し、便益と安全性を確かめられる。
- **Adapt / 適応:** 有益な原則を、利用者やOSSの責務に合わせて変える。
- **Transform / 前提の変革:** 既存の前提や評価方法そのものを問い直す。
- **Defer / 見送り:** 根拠不足、現状では適用困難、コストやリスクが便益を上回る。

採用しない提案も学習の一部です。可能な限り理由と、何が変われば再検討するかを共有します。

## Fast Feedback / Quick Recovery

- まずは**小さく有用な検証**を選ぶ。最初から大きな仕組みや完成されたプロセスを作らない。
- 失敗、誤検知、長いレビュー待ち時間、過剰な手順も改善の Evidence として扱う。
- 変更は可能な範囲で可逆にし、停止条件や戻し方をリスクに応じて明確にする。高リスク・不可逆の境界は飛び越えない。
- **Skill や Gate を増やすだけでなく、不要な工程を減らす**ことも進化として評価する。

## OSSとして提案・検証・改善するには

[Discussions](https://github.com/s977043/river-review/discussions) で問題や仮説を話し合い、具体化したら [Issue](https://github.com/s977043/river-review/issues) や [Pull Request](https://github.com/s977043/river-review/pulls) で提案してください。[コントリビューションガイド](../../guides/governance/CONTRIBUTING.md)は具体的な参加手順を説明します。

提案には、可能な範囲で **解決したい課題、現場での観測、参考にした外部知識、最小限の検証、期待する結果と見直す条件** を添えると判断しやすくなります。専用の提出物を新たに義務付けるものではなく、既存のIssue/PRの仕組みを活用します。提案者の意見とレビュアーの観点が異なる場合も、根拠と代替案を確認します。

この方針自体も実践の中で見直します。利用者に役立たない、説明コストが増えすぎるなどの Evidence が得られたら、簡素化や統合も検討します。最終的な方針変更・権限判断は既存のガバナンスに従い、メンテナが所有します。

関連: [コンセプト](../../explanation/concept.md) / [設計哲学](../../explanation/design-philosophy.md) / [コントリビューション](./CONTRIBUTING.md)。導入経緯は [Issue #2631](https://github.com/s977043/river-review/issues/2631) と [PR #2632](https://github.com/s977043/river-review/pull/2632) を参照してください。
