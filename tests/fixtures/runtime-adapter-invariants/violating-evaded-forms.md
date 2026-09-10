# Evasion forms (RA-1 negative fixture)

Negative fixture pinning the forms that slipped past the first version of the
detector (#2050 review, major 2). None of them changes the content — each is a
formatting variation of a definition ADR-009 D3-2 forbids.

## Severity map with a third column and backticked cells

| 内部語彙  | 出力スキーマ | 備考   |
| --------- | ------------ | ------ |
| `blocker` | `critical`   | 最重要 |
| `nit`     | `minor`      | 軽微   |

## Severity map written with full-width pipes

｜ warning ｜ major ｜
｜ nit ｜ minor ｜

## Gate verdict as a bold label

<!-- markdownlint-disable MD036 -- the emphasis-as-label form is exactly what this fixture pins -->

**GO_WITH_OBSERVATION**

- 条件: minor な finding だけが残る。

<!-- markdownlint-enable MD036 -->

## Gate verdict as a list item

- GO — マージしてよい
  **成立要件**: blocking な finding が 1 件も残っていない。

## Gate verdict written as a table

| 判定  | 条件                                      |
| ----- | ----------------------------------------- |
| NO_GO | blocking な finding が 1 件以上残っている |
