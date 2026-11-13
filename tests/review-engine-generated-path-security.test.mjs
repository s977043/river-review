import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { generateReview } from '../src/lib/review-engine.mjs';

// #2913: the #1597 generated-path filter must not drop a leaked token or a
// conflict marker in dist/, while other dist/ findings stay suppressed.

const loggingPlan = {
  selected: [
    {
      metadata: {
        id: 'logging-observability',
        name: 'Logging Observability',
        phase: 'midstream',
        applyTo: ['**/*'],
      },
    },
  ],
  skipped: [],
};

const token = `ghp_${'a1B2c3D4e5'.repeat(3)}abcdef`;

function fileEntry(path, line, text) {
  return { path, hunks: [{ newStart: line, lines: [`+${text}`] }], addedLines: [line] };
}

async function review(files) {
  return generateReview({
    diff: { diffText: 'diff placeholder', files, changedFiles: files.map((f) => f.path) },
    plan: loggingPlan,
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
  });
}

describe('generated-path filter keeps security detector findings (#2913)', () => {
  test('explicit token in dist/ reaches findings as a blocker', async () => {
    const result = await review([
      fileEntry('dist/x.js', 1, `const t = "${token}";`),
      fileEntry('a.txt', 1, 'hello'),
    ]);
    const hit = result.findings.find((f) => f.file === 'dist/x.js');
    assert.ok(hit, 'token finding on dist/x.js must reach findings');
    assert.equal(hit.ruleId, 'security-basic');
    assert.equal(hit.severity, 'critical');
    assert.ok(result.comments.some((c) => c.file === 'dist/x.js'));
  });

  test('merge-conflict marker in dist/ reaches findings', async () => {
    const result = await review([
      fileEntry('dist/y.js', 3, '<<<<<<< HEAD'),
      fileEntry('a.txt', 1, 'hello'),
    ]);
    const hit = result.findings.find((f) => f.file === 'dist/y.js');
    assert.ok(hit, 'conflict marker finding on dist/y.js must reach findings');
    assert.equal(hit.ruleId, 'logging-observability');
  });

  test('a non-security finding of the same skill in dist/ stays suppressed', async () => {
    const result = await review([
      fileEntry('dist/z.js', 5, '  } catch (e) {}'),
      fileEntry('src/service.mjs', 5, '  } catch (e) {}'),
    ]);
    assert.ok(result.findings.some((f) => f.file === 'src/service.mjs'));
    assert.ok(!result.findings.some((f) => f.file === 'dist/z.js'));
    assert.equal(result.debug.suppressedGeneratedPathFindings, 1);
  });
});
