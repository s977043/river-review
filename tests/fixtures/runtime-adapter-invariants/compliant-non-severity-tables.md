# Tables that are not the severity mapping (RA-1 canary)

Canary fixture for RA-1 (#2063 review, major 3). None of the tables below is
the internal → output severity mapping, so `detectReviewJudgmentDefinitions`
must return `[]` for this file. Each one shares vocabulary with that mapping and
is a plausible thing to write under `.claude/**`.

Relaxing the candidate test for #2058 briefly made the first two tables anchor a
severity block and then fail the direction check — a false positive that would
have failed the `Meta consistency` job for every PR.

## 障害等級表（左セルが出力語彙）

| 障害等級 | 通知先   |
| -------- | -------- |
| minor    | info     |
| major    | critical |

## ログレベル表（左セルが出力語彙）

| 出力     | 内部  |
| -------- | ----- |
| critical | major |
| trace    | info  |

## semver の bump 種別（右セルが出力語彙でない）

| bump  | 意味     |
| ----- | -------- |
| major | breaking |
| minor | feature  |
