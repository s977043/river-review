---
id: issue-triage
sidebar_label: Issue棚卸しとHOTL運用
---

# Issue Triage Living Playbook — Evidenceから実行につなぐ

> **Status:** Living Practice / v0.1（実証中）
> **Owner:** River Review maintainer
> **Started:** 2026-10-10
> **Tracking:** [Issue #2635](https://github.com/s977043/river-review/issues/2635)
> **Rules SSoT:** [Issue / Project運用ルール](./issue-management.md)
> **Values:** [実践進化方針](./practice-evolution.md)

## 目的と責務

Open Issueを、過去の議論の保管庫ではなく「次に確かめ、進める仕事が分かるバックログ」に保つ。正本はGitHub Issue/PR、現行main、実行ログ・テストであり、このページは**変更可能な実践手順**とする。ラベル、Issue作成、承認、merge、releaseの現行規約は[Issue管理規約](./issue-management.md)とリポジトリのgovernanceが所有し、このページで変更しない。

ここでいう **HOTL (Human-on-the-Loop)** は、人の最終判断を不要にすることではない。AI開発エージェントが調査、仮説、再現、実装、テスト、PR、レビュー用の判断材料を**既存の権限内で**先に用意することを指す。River Review**製品**は引き続きread-onlyのレビュー判断材料を提供し、コード修正、Gateの独断変更、merge、release、リスク受容を所有しない。

**Evidence ≠ Judgment、Review Verdict ≠ Approval、Observation ≠ Attestation、Trigger ≠ Permission。** PRをmergeできる条件と誰が承認するかは既存のガバナンスによる。AIが収集した証拠はその権限を生成しない。

## 1. 小バッチでのIssue棚卸し（Loop A）

最初は**3〜5件**を選び、同じ型の処置を大量適用する前に1バッチの成否を確かめる。安全・認証・漏洩等の重要リスクは通常の整理と分けて扱う。

1. **Select:** 対象Issue、確認日時、main SHA、関連PR、対象範囲を固定する。
2. **Observe:** Issue本文と**最新コメント**、関連PRとmerged状態、コード、既存テスト、Acceptance Criteria (AC) を照合する。古い本文を最新事実とみなさない。
3. **Propose:** 各ACの `verified / unverified / unmet`、重複先、依存関係、推奨処置、残る危険、判断待ちでも進められる最小作業を記載する。
4. **Review:** 誤Close、未移管AC、security/fail-open、権限誤認、false-green、誤った依存を別観点で点検する。セルフレビューを独立承認と呼ばない。
5. **Apply:** 許可された範囲で、情報の追記、関連付け、軽量な修正PR、検証を進める。重複Closeの場合は残ACの所有先と相互リンクを先に確定する。
6. **Verify:** GitHubの状態を再取得し、Issue状態・Close理由・リンク・残AC・PR head・CIを再照合する。根拠に欠落があれば正直にOpenを維持する。
7. **Recover:** 誤Close・AC漏れ・権限逸脱を発見したら同型の変更を停止し、reopen、リンク・説明修正、影響範囲点検を行う。

まとめて更新する前に1件で検証する。チェックボックス未更新やPRの `Closes #N` 記述だけでAC満了とは認定しない。逆に古いIssueを無期限に保留せず、安価な再現・反証と現在の残存リスクを評価する。

### 処置分類（追加のラベルではない）

| Triage outcome | 根拠 | 次の一手 |
| --- | --- | --- |
| Completed | 全ACが現行mainと検証結果で充足 | 根拠と確認範囲を記録してcompleted |
| Duplicate | 目的・未達ACが同じで、代表Issueへ安全に引き継げる | AC移管・双方向リンクの後にduplicate/not planned |
| Superseded | 新設計・代替Issueに明示的に置換済み | 引継ぎ先と未達事項を記録してnot planned |
| Obsolete / not reproducible | 現行環境で確認して継続リスクが合理的に低い | 調査限界・再発条件を記録してnot planned |
| Out of scope | 現行の目標に照らして採らないと決定済み | 判断理由・再訪条件を記録してnot planned |
| Actionable | 次の検証・修正・評価を開始できる | Open、最小スライスとACを具体化 |
| Blocked / decision required | 不足する条件やHuman-owned権限がある | Open、解除条件と**並行可能な仕事**を記録 |

Issue番号が親子・関連であるだけでは重複にしない。安全保障、秘密情報、データ損失、承認迂回、fail-openなどの継続リスクは、単なる古さや再現困難を理由にCloseしない。監査可能な理由を残す。

## 2. HOTL：判断待ちを作業停止にしない

Issueを「Human判断が必要」の一行で終わらせない。**作業可能性**と**決定権限**を別の軸として扱う。

- **E0 Observe:** read-onlyで現在の実装・Issue・PR・制約を確認。
- **E1 Prepare:** 選択肢、推奨、トレードオフ、安価な再現・テスト、失敗条件、rollbackを用意。
- **E2 Execute:** 既に委譲された範囲で、可逆なIssue整備・実装・テスト・PR作成・レビューを進め、再取得して裏付ける。
- **E3 Decision packet:** 未解決の判断だけを人に示す。下記の情報が揃うまで情報収集・並行作業を続ける。
- **E4 Human-owned authority:** セキュリティリスク受容、不可逆操作、policy変更の正式採否、必要な独立承認やmerge等は既存の権限に従う。E0〜E3はE4の承認を代替しない。

最低限のDecision packetには `Problem / Evidence (refs+観測時点) / Unknown / Options / Recommendation / Cost & risk / Executable now / Explicit owner decision / Stop & recovery` を含める。証拠不足の項目を `0` や `PASS` としない。

**判断前に進められる例:** #2601のHTML連携はPRのマージ確認とdogfoodを独立に進められる。#2455のprovider-backed評価が未許可でも、offline fixturesや契約整合は進められる。これらを「承認済みの本番評価」と混同しない。

## 3. 進化する運用を観測する（Loop B）

2バッチ程度ごとに、Triageそのものの摩擦を1つ選ぶ。次の1〜2バッチで、**改善仮説を1つだけ**安価に試す。結果は `Keep / Adapt / Revert / Defer` のいずれかで記録し、Playbookを必要に応じ改訂する。

見る指標は、誤Close、残AC移管漏れ、間違った依存・リンク、不要なHuman escalation、次の実行可能作業までの時間、復旧時間、レビューの労力。**Close数そのものを成果目標にしない。** 計測できない値はunknownとする。

初期仮説は「3〜5件の小バッチと再取得により、大規模な一括整理より誤判定を早期発見しやすい」。効果は**未実証**。最初の2バッチ後に運用負担と品質を比較し、手順が重ければ削減・撤回する。

## 4. 変更の安全条件

- 既存のラベル語彙は[Issue管理規約](./issue-management.md)が正本。`P0/P1/P2`と`priority:P1/P2/P3`の混在を、既存の自動化・意味を確認せず一括置換しない。
- 子PRのマージは親Epicの完了を意味しない。全ACが満たされた場合だけCloseし、それ以外は残りを具体的にOpenで追跡する。
- PRレビュー前後でhead、必須CI、コメント、blocked labels、メンテナの承認条件を確認する。セルフレビュー≠独立レビュー。
- 非可逆な削除、権限越境、secret露出、false-greenの疑いを発見したら同型変更を停止し、根拠を残してreopen・rollback等を行う。
- 学習を新しい強制Gate・Bot・Agent・台帳としてすぐ固定せず、既存のIssue/PRと[実践進化方針](./practice-evolution.md)を再利用する。

## 5. 初期パイロットと再評価

[Issue #2635](https://github.com/s977043/river-review/issues/2635)にバッチ単位のEvidenceを残す。最初の対象は、A: #2601 / #2577 / #2633 / #2455（実装済み範囲と未達ACの区別）、B: #2033 / #2203 / #2202（secret/suppressionの継続リスク）。#2633が既にClose済みなら、完了の証拠を検証して再Closeしない。

結果に差がなければPlaybookを簡素化する。改善が確認できた部分だけ継続する。このページは将来の変更可能な運用であり、過去の判断・Evidenceの正本を上書きしない。
