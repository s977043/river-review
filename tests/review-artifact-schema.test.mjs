import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { GATE_DECISIONS, GATE_REASON_CODES } from '../src/lib/gate-decision.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';

const validate = compileReviewArtifactValidator();
const schema = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../schemas/review-artifact.schema.json', import.meta.url)),
    'utf8'
  )
);

function minimalArtifact(overrides = {}) {
  return {
    version: '1',
    timestamp: '2025-01-01T00:00:00Z',
    phase: 'midstream',
    status: 'ok',
    ...overrides,
  };
}

function validFinding(overrides = {}) {
  return {
    id: 'f-1',
    ruleId: 'rule-1',
    title: 'Title',
    message: 'A detailed message',
    severity: 'major',
    phase: 'midstream',
    file: 'src/foo.mjs',
    ...overrides,
  };
}

describe('review-artifact.schema.json', () => {
  test('accepts a minimal valid artifact', () => {
    const ok = validate(minimalArtifact());
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  test('accepts a full artifact with plan, findings, and context', () => {
    const artifact = minimalArtifact({
      plan: {
        selectedSkills: [
          { id: 's1', name: 'skill one', phase: 'midstream', modelHint: 'balanced' },
        ],
        skippedSkills: [{ id: 's2', reasons: ['phase mismatch'] }],
        plannerMode: 'prune',
        plannerReasons: [{ id: 's1', reason: 'high signal' }],
        impactTags: ['security'],
      },
      findings: [validFinding()],
      context: {
        repoRoot: '/repo',
        defaultBranch: 'main',
        mergeBase: 'abc123',
        changedFiles: ['src/foo.mjs'],
        tokenEstimate: 100,
        rawTokenEstimate: 150,
        reduction: 33,
      },
      debug: { any: 'value' },
    });
    const ok = validate(artifact);
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  test('rejects version other than "1"', () => {
    const ok = validate(minimalArtifact({ version: '2' }));
    assert.equal(ok, false);
  });

  test('rejects missing required top-level fields', () => {
    const { version, ...rest } = minimalArtifact();
    assert.equal(validate(rest), false);
  });

  test('rejects unknown top-level properties (additionalProperties: false)', () => {
    const ok = validate(minimalArtifact({ extra: true }));
    assert.equal(ok, false);
  });

  test('rejects finding missing required fields (findings.items enforces issue shape)', () => {
    const bad = validFinding();
    delete bad.severity;
    const ok = validate(minimalArtifact({ findings: [bad] }));
    assert.equal(ok, false);
  });

  test('rejects finding with invalid severity enum', () => {
    const ok = validate(minimalArtifact({ findings: [validFinding({ severity: 'blocker' })] }));
    assert.equal(ok, false);
  });

  test('rejects modelHint outside ModelHintEnum', () => {
    const ok = validate(
      minimalArtifact({
        plan: {
          selectedSkills: [{ id: 's1', name: 'n', modelHint: 'fast' }],
        },
      })
    );
    assert.equal(ok, false);
  });

  test('accepts valid modelHint values', () => {
    for (const hint of ['cheap', 'balanced', 'high-accuracy']) {
      const ok = validate(
        minimalArtifact({
          plan: { selectedSkills: [{ id: 's1', name: 'n', modelHint: hint }] },
        })
      );
      assert.equal(ok, true, `${hint} should be valid: ${JSON.stringify(validate.errors)}`);
    }
  });

  test('rejects plannerReasons item missing id or reason', () => {
    const ok = validate(minimalArtifact({ plan: { plannerReasons: [{ id: 's1' }] } }));
    assert.equal(ok, false);
  });

  test('rejects reduction outside 0..100', () => {
    assert.equal(validate(minimalArtifact({ context: { reduction: -1 } })), false);
    assert.equal(validate(minimalArtifact({ context: { reduction: 101 } })), false);
  });

  test('rejects negative rawTokenEstimate / tokenEstimate', () => {
    assert.equal(validate(minimalArtifact({ context: { rawTokenEstimate: -1 } })), false);
    assert.equal(validate(minimalArtifact({ context: { tokenEstimate: -1 } })), false);
  });

  test('accepts context with rawTokenEstimate (emitted by local-runner)', () => {
    const ok = validate(
      minimalArtifact({
        context: { tokenEstimate: 80, rawTokenEstimate: 120, reduction: 33 },
      })
    );
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  describe('traceability refs (#1666 / #1545 Phase 2 — additive)', () => {
    test('finding without criterionRefs / artifactRefs stays valid (backward compat)', () => {
      const ok = validate(minimalArtifact({ findings: [validFinding()] }));
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('accepts criterion and artifact ref arrays', () => {
      const ok = validate(
        minimalArtifact({
          findings: [
            validFinding({
              criterionRefs: ['AC-4', 'TC-7'],
              artifactRefs: ['plan.md#AC-4', 'todo.md#TASK-3'],
            }),
          ],
        })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('rejects a non-array or empty-string ref value', () => {
      assert.equal(
        validate(minimalArtifact({ findings: [validFinding({ criterionRefs: 'AC-4' })] })),
        false
      );
      assert.equal(
        validate(minimalArtifact({ findings: [validFinding({ artifactRefs: [''] })] })),
        false
      );
    });
  });

  describe('synthesis fields (#911 Phase 2 — additive)', () => {
    test('finding without sourceKind / agreement / validatedStatus stays valid (backward compat)', () => {
      const ok = validate(minimalArtifact({ findings: [validFinding()] }));
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('accepts finding with sourceKind enum values', () => {
      for (const kind of ['ai-review', 'human-review', 'self-review']) {
        const ok = validate(minimalArtifact({ findings: [validFinding({ sourceKind: kind })] }));
        assert.equal(ok, true, `${kind}: ${JSON.stringify(validate.errors)}`);
      }
    });

    test('rejects unknown sourceKind', () => {
      const ok = validate(
        minimalArtifact({ findings: [validFinding({ sourceKind: 'pinned-by-claude' })] })
      );
      assert.equal(ok, false);
    });

    test('accepts agreement array of reviewer ids', () => {
      const ok = validate(
        minimalArtifact({
          findings: [
            validFinding({ agreement: ['review-self', 'review-external', 'findings-pool#42'] }),
          ],
        })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('rejects agreement with duplicate reviewer names', () => {
      const ok = validate(
        minimalArtifact({
          findings: [validFinding({ agreement: ['a', 'a'] })],
        })
      );
      assert.equal(ok, false);
    });

    test('accepts validatedStatus enum values', () => {
      for (const v of [
        'confirmed',
        'dismissed-hallucination',
        'dismissed-duplicate',
        'needs-human-judgment',
      ]) {
        const ok = validate(minimalArtifact({ findings: [validFinding({ validatedStatus: v })] }));
        assert.equal(ok, true, `${v}: ${JSON.stringify(validate.errors)}`);
      }
    });

    test('rejects unknown validatedStatus', () => {
      const ok = validate(
        minimalArtifact({ findings: [validFinding({ validatedStatus: 'maybe' })] })
      );
      assert.equal(ok, false);
    });
  });

  describe('debug.execution.snapshot (#878 A2-3-pre — additive carry-over)', () => {
    test('artifact without debug.execution.snapshot stays valid (backward compat)', () => {
      const ok = validate(minimalArtifact());
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('round-trips fileTypes / relatedADRs / reviewMode / riskAssessment', () => {
      const ok = validate(
        minimalArtifact({
          debug: {
            execution: {
              snapshot: {
                fileTypes: ['typescript', 'react'],
                relatedADRs: ['adr-007-auth-boundary'],
                reviewMode: 'standard',
                riskAssessment: { action: 'require_human_review', reason: 'auth code' },
              },
            },
          },
        })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('accepts partial snapshot (any subset of fields)', () => {
      const ok = validate(
        minimalArtifact({ debug: { execution: { snapshot: { reviewMode: 'lite' } } } })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('accepts unrelated debug.* keys alongside execution (additionalProperties)', () => {
      const ok = validate(
        minimalArtifact({
          debug: {
            execution: { snapshot: { fileTypes: ['md'] } },
            resolvedArtifacts: { diff: path.join(os.tmpdir(), 'diff.patch') },
            replay: { sourceTimestamp: '2026-05-25T03:48:53Z' },
          },
        })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });
  });

  describe('decision / usage / trace (#1045 A1 — additive)', () => {
    test('accepts an artifact with decision, usage, and trace', () => {
      const ok = validate(
        minimalArtifact({
          decision: 'human-review-recommended',
          usage: {
            provider: 'openai',
            model: 'gpt-5.5',
            input_tokens: 1200,
            output_tokens: 300,
            estimated_cost_usd: 0.02,
          },
          trace: { run_id: '2026-01-01T00-00-00-000Z-abc123' },
        })
      );
      assert.equal(ok, true, JSON.stringify(validate.errors));
    });

    test('accepts each of the three decision enum values', () => {
      for (const decision of [
        'auto-approve',
        'human-review-recommended',
        'human-review-required',
      ]) {
        assert.equal(validate(minimalArtifact({ decision })), true, decision);
      }
    });

    test('rejects an unknown decision value', () => {
      assert.equal(validate(minimalArtifact({ decision: 'pass' })), false);
    });

    test('rejects unknown properties inside usage / trace', () => {
      assert.equal(validate(minimalArtifact({ usage: { foo: 1 } })), false);
      assert.equal(validate(minimalArtifact({ trace: { foo: 'x' } })), false);
    });

    test('older artifacts without the new fields stay valid (additive)', () => {
      assert.equal(validate(minimalArtifact()), true);
    });
  });
});

describe('gate vocabulary is pinned to the production ledger, not copied from it', () => {
  // WHY THIS EXISTS. `schemas/flow.schema.json` has carried this exact pin since
  // #2013 (tests/flow-schema.test.mjs:157), which is why adding a reason code
  // forces that file to be updated. THIS schema had no such pin, and it drifted
  // in silence: `STRICT_BLOCK` (#1351) and `DETERMINISTIC_UNRUNNABLE` (#1401)
  // were emitted by production for two epics while the enum here still rejected
  // them, so an artifact carrying either would have failed its own validation.
  // Restoring the data without restoring the mechanism would just queue the
  // same drift for the next reason code (CLAUDE.md "Check what the previous
  // change pinned"), so the pin is what actually closes it.
  const gate = schema.properties.gate.properties;

  test('gate.reasonCode enum matches GATE_REASON_CODES exactly', () => {
    assert.deepEqual(gate.reasonCode.enum, [...GATE_REASON_CODES]);
  });

  test('gate.decision enum matches GATE_DECISIONS exactly', () => {
    assert.deepEqual(gate.decision.enum, [...GATE_DECISIONS]);
  });

  test('every production reason code validates inside a real gate block', () => {
    // The enum comparison above is a shape check; this one proves the artifact
    // an emitter actually produces is accepted for each code.
    for (const reasonCode of GATE_REASON_CODES) {
      const artifact = minimalArtifact({
        gate: {
          decision: 'NO_GO',
          reasonCode,
          tier: 'field',
          inputs: {},
          inputsHash: '0123456789abcdef',
          schemaVersion: '1',
        },
      });
      assert.equal(validate(artifact), true, `${reasonCode}: ${JSON.stringify(validate.errors)}`);
    }
  });
});
