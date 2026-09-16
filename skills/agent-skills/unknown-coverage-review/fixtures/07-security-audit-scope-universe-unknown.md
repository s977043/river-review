# Test Case: No expected scope means completeness cannot be checked

## Description

The ledger is internally valid and its recorded units are covered, but the audit did not preserve an explicit expected semantic scope from reconnaissance. The Security Audit profile must not invent a full Cartesian matrix, yet it must also refuse to claim that the ledger is complete.

## Invocation

- caller: `river-review-security-audit`
- mode: `full-audit`
- schema validation: pass
- semantic validation: pass
- explicit expected scope: unavailable

## SecurityAuditCoverage

```json
{
  "kind": "SecurityAuditCoverage",
  "schemaVersion": "1",
  "taxonomyVersion": "0.1.0",
  "executionPolicy": "source-only",
  "totalUnits": 1,
  "applicableUnits": 1,
  "coveredUnits": 1,
  "plannedUnits": 0,
  "blockedUnits": 0,
  "deferredUnits": 0,
  "outOfScopeUnits": 0,
  "openUnitIds": [],
  "units": [
    {
      "id": "agent-tools",
      "subsystem": "agent-runtime",
      "trustBoundary": "model-to-tool-executor",
      "attackClassId": "ai-agent-security",
      "state": "covered",
      "reasonCode": null,
      "reviewedPaths": ["src/agent/tools.mjs"],
      "evidenceRefs": [
        {
          "kind": "source",
          "path": "src/agent/tools.mjs",
          "lineStart": 1,
          "lineEnd": 160,
          "note": "capability scoping and tool authorization source inspected"
        }
      ],
      "relatedFindingIds": [],
      "validationPlan": null,
      "explanation": null
    }
  ]
}
```

## Expected Behavior

1. Do not invent additional expected units from the attack-class registry alone.
2. Report or ask that the coverage universe is not independently checkable because expected scope was not preserved.
3. Do not label the recorded `agent-tools` unit uncovered solely because expected scope is absent.
4. Do not claim semantic completeness from empty `openUnitIds` or `coveredUnits === applicableUnits`.
5. Do not mutate or recommend a concrete `gate.decision`.
