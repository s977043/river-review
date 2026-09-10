# Review gate (RA-1 negative fixture: gate / completion / evidence)

Negative fixture for RA-1: this file defines conditions for River Review's
product gate verdicts, a completion condition, and a finding evidence
requirement — three of the four forbidden classes in ADR-009 D3-2.

The verdicts below come from `GATE_DECISIONS` (`src/lib/gate-decision.mjs`).
Verdicts of a repository work procedure (`MERGE_OK` and the like) are a
different namespace and are out of scope by decision (#2050).

## 判定

### A. GO

条件: blocking な finding が 1 件も残っていない。

対応: マージへ進む。

### B. NO_GO

条件: blocking な finding が 1 件以上残る。

対応: 阻害要因を全件列挙する。

## 完了条件

条件: 上記の判定が GO であり、フォローアップ Issue が起票済みである。

## 証跡

- finding には file:line の証跡を必ず添える。
- 指摘には file:line の証跡を必ず添える。
