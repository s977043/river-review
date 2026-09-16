# Test Case: Security Audit open units stay visible without Gate mutation

## Description

`SecurityAuditCoverage` に `planned` / `blocked` / `deferred` が残る repository audit。Security Audit profile は各 unit を残存 coverage risk として可視化するが、coverage state だけから vulnerability や Gate decision を導出してはいけない。

## Invocation

- caller: `river-review-security-audit`
- mode: `full-audit`
- execution policy: `source-only`
- schema validation: pass
- semantic validation: pass
- explicit expected scope: available

## SecurityAuditCoverage

```json
{
  "kind": "SecurityAuditCoverage",
  "schemaVersion": "1",
  "taxonomyVersion": "0.1.0",
  "executionPolicy": "source-only",
  "totalUnits": 4,
  "applicableUnits": 4,
  "coveredUnits": 1,
  "plannedUnits": 1,
  "blockedUnits": 1,
  "deferredUnits": 1,
  "outOfScopeUnits": 0,
  "openUnitIds": ["auth-authz", "agent-tool-boundary", "billing-webhook-replay"],
  "units": [
    {
      "id": "auth-session",
      "subsystem": "auth",
      "trustBoundary": "browser-to-session-service",
      "attackClassId": "authn-authz",
      "state": "covered",
      "reasonCode": null,
      "reviewedPaths": ["src/auth/session.mjs"],
      "evidenceRefs": [
        {
          "kind": "source",
          "path": "src/auth/session.mjs",
          "lineStart": 40,
          "lineEnd": 95,
          "note": "session identity propagation and authorization handling inspected"
        }
      ],
      "relatedFindingIds": [],
      "validationPlan": null,
      "explanation": null
    },
    {
      "id": "auth-authz",
      "subsystem": "auth",
      "trustBoundary": "api-to-authorization-service",
      "attackClassId": "authn-authz",
      "state": "planned",
      "reasonCode": null,
      "reviewedPaths": [],
      "evidenceRefs": [],
      "relatedFindingIds": [],
      "validationPlan": null,
      "explanation": null
    },
    {
      "id": "agent-tool-boundary",
      "subsystem": "agent-runtime",
      "trustBoundary": "model-to-tool-executor",
      "attackClassId": "ai-agent-security",
      "state": "blocked",
      "reasonCode": "unsafe_execution_required",
      "reviewedPaths": ["src/agent/tools.mjs"],
      "evidenceRefs": [],
      "relatedFindingIds": [],
      "validationPlan": "Reproduce only after the sandbox phase provides a no-network bounded executor.",
      "explanation": "Source shows runtime-dependent authorization but cannot prove the target-controlled branch safely."
    },
    {
      "id": "billing-webhook-replay",
      "subsystem": "billing",
      "trustBoundary": "payment-provider-to-webhook-handler",
      "attackClassId": "rpc-messaging",
      "state": "deferred",
      "reasonCode": "budget_deferred",
      "reviewedPaths": ["src/billing/webhook.mjs"],
      "evidenceRefs": [],
      "relatedFindingIds": [],
      "validationPlan": "Follow up in the next security audit run and inspect idempotency persistence plus retry handling.",
      "explanation": "The bounded audit budget expired before the persistence path was traced."
    }
  ]
}
```

## Expected Behavior

1. `auth-authz` is surfaced as an open semantic investigation surface with the missing source evidence identified.
2. `agent-tool-boundary` preserves `unsafe_execution_required` and its safe validation plan. The critic does not execute target code.
3. `billing-webhook-replay` remains visible as deferred residual risk with its follow-up plan.
4. `auth-session` is not treated as unsafe merely because `relatedFindingIds` is empty.
5. The critic does not create a vulnerability finding solely from any open state.
6. The critic does not mutate or recommend a concrete `gate.decision` in the Security Audit profile.
7. The output does not claim the repository is safe or complete.
