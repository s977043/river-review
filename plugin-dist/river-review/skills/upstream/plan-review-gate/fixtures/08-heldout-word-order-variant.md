# Plan: Storage maintenance automation

Held-out 変種 canary（#1356）: 既存 fixture と語順・語彙を変えた英語の婉曲表現。
挿入語スパン（{0,4}）と動詞活用（empties）への汎化を守る。

## Tasks

1. Add a nightly job that recursively and then completely wipes the scratch directory
2. The retention step empties the staging bucket after each export
3. Publish the job summary to the dashboard

<!-- expected:
humanApproval:
  regexOnly: required
  triggersInclude:
    - recursive-cleanup-euphemism
    - empty-storage-euphemism
-->
