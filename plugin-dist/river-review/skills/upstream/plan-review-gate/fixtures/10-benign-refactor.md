# Plan: Module tree cleanup (source-only refactor)

should_not_trigger canary（#1356）: ソースコードのリファクタリング記述が
recursive-cleanup の HIGH パターンに誤爆しない（= 非対称契約で降格不能な
恒久ブロックにならない）こと。除外なしの LOW 双子（defense-in-depth）が
候補として拾うのは意図どおりで、良性判断は LLM adjudicator に委ねる。

## Tasks

1. The module tree was recursively refactored and cleaned up for readability
2. Rename helper functions to match the naming convention
3. No filesystem, database, or environment changes are involved

<!-- expected:
humanApproval:
  regexOnly: not-required
  triggersInclude:
    - recursive-cleanup-lowconf
-->
