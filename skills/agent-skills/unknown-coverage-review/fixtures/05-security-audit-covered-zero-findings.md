# Test Case: Covered with zero findings is not a safety verdict

## Description

A focused source-only audit has one recorded semantic unit. The unit is `covered`, carries relevant source evidence, and has no related findings. The Security Audit profile must accept the coverage state while refusing to turn zero findings or empty `openUnitIds` into a safety/completeness claim.

## Invocation

- caller: `river-review-security-audit`
- mode: `focused`
- scope: `src/auth/**`
- schema validation: pass
- semantic validation: pass
- explicit expected scope: exactly the single semantic unit below

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
      "id": "authz-focused",
      "subsystem": "auth",
      "trustBoundary": "api-to-authorization-service",
      "attackClassId": "authn-authz",
      "state": "covered",
      "reasonCode": null,
      "reviewedPaths": ["src/auth/authorize.mjs"],
      "evidenceRefs": [
        {
          "kind": "source",
          "path": "src/auth/authorize.mjs",
          "lineStart": 20,
          "lineEnd": 88,
          "note": "default-deny decision and object-level ownership checks inspected"
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

1. Do not report a coverage gap solely because `relatedFindingIds` is empty.
2. Recognize that the evidence is responsive to the `authn-authz` hypothesis for the named trust boundary.
3. Do not say `safe`, `secure`, `no vulnerabilities`, `complete`, or equivalent language.
4. Do not infer safety from `coveredUnits === applicableUnits` or empty `openUnitIds`.
5. Do not mutate or recommend a concrete `gate.decision`.
