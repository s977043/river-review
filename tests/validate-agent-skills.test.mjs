import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  AGENT_SKILL_CONTEXT_WARN_BYTES,
  AGENT_SKILL_CONTEXT_WARN_LINES,
  assessAgentSkillContextHealth,
  parseExemptions,
} from '../scripts/validate-agent-skills.mjs';
import { parseFrontMatter, defaultPaths } from '../runners/core/skill-loader.mjs';
import { expandApplyTo, analyzeCoverage } from '../scripts/lib/applyto-coverage.mjs';

const repoRoot = defaultPaths.repoRoot;

async function readApplyTo(relSkillDir) {
  const file = path.join(repoRoot, relSkillDir, 'SKILL.md');
  const { metadata } = parseFrontMatter(await readFile(file, 'utf8'));
  return metadata ?? {};
}

// --- parseExemptions ---------------------------------------------------------

test('parseExemptions accepts a well-formed array', () => {
  const { valid, errors } = parseExemptions([{ skill: 'a-b', reason: 'because' }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(valid, [{ skill: 'a-b', reason: 'because' }]);
});

test('parseExemptions returns empty for null/undefined', () => {
  assert.deepEqual(parseExemptions(undefined), { valid: [], errors: [] });
  assert.deepEqual(parseExemptions(null), { valid: [], errors: [] });
});

test('parseExemptions rejects a non-array', () => {
  const { valid, errors } = parseExemptions('modern-web-performance');
  assert.equal(valid.length, 0);
  assert.equal(errors.length, 1);
});

test('parseExemptions requires non-empty skill and reason', () => {
  const { valid, errors } = parseExemptions([
    { skill: '', reason: 'x' },
    { skill: 'a-b', reason: '  ' },
    { reason: 'no skill' },
    'not-an-object',
  ]);
  assert.equal(valid.length, 0);
  assert.equal(errors.length, 4);
});

// --- Context health advisory (#2483) -----------------------------------------

test('context health measures UTF-8 bytes instead of character count', () => {
  const health = assessAgentSkillContextHealth('あ');
  assert.equal(health.bytes, 3);
  assert.equal(health.lines, 1);
  assert.equal(health.shouldWarn, false);
});

test('context health byte budget warns only after the advisory threshold', () => {
  const atBudget = assessAgentSkillContextHealth('a'.repeat(AGENT_SKILL_CONTEXT_WARN_BYTES));
  const overBudget = assessAgentSkillContextHealth('a'.repeat(AGENT_SKILL_CONTEXT_WARN_BYTES + 1));

  assert.equal(atBudget.exceedsBytes, false);
  assert.equal(atBudget.shouldWarn, false);
  assert.equal(overBudget.exceedsBytes, true);
  assert.equal(overBudget.shouldWarn, true);
});

test('context health line budget warns only after the advisory threshold', () => {
  const atBudget = assessAgentSkillContextHealth(
    Array.from({ length: AGENT_SKILL_CONTEXT_WARN_LINES }, () => 'x').join('\n')
  );
  const overBudget = assessAgentSkillContextHealth(
    Array.from({ length: AGENT_SKILL_CONTEXT_WARN_LINES + 1 }, () => 'x').join('\n')
  );

  assert.equal(atBudget.lines, AGENT_SKILL_CONTEXT_WARN_LINES);
  assert.equal(atBudget.exceedsLines, false);
  assert.equal(overBudget.lines, AGENT_SKILL_CONTEXT_WARN_LINES + 1);
  assert.equal(overBudget.exceedsLines, true);
  assert.equal(overBudget.shouldWarn, true);
});

// --- Canary: reference-only exemption (issue #1508) --------------------------

test('canary: river-review-frontend exempts the reference-only modern-web-performance route', async () => {
  const meta = await readApplyTo('skills/agent-skills/river-review-frontend');
  const { valid } = parseExemptions(meta.applyToExemptions);
  const exempt = valid.find((e) => e.skill === 'modern-web-performance');
  assert.ok(exempt, 'modern-web-performance must be declared in applyToExemptions');
  assert.ok(exempt.reason.trim().length > 0, 'exemption must carry a reason');
});

test('canary: modern-web-performance would otherwise be reachable (a warning, never an error)', async () => {
  const frontend = await readApplyTo('skills/agent-skills/river-review-frontend');
  const target = await readApplyTo('skills/midstream/modern-web-performance');
  const r = analyzeCoverage(expandApplyTo(frontend.applyTo), expandApplyTo(target.applyTo));
  // Reachable ⇒ the check never treats the reference-only row as a hard error;
  // the exemption is what silences the residual (non-blocking) warning.
  assert.equal(r.reachable, true);
});

// --- Canary: src/** limited to {tsx,jsx,vue,svelte} is not an error ----------

test('canary: frontend keeping src/** to {tsx,jsx,vue,svelte} does not make a11y unreachable', async () => {
  const frontend = await readApplyTo('skills/agent-skills/river-review-frontend');
  const target = await readApplyTo('skills/midstream/a11y-accessible-name');
  const r = analyzeCoverage(expandApplyTo(frontend.applyTo), expandApplyTo(target.applyTo));
  // #1500 disposition intentionally did not widen src/** to .ts/.js; the routed
  // skill must still be reachable (via routes/app/components), i.e. not an error.
  assert.equal(r.reachable, true);
});

// --- Integration: the real repository scan is clean --------------------------

test('integration: agent-skills validator exits 0 on the real repository', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-agent-skills.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
