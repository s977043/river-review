# Fixture 01 — Reversed dependency direction and unowned boundary (Happy Path)

## Description

An architecture document adds a `Notification` component. Two Checklist items of
this skill fail deterministically from the text alone:

1. **依存方向** — the document states the layering rule `Domain → Infrastructure`
   and then declares `Domain/Order → Infrastructure/Mailer` _and_
   `Infrastructure/Mailer → Domain/Order`, which is a bidirectional dependency
   against the stated rule.
2. **境界と責務** — the new component has no responsibility statement, no
   Non-goals, and no Owner.

The Pre-execution Gate is satisfied: the path is under `docs/architecture/` and
the diff adds boundary/dependency statements.

## Input Diff

```diff
diff --git a/docs/architecture/notification.md b/docs/architecture/notification.md
new file mode 100644
--- /dev/null
+++ b/docs/architecture/notification.md
@@ -0,0 +1,13 @@
+# Notification
+
+> Layering rule (project-wide): Domain → Infrastructure. Never the reverse.
+
+## Components
+
+- `Domain/Order`
+- `Infrastructure/Mailer`
+
+## Dependencies
+
+- `Domain/Order` → `Infrastructure/Mailer` (sends the order-confirmation mail)
+- `Infrastructure/Mailer` → `Domain/Order` (reads the order to build the body)
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), per the Output section.
- A finding on `docs/architecture/notification.md:13`: the second edge reverses
  the layering rule declared on line 3 in the same file and creates a cycle with
  line 12. Severity major. Action: invert the edge behind a Domain-owned port so
  `Infrastructure/Mailer` depends inward only.
- A finding on `:7`–`:8`: neither component states its responsibility, Non-goals,
  or Owner, so the boundary is undefined. Severity major, with a paste-ready
  `責務: ... / Non-goals: ... / Owner: ...` template.
- A finding that the 変更影響 section is absent (affected users/services/data
  are not enumerated). Severity minor.
- At most 8 findings total, per the Rule.
- No findings about Markdown formatting or the component naming style.

<!-- expected:
findings:
  - severity: major
    reason: 同一ファイル 3 行目で宣言した Domain → Infrastructure の依存方向に反する逆流エッジがあり、12/13 行で循環依存になる
    anchor: docs/architecture/notification.md:13
  - severity: major
    reason: 追加コンポーネントに責務・Non-goals・Owner の記述がなく境界が未定義
    anchor: docs/architecture/notification.md:7
  - severity: minor
    reason: 変更影響（利用者/サービス/データ/運用）と互換性の前提が列挙されていない
    anchor: docs/architecture/notification.md:1
-->
