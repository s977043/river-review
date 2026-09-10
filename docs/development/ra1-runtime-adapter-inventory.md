# RA-1 Runtime Adapter 棚卸し（ADR-009 D7-4）

ADR-009 [`009-plugin-first-product-and-runtime-contract.md`](../adr/009-plugin-first-product-and-runtime-contract.md) の D7-4 が未処理として残した `.claude/**` の棚卸し結果です。#2027 で RA-1 の検査を実装した際に、検査対象の全ファイルを 1 件ずつ判定しました。

判定は `scripts/validate-plugin-manifest.mjs` の `detectReviewJudgmentDefinitions` と `checkReviewJudgmentDuplication` の実行結果です。人手の読み下しではありません。再実行は `npm run plugin:validate` で行えます。

## 測定条件

| 項目               | 値                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------- |
| 測定日             | 2026-09-04                                                                            |
| 対象の列挙方法     | `git ls-files -z -- .claude/** .codex/** .claude-plugin/*.json .codex-plugin/*.json`  |
| 対象ファイル総数   | 46 件                                                                                 |
| **適合**           | **46 件**（うち除外条件の成立による適合 1 件）                                        |
| 禁止パターンの検出 | 1 件（`.claude/rules/review-core.md` `:22` の severity 対応表）                       |
| うち除外条件が成立 | 1 件                                                                                  |
| **違反**           | **0 件**                                                                              |
| 検査の適用段階     | active（`RA1_ENFORCEMENT = 'active'`。違反は `npm run plugin:validate` を落とします） |

`.claude/**/*.md` に限れば 37 件で、ADR-009 D3-3 が 2026-09-03 に記録した件数と一致します。総数 46 件との差 9 件の内訳は、`.claude/settings.json` 1 件、`.claude/hooks/*.sh` 3 件、`.codex/**` 2 件、manifest 3 件です。

`find .claude -name '*.md'` は agent worktree のフルコピーを拾うため使いません。ADR-009 D3-3 項番 1 の指定どおり `git ls-files` を基準にしています。

## 検出範囲の宣言

**この検査は「Review Judgment の複製をすべて検出する」ものではありません。** 検出できるのは下表の記法に限ります。範囲外の記法は、内容が同じでも検出されません。範囲を明示するのは、検査の緑を「複製が無いことの証明」と読み違えないためです。

| 分類                           | 検出できる記法                                                                                                                                                                                                                                                                                                                                   | 検出できない記法                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `severity-vocabulary-map`      | Markdown 表の隣接 2 セルが内部語彙と出力語彙の対で並ぶ形。列数は 3 列以上でもよい。セル値の `` ` `` `*` `~` と全角パイプ `｜` は正規化する。対応の**向き**も `normalizeSeverity` と行単位で照合し、逆向き・誤対応の行があれば除外条件は成立しない（#2058）。ただし表を候補とみなすには内部語彙（`blocker` / `nit`）の左セルが 1 行以上必要である | 散文中の対応記述、日本語語彙（ブロッカー 等）、語中に空白を挟む表記、左セルが ASCII 小文字語でない行（`(なし)` や `(blocker)` 等。括弧付きに揃えた表は反転していても検出されない）、**列を入れ替えた表**（`\| critical \| blocker \|` 等。右セルが出力語彙でないため候補にならない）、**内部語彙の左セルを含まない誤対応表**（`\| warning \| minor \|` + `\| major \| info \|` 等。`warning` は fail-safe と同じ像なので anchor にならない） |
| `gate-decision-condition`      | verdict が見出し・太字ラベル・箇条書き項目・表の第 1 セルの**主語位置**にあり、同じ節または直後 8 行以内に条件行がある形。条件行の導入語は `条件` `判定条件` `成立要件` `判定基準` `Condition` / `Conditions` の 6 語に限る。表形式は行内の別セルを条件文とみなす                                                                                | 散文だけで条件を述べる形、verdict を主語位置に置かない形、`要件:` など上記 6 語以外の導入語                                                                                                                                                                                                                                                                                                                                                  |
| `completion-condition`         | 完了条件・完了判定・完了基準・completion criteria を含む見出しと、上記 6 語の条件行の組                                                                                                                                                                                                                                                          | 上記語を使わない完了条件の記述                                                                                                                                                                                                                                                                                                                                                                                                               |
| `finding-evidence-requirement` | `finding` / `findings` / `指摘` と 証跡 / evidence と 必須 / 必ず / MUST / required の 3 要素が同一行に揃う形。日本語 `指摘` も検出する                                                                                                                                                                                                          | 3 要素が複数行に散る形                                                                                                                                                                                                                                                                                                                                                                                                                       |

verdict とみなすトークンは `src/lib/gate-decision.mjs` `:68` の `GATE_DECISIONS`、すなわち `GO` `GO_WITH_OBSERVATION` `NO_GO` `ESCALATE` の 4 語に限ります。検出器はこれを import しており、再宣言していません。範囲をこの 4 語へ絞った理由は「決定 1」節に書きます。

トークン形状だけで verdict を判定する方式は採りません。4 文字以上の SCREAMING_CASE という形状規則は `CLAUDE` `AGENTS` `JSON` `HTTP` の見出しを gate verdict と誤判定します。語彙を製品 gate へ絞る変更が、同時にこの誤検出の対策にもなっています。

**コードフェンスと HTML コメントの中身も走査します。** 検出器は Markdown を構文解析せず行単位で判定します。フェンスで囲んだ表、`<!-- -->` で囲んだ判定節のいずれも除外されません（severity 規則・gate 規則それぞれについて 2 形ずつ、計 4 形で検出を実測しました）。したがって**この検査の説明を `.claude/**` の中へ書くと、例示が自己言及で違反として検出されます**。説明を置くなら本ファイルのように `docs/**` 側へ置いてください。

## 決定 1—RA-1 の判定範囲は製品 gate 語彙に限る

`.claude/commands/**` の 4 ファイルは `MERGE_OK` `SAFE` `PASS` `REGISTERED` などの verdict を「判定」節で定義し、直後に `条件:` 行を置いています。これらを RA-1 の対象に含めるか否かが #2027 の最大の論点でした。

**含めません。** これらの verdict が判定するのはリポジトリの作業手順であり、レビューではありません。River Review 製品の gate 語彙は `src/lib/gate-decision.mjs` `:68` の `GATE_DECISIONS`（`GO` `GO_WITH_OBSERVATION` `NO_GO` `ESCALATE`）であって、両者は名前空間が異なります。ADR-009 D3 が守る「gate / decision の意味」は前者を指しません。

この決定により、`gate-decision-condition` 規則の語彙は `GATE_DECISIONS` の 4 語に限定されました。検出は 10 件から 1 件へ減っています。

ADR-009 D7-4 `:147` は `merge-check.md` `:156` `:162` を D3 違反として数えており、本決定と食い違っていました。**この食い違いは #2059 で解消済みです。** D7-4 の本文は決定時点の記録として残し、同節末尾へ「後日追記」を足す形で本決定を反映しています。

## 決定 2—`.claude/rules/review-core.md` は出典を足して残す

ADR-009 D7-2 が予告したケースです。同ファイルの `:22`〜`:24`（出典行を足す前は `:21`〜`:23`）は severity の内部語彙と出力スキーマの対応表を持ちますが、宣言する SSoT 3 本に内部語彙が逐語で現れません。2026-09-04 の実測でも `grep -c blocker` は `pages/reference/review-policy.md` `docs/review/output-format.md` `docs/review/viewpoints.md` のいずれも 0 を返します。

この根拠は大文字小文字の区別に依存します。`grep -ic blocker` は `pages/reference/review-policy.md` と `docs/review/output-format.md` がそれぞれ 1 を返し、いずれも表示形 `Blocker` にあたります（2026-09-04 実測）。逐語一致を判定する `containsWord` は case-sensitive であり、この散文の `Blocker` で小文字の対応表が除外されることはありません。結論は変わりませんが、根拠が case の区別に依存する点は `tests/validate-plugin-manifest.test.mjs` が pin しています。

一方で ADR-009 D4 `:122` は「severity 語彙の正本は `src/lib/**` にある」と明記しており、`src/lib/**` は D3-3 の除外 SSoT 一覧に含まれます。`src/lib/finding-factory.mjs` には `blocker` `warning` `nit` `critical` `major` `minor` の 6 語がすべて逐語で存在します。

したがって出典を 1 行足せば除外条件が成立します。追加する行は次のとおりです。

```text
- severity 内部語彙と出力スキーマ対応の実体: `src/lib/finding-factory.mjs`
```

**この 1 行は適用済みです。** 適用後の `npm run plugin:validate` は `Plugin manifest: OK` を返し、RA-1 の observation は 0 件です。

対応表そのものは残ります。検出はされますが、除外条件（SSoT 参照 + 逐語一致）が成立するため違反にはなりません。この状態は `tests/validate-plugin-manifest.test.mjs` が既存の production path で pin しています。「検出されない」のではなく「除外される」ことを検査で区別しているため、対応表が消えたり出典行が外れたりすれば検査が落ちます。対応表の内容が `normalizeSeverity` と食い違った場合も同じく落ちます（#2058。当初は語彙の存在だけを見ており、表を反転させても緑のままでした）。

## 違反の disposition

| ファイル                                    | 検出（決定 1 適用前）                       | 現在の扱い                 | 処置                                                   |
| ------------------------------------------- | ------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `.claude/rules/review-core.md`              | `severity-vocabulary-map` `:22`             | 検出されるが除外条件が成立 | 決定 2。出典 1 行を追加済み（適用済み・違反 0 件）     |
| `.claude/commands/merge-check.md`           | `gate-decision-condition` `:156` `:162`     | 対象外（作業手順 verdict） | 決定 1。検出器の語彙を `GATE_DECISIONS` へ絞り解消済み |
| `.claude/commands/preflight.md`             | `gate-decision-condition` `:72` `:83` `:97` | 対象外（作業手順 verdict） | 同上                                                   |
| `.claude/commands/register-plugin-asset.md` | `gate-decision-condition` `:66` `:72`       | 対象外（作業手順 verdict） | 同上                                                   |
| `.claude/commands/verify-agent-report.md`   | `gate-decision-condition` `:79` `:85`       | 対象外（作業手順 verdict） | 同上                                                   |

`completion-condition` と `finding-evidence-requirement` の検出は 46 件を通じて 0 件でした。誤検出も、**本節が測定した 46 件の範囲では** 0 件です。範囲外のファイルについては測っていません。

なお `docs/governance.md` を D3-3 の除外 SSoT 一覧へ加える案は採りません。2026-09-04 実測で `grep -c MERGE_OK docs/governance.md` が 0 を返すため逐語一致が成立せず、ADR-009 D4 `:115` の runtime-independent 資産一覧にも含まれないためです。決定 1 により `merge-check.md` 自体が対象外となり、この論点は解消しました。

## 検査の適用段階

`scripts/validate-plugin-manifest.mjs` の `RA1_ENFORCEMENT` が段階を持ちます。値は `off` / `observe` / `active` の 3 つで、現在は `active` です。

| 段階      | 挙動                                                       |
| --------- | ---------------------------------------------------------- |
| `off`     | RA-1 を実行しない                                          |
| `observe` | 違反を警告として出力する。終了コードは変えない             |
| `active`  | 違反をエラーとして扱う。`npm run plugin:validate` が落ちる |

決定 1 と決定 2 で 5 件すべての disposition が決まり、違反が 0 件になったため **`active` へ切り替え済み**です。以後、新しい違反は `npm run plugin:validate` を落とします。

段階の切り替えは `RA1_ENFORCEMENT` 定数 1 つで行い、経路の分岐は `ra1Sink()` が担います。リポジトリに違反が 1 件も無い状態では、検査を実行するだけでは `observe` と `active` を区別できません。そのため `ra1Sink()` を独立した純関数として切り出し、3 段階の経路をテストで直接 pin しています。

## 付録: 対象 46 件の一覧

1 件ごとの判定です。「適合」は禁止パターンの検出が 0 件だったもの、「適合（除外条件成立）」は検出されたが D3-3 の除外条件を満たしたものです。違反は 0 件です。

| ファイル                                                                           | 判定                 | 根拠                                                                                                                                         |
| ---------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude-plugin/marketplace.json`                                                  | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude-plugin/plugin.json`                                                       | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.claude/agents/README.md`                                                         | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/README.md`                                                       | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/merge-check.md`                                                  | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/plan-merge-order.md`                                             | 適合                 | 禁止パターン検出 0 件。SSoT 参照 3 本                                                                                                        |
| `.claude/commands/preflight.md`                                                    | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/propose-issue.md`                                                | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/register-plugin-asset.md`                                        | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.claude/commands/release-kick.md`                                                 | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/commands/verify-agent-report.md`                                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/hooks/README.md`                                                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/hooks/format.sh`                                                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/hooks/gh-account-guard.sh`                                                | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/hooks/no-force-push.sh`                                                   | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/rules/README.md`                                                          | 適合                 | 禁止パターン検出 0 件。SSoT 参照 2 本                                                                                                        |
| `.claude/rules/review-core.md`                                                     | 適合（除外条件成立） | `severity-vocabulary-map` `:22`。SSoT 参照は 3 本だが、6 語すべてが逐語で存在するのは src/lib/finding-factory.mjs のみ（「決定 2」節を参照） |
| `.claude/settings.json`                                                            | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/README.md`                                                         | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/ask-codex/SKILL.md`                                                | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/SKILL.md`                                  | 適合                 | 禁止パターン検出 0 件。SSoT 参照 6 本                                                                                                        |
| `.claude/skills/river-review-discipline/anti-patterns.md`                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/review-memory.md`                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/river-review-loop.md`                      | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/templates/design-review-template.md`       | 適合                 | 禁止パターン検出 0 件。SSoT 参照 2 本                                                                                                        |
| `.claude/skills/river-review-discipline/templates/diff-review-template.md`         | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.claude/skills/river-review-discipline/templates/report-review-template.md`       | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/templates/requirements-review-template.md` | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.claude/skills/river-review-discipline/templates/verification-review-template.md` | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/river-review-discipline/usage-prompts.md`                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-creator/SKILL.md`                                            | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-creator/assets/basic-skill-template.md`                      | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-creator/assets/eval-rubric-template.md`                      | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-creator/references/design-principles.md`                     | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-creator/references/review-default.md`                        | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-ops-planner/SKILL.md`                                        | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-ops-planner/assets/skill-roadmap-template.md`                | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-ops-planner/references/portfolio-policy.md`                  | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-ops-planner/references/review-default.md`                    | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-optimizer/SKILL.md`                                          | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-optimizer/assets/eval-rubric-template.md`                    | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-optimizer/references/optimization-playbook.md`               | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.claude/skills/skill-optimizer/references/review-default.md`                      | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
| `.codex-plugin/plugin.json`                                                        | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.codex/AGENTS.md`                                                                 | 適合                 | 禁止パターン検出 0 件。SSoT 参照 1 本                                                                                                        |
| `.codex/config.toml`                                                               | 適合                 | 禁止パターン検出 0 件                                                                                                                        |
