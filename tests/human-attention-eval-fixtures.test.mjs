import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as yaml from 'js-yaml';

const FIXTURE_PATH = 'docs/eval/human-attention-fixtures.yaml';
const EXPECTED_IDS = Array.from(
  { length: 10 },
  (_, index) => `HA-${String(index + 1).padStart(2, '0')}`
);
const COVERAGE_STATES = new Set(['complete', 'partial', 'not_executed', 'unavailable']);
const MATERIAL_SEVERITIES = new Set(['critical', 'major']);

function loadManifest() {
  return yaml.load(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('#2378 Human Attention fixture oracle', () => {
  it('freezes the ten Phase A fixture ids without duplicates', () => {
    const manifest = loadManifest();
    const ids = manifest.cases.map((entry) => entry.id);

    assert.deepEqual(ids, EXPECTED_IDS);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(manifest.runtime_schema, false);
    assert.equal(manifest.freeze_policy.baseline_is_oracle, false);
  });

  it('keeps Phase A human decision semantics explicitly unavailable', () => {
    const manifest = loadManifest();

    for (const entry of manifest.cases) {
      assert.equal(
        entry.oracle.human_decision_required,
        'unavailable',
        `${entry.id}: Phase A must not invent human-decision semantics`
      );
      assert.equal(
        entry.oracle.human_review_required,
        entry.input.human_review_required,
        `${entry.id}: oracle must preserve the existing human-review signal`
      );
    }
  });

  it('uses only the frozen coverage vocabulary and preserves unavailable coverage', () => {
    const manifest = loadManifest();

    for (const entry of manifest.cases) {
      assert.ok(
        COVERAGE_STATES.has(entry.oracle.coverage_state),
        `${entry.id}: unknown coverage state ${entry.oracle.coverage_state}`
      );
      assert.equal(
        entry.oracle.coverage_state,
        entry.input.review_coverage,
        `${entry.id}: oracle must not reinterpret coverage`
      );
    }

    const legacy = manifest.cases.find((entry) => entry.id === 'HA-10');
    assert.equal(legacy.oracle.coverage_state, 'unavailable');
  });

  it('only promotes critical or major fixture findings into material findings', () => {
    const manifest = loadManifest();

    for (const entry of manifest.cases) {
      const inputFindings = new Map(
        (entry.input.findings ?? []).map((finding) => [finding.id, finding])
      );
      for (const findingId of entry.oracle.material_findings) {
        const finding = inputFindings.get(findingId);
        assert.ok(finding, `${entry.id}: oracle references unknown finding ${findingId}`);
        assert.ok(
          MATERIAL_SEVERITIES.has(finding.severity),
          `${entry.id}: ${findingId} is not critical/major`
        );
      }
      assert.deepEqual(
        entry.oracle.required_actions,
        entry.oracle.material_findings,
        `${entry.id}: Phase A action-required set must match material critical/major findings`
      );
    }
  });

  it('keeps blind spots and evidence locations explicit', () => {
    const manifest = loadManifest();

    for (const entry of manifest.cases) {
      assert.deepEqual(
        entry.oracle.blind_spots,
        entry.input.blind_spots,
        `${entry.id}: blind spots must not disappear in the oracle`
      );
      const hasEvidenceLocations =
        Array.isArray(entry.oracle.evidence_locations) &&
        entry.oracle.evidence_locations.length > 0;
      assert.ok(hasEvidenceLocations, `${entry.id}: at least one evidence location is required`);
    }
  });
});
