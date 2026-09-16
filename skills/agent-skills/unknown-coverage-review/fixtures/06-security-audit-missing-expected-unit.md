# Test Case: Explicit expected scope reveals a missing semantic unit

## Description

The recorded ledger is internally valid, but reconnaissance explicitly planned two semantic units and only one appears in the ledger. This is the class of omission that Phase 3 self-consistency validation cannot detect by itself.

## Invocation

- caller: `river-review-security-audit`
- mode: `focused`
- schema validation: pass
- semantic validation: pass

## Explicit expected scope from reconnaissance

```text
payments × payment-provider-to-webhook-handler × rpc-messaging
payments × api-to-payment-service × authn-authz
```

## Recorded SecurityAuditCoverage

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
      "id": "payment-webhook",
      "subsystem": "payments",
      "trustBoundary": "payment-provider-to-webhook-handler",
      "attackClassId": "rpc-messaging",
      "state": "covered",
      "reasonCode": null,
      "reviewedPaths": ["src/payments/webhook.mjs"],
      "evidenceRefs": [
        {
          "kind": "source",
          "path": "src/payments/webhook.mjs",
          "lineStart": 10,
          "lineEnd": 120,
          "note": "signature, replay, and idempotency paths inspected"
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

1. Surface `payments × api-to-payment-service × authn-authz` as an unexplained expected-scope omission.
2. Ask for the missing unit to be recorded as `planned`, `covered`, `blocked`, `deferred`, or `out_of_scope` with the normal Phase 3 contract.
3. Do not fabricate evidence or classify the missing unit as a vulnerability.
4. Do not treat the empty `openUnitIds` array as proof of complete semantic coverage.
5. Do not mutate or recommend a concrete `gate.decision`.
