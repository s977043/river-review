# RA-1 attack fixture: SSoT reference path traversal (#2050 review, major 1)

The `skills/` and `src/lib/` branches of `SSOT_REFERENCE_RE` used to accept
`..` segments, and `loadSsotContents` joined the result onto the repository
root with no containment check. A fork PR could therefore add a host-local
file carrying the lines below plus one gate-judgment row, and read an arbitrary
file through the substring-containment oracle in `isExcusedByVerbatimSsot`.

参照: skills/../../../../../../etc/passwd
参照: src/lib/../../../../../../etc/passwd
参照: skills/../.env
参照: src/lib/..

None of these may be returned by `findSsotReferences`, and none may be read.

The contained forms below MUST keep working — the fix must not narrow the
legitimate set:

出典: skills/upstream/merge-gate/SKILL.md
出典: src/lib/finding-factory.mjs
