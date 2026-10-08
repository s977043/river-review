import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateReview } from '../src/lib/review-engine.mjs';

test('generateReview propagates host cancellation instead of falling back', async () => {
  const controller = new AbortController();
  const reason = new Error('review task cancelled');
  controller.abort(reason);

  await assert.rejects(
    () =>
      generateReview({
        diff: {
          diffText: 'diff --git a/src/foo.mjs b/src/foo.mjs\n+const value = 1;',
          files: [],
          filesForReview: [],
        },
        phase: 'midstream',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        signal: controller.signal,
      }),
    (err) => err === reason
  );
});
