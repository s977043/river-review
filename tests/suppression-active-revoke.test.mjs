// #2425: applySuppressions on the production review path must skip a
// suppression with `context.active === false` and one revoked by a
// `resurface` entry, while an entry without an `active` field keeps working.
//
// The wiring tests go through runLocalReview (planLocalReview + dryRun) so the
// whole chain is exercised: .river/memory/index.json → loadReviewMemory
// (phase filter, revokedSuppressionIds) → applySuppressions.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';

import { createSuppression, revokeSuppression } from '../src/lib/suppression.mjs';
import { loadReviewMemory } from '../src/lib/memory-context.mjs';
import { applySuppressions } from '../src/lib/suppression-apply.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { createRepoWithSilentCatchChange } from './helpers/temp-repo.mjs';

describe('runLocalReview skips inactive and revoked suppressions (#2425)', () => {
  let dir;
  let cleanup;
  let target;
  let indexPath;

  async function reviewOnce() {
    writeFileSync(path.join(dir, '.river-review.json'), JSON.stringify({}));
    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');
    return runLocalReview({ cwd: dir, context, dryRun: true, quiet: true });
  }

  // Fresh index holding one suppression issued the way `river suppression add`
  // does; `edit` may mutate the written entry before the review runs.
  function issue(edit) {
    mkdirSync(path.dirname(indexPath), { recursive: true });
    writeFileSync(indexPath, JSON.stringify({ version: '1', entries: [] }));
    const entry = createSuppression({
      indexPath,
      fingerprint: target.fingerprint,
      feedbackType: 'accepted_risk',
      filePaths: [target.file],
      rationale: 'active/revoke wiring',
    });
    if (edit) {
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      edit(index.entries[0]);
      writeFileSync(indexPath, JSON.stringify(index));
    }
    return entry;
  }

  const isSuppressed = (r) =>
    r.suppressedFindings.some((f) => f.fingerprint === target.fingerprint);

  before(async () => {
    ({ dir, cleanup } = await createRepoWithSilentCatchChange({ prefix: 'river-2425-' }));
    indexPath = path.join(dir, '.river', 'memory', 'index.json');
    const first = await reviewOnce();
    target = first.findings[0];
    assert.ok(target, 'dry-run must yield a finding for this diff');
  });
  after(() => cleanup?.());

  test('control: a suppression as issued (active: true, no phase) suppresses', async () => {
    issue();
    assert.ok(isSuppressed(await reviewOnce()));
  });

  test('context.active === false does not suppress', async () => {
    issue((e) => {
      e.context.active = false;
    });
    const r = await reviewOnce();
    assert.equal(isSuppressed(r), false);
    assert.ok(r.findings.some((f) => f.fingerprint === target.fingerprint));
  });

  test('a suppression revoked by revokeSuppression does not suppress', async () => {
    const s = issue();
    revokeSuppression(indexPath, s.id);
    const r = await reviewOnce();
    assert.equal(isSuppressed(r), false);
    assert.ok(r.findings.some((f) => f.fingerprint === target.fingerprint));
  });

  test('negative control: an entry without an active field keeps suppressing', async () => {
    issue((e) => {
      delete e.context.active;
    });
    assert.ok(isSuppressed(await reviewOnce()));
  });
});

describe('loadReviewMemory.revokedSuppressionIds (#2425)', () => {
  test('collects revocations from the whole index despite the phase filter, as a JSON-safe array', async () => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange({ prefix: 'river-2425-mem-' });
    try {
      const indexPath = path.join(dir, '.river', 'memory', 'index.json');
      mkdirSync(path.dirname(indexPath), { recursive: true });
      const s = createSuppression({
        indexPath,
        fingerprint: '0123456789abcdef',
        feedbackType: 'accepted_risk',
        filePaths: ['a.js'],
        rationale: 'x',
      });
      revokeSuppression(indexPath, s.id);
      const ctx = loadReviewMemory(dir, { phase: 'midstream', changedFiles: ['b.js'] });
      assert.equal(
        ctx.entries.some((e) => e.type === 'resurface'),
        false,
        'the resurface entry itself is filtered out by phase'
      );
      assert.deepEqual(ctx.revokedSuppressionIds, [s.id]);
      assert.deepEqual(JSON.parse(JSON.stringify(ctx)).revokedSuppressionIds, [s.id]);
    } finally {
      await cleanup();
    }
  });
});

describe('applySuppressions turned-off entries (#2425)', () => {
  const fp = 'aaaaaaaaaaaaaaaa';
  const finding = { fingerprint: fp, severity: 'minor', file: 'a.js' };
  const entry = (id, context = {}) => ({
    id,
    type: 'suppression',
    context: { fingerprint: fp, feedbackType: 'false_positive', active: true, ...context },
  });

  test('a revoked or inactive entry does not shadow an in-force entry with the same fingerprint', () => {
    const live = entry('live');
    for (const memoryContext of [
      { suppressions: [live, entry('off', { active: false })] },
      { suppressions: [live, entry('gone')], revokedSuppressionIds: ['gone'] },
    ]) {
      const r = applySuppressions([finding], memoryContext, { warn: () => {} });
      assert.equal(r.suppressedFindings.length, 1);
      assert.equal(r.suppressedFindings[0].suppressionRef, 'live');
    }
  });

  test('a memoryContext without revokedSuppressionIds behaves as before', () => {
    const r = applySuppressions([finding], { suppressions: [entry('s')] }, { warn: () => {} });
    assert.equal(r.suppressedFindings.length, 1);
  });
});
