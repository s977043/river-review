# Fixture 01 — ADR with no alternatives, success criteria, or follow-ups (Happy Path)

## Description

A new ADR records a datastore switch. Three of the four Checklist groups fail
deterministically from the text alone:

- **Decision** — the decision line is present but there is no success/acceptance
  condition, so nobody can tell later whether it worked.
- **Alternatives & Tradeoffs** — zero alternatives, zero rejection reasons, and
  no statement about compatibility with the existing data.
- **Follow-ups** — no open items, no owner, no deadline, no links.

The Pre-execution Gate is satisfied: the path is under `docs/adr/` and the diff
adds substantive Decision content.

## Input Diff

```diff
diff --git a/docs/adr/0055-session-store.md b/docs/adr/0055-session-store.md
new file mode 100644
--- /dev/null
+++ b/docs/adr/0055-session-store.md
@@ -0,0 +1,11 @@
+# ADR-0055: Move the session store to Redis
+
+Status: Accepted
+
+## Context
+
+Sessions are currently in PostgreSQL and the login path is slow.
+
+## Decision
+
+We will store sessions in Redis.
```

## Expected Behavior

- A summary line first (`(summary):1: ...`) naming what was decided and what is
  still open.
- A finding on `docs/adr/0055-session-store.md:11`: no success/acceptance
  condition is stated, so "slow login" has no measurable target. Severity major,
  with the `成功条件: <可観測な条件>` template as the action.
- A finding that the Alternatives & Tradeoffs section is missing entirely: no
  alternative, no rejection reason, no tradeoff. Severity major, with the
  `代替案: A=..., B=... / 却下理由=... / トレードオフ=...` template.
- A finding that existing-data compatibility and the cutover of live sessions
  are unaddressed — this is the migration/compat class the Rule tells the skill
  to prioritise. Severity major.
- A finding that Follow-ups (open items, owner, deadline, links) are absent.
  Severity minor.
- Optionally a question about session durability expectations under a Redis
  restart, per the "不明点は質問で出す" rule.
- At most 8 findings, per the Rule. No findings about the ADR file naming or
  Markdown style.

<!-- expected:
findings:
  - severity: major
    reason: 決定に対する成功条件・受け入れ条件が書かれておらず、後から成否を判定できない
    anchor: docs/adr/0055-session-store.md:11
  - severity: major
    reason: 代替案・却下理由・トレードオフが 1 件も記載されていない
    anchor: docs/adr/0055-session-store.md:9
  - severity: major
    reason: 既存 PostgreSQL セッションとの互換性および稼働中セッションの切り替え方針が未記載
    anchor: docs/adr/0055-session-store.md:11
  - severity: minor
    reason: Follow-ups（未決事項・決める人・期限・関連ドキュメントへのリンク）が存在しない
    anchor: docs/adr/0055-session-store.md:1
-->
