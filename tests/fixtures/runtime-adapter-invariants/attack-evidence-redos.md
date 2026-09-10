# RA-1 attack fixture: finding-evidence catastrophic backtracking (#2050 review, major 2)

The finding-evidence rule used to be one unanchored pattern with three `.*`
lookaheads. On a long line that satisfies the first two ideas and never the
third, the engine retried every split point and the cost grew quadratically:
10KB → 137ms, 40KB → 2068ms, 100KB → 12958ms (Node 22.22.2). `Meta
consistency` has `timeout-minutes: 10`, so a single ~700KB file under
`.claude/**` — reachable from a fork PR, since `test.yml` runs on
`pull_request` — was enough to stall the required check.

The pathological unit is the line below. The test repeats it to 10KB / 40KB /
100KB rather than committing a 100KB fixture; the unit is what must stay
pinned. It carries `finding` and `evidence` but no obligation word, so the
third idea can never be satisfied no matter where the engine splits.

<!-- redos-unit -->

finding evidence

<!-- /redos-unit -->

A matching line (all three ideas present) must still be detected:

finding evidence required
