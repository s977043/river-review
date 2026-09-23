import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_FIXTURE_PATH,
  assertPairedScope,
  assertSameLockfile,
  isAllowedPresentationPath,
  parseArgs,
} from '../scripts/evaluate-human-attention.mjs';

describe('#2382 Human Attention paired runner guards', () => {
  it('parses the frozen comparison inputs and keeps the canonical fixture default', () => {
    assert.deepStrictEqual(
      parseArgs([
        '--baseline',
        'base',
        '--candidate',
        'candidate',
        '--output',
        'artifacts/evals/human-attention/test-run',
      ]),
      {
        baseline: 'base',
        candidate: 'candidate',
        fixtures: CANONICAL_FIXTURE_PATH,
        output: 'artifacts/evals/human-attention/test-run',
      }
    );
  });

  it('rejects missing or unknown CLI arguments', () => {
    assert.throws(() => parseArgs(['--baseline', 'base']), /--baseline and --candidate/);
    assert.throws(
      () =>
        parseArgs([
          '--baseline',
          'base',
          '--candidate',
          'candidate',
          '--output',
          'out',
          '--mystery',
          'x',
        ]),
      /unknown argument/
    );
  });

  it('allows only the frozen presentation scope', () => {
    for (const file of [
      'docs/adr/012-human-attention-architecture.md',
      'src/cli/render.mjs',
      'tests/render-markdown-digest.test.mjs',
      'runners/github-action/dist/index.mjs',
      'runners/github-action/dist/index.mjs.map',
    ]) {
      assert.strictEqual(isAllowedPresentationPath(file), true, file);
    }

    for (const file of [
      'src/lib/review-engine.mjs',
      'schemas/output.schema.json',
      'package.json',
      'docs/development/2378-human-attention-evaluation-contract.md',
      'docs/reference/unrelated.md',
    ]) {
      assert.strictEqual(isAllowedPresentationPath(file), false, file);
    }
  });

  it('fails closed when commits are equal, unrelated, or contain non-presentation changes', () => {
    assert.throws(
      () =>
        assertPairedScope({
          baseline: 'same',
          candidate: 'same',
          changedFiles: [],
          isAncestor: true,
        }),
      /must be different/
    );

    assert.throws(
      () =>
        assertPairedScope({
          baseline: 'base',
          candidate: 'candidate',
          changedFiles: ['src/cli/render.mjs'],
          isAncestor: false,
        }),
      /INCONCLUSIVE_SCOPE/
    );

    assert.throws(
      () =>
        assertPairedScope({
          baseline: 'base',
          candidate: 'candidate',
          changedFiles: ['src/cli/render.mjs', 'src/lib/review-engine.mjs'],
          isAncestor: true,
        }),
      /unexpected changed files/
    );
  });

  it('accepts the actual #2369 presentation-only scope', () => {
    assert.doesNotThrow(() =>
      assertPairedScope({
        baseline: '53e7a9e',
        candidate: '3a03f90',
        isAncestor: true,
        changedFiles: [
          'docs/adr/012-human-attention-architecture.md',
          'runners/github-action/dist/index.mjs',
          'runners/github-action/dist/index.mjs.map',
          'src/cli/render.mjs',
          'tests/render-markdown-digest.test.mjs',
        ],
      })
    );
  });

  it('fails closed when condition lockfiles differ', () => {
    assert.doesNotThrow(() => assertSameLockfile('same', 'same'));
    assert.throws(() => assertSameLockfile('baseline', 'candidate'), /INCONCLUSIVE_ENVIRONMENT/);
  });
});
