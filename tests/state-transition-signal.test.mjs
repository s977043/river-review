import assert from 'node:assert/strict';
import test from 'node:test';
import { detectStateTransitionSignal } from '../src/lib/state-transition-signal.mjs';

function diffOf(addedLines, path = 'src/lib/sample.mjs') {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,1 +1,${addedLines.length + 1} @@`,
    ' // header',
    ...addedLines.map((l) => `+${l}`),
    '',
  ].join('\n');
}

test('fires on the #2875 recovered-exception shape (catch returns success, resume on missing value)', () => {
  const result = detectStateTransitionSignal(
    diffOf([
      'export async function collect(run) {',
      '  let usage;',
      '  try {',
      '    usage = await fetchUsage(run.id);',
      '  } catch (err) {',
      '    log(err);',
      '    return { ok: true };',
      '  }',
      '  const tokens = usage?.tokens ?? 0;',
      '  if (!usage) return resume(run);',
      "  run.state = 'collected';",
      '  return { ok: true, tokens };',
      '}',
    ])
  );
  assert.equal(result.triggered, true);
  assert.equal(result.categories.swallowedSuccess, 1);
  assert.equal(result.categories.exception, 1);
});

const NEGATIVE_CASES = {
  'HTTP handler returning status objects': [
    'app.get("/a", (req, res) => {',
    '  try {',
    '    res.json({ status: "ok" });',
    '    res.json({ status: "ok" });',
    '    res.json({ status: "ok" });',
    '    res.json({ status: "ok" });',
    '  } catch (err) {',
    '    res.status(500).end();',
    '  }',
    '});',
  ],
  'Promise .catch callbacks with isRetryable': [
    'a().catch(log);',
    'b().catch(log);',
    'c().catch(log);',
    'd().catch(log);',
    'e().catch(log);',
    'if (isRetryable(err)) notify();',
  ],
  'Redux reducer status writes with restartable flag': [
    'reducers: {',
    '  start(s) { s.status = "loading"; },',
    '  done(s) { s.status = "done"; },',
    '  fail(s) { s.status = "failed"; },',
    '  reset(s) { s.status = "idle"; },',
    '  restartable: true,',
    '}',
  ],
  'React setState calls': [
    'setState({ a: 1 });',
    'setState({ a: 2 });',
    'setState({ a: 3 });',
    'setState({ a: 4 });',
    'setState({ a: 5 });',
    'setState({ a: 6 });',
  ],
};

for (const [name, lines] of Object.entries(NEGATIVE_CASES)) {
  test(`does not fire on ${name}`, () => {
    assert.equal(detectStateTransitionSignal(diffOf(lines)).triggered, false);
  });
}

test('ignores Python test files named test_*.py and *_test.py', () => {
  const lines = ['except Exception:', '    retry()', 'job.status = "x"', 'resume(job)'];
  for (const path of ['scripts/test_calibrate.py', 'pkg/calibrate_test.py']) {
    assert.equal(detectStateTransitionSignal(diffOf(lines, path)).signalLines, 0, path);
  }
});

test('counts a success return inside a Python except block, not after it', () => {
  const result = detectStateTransitionSignal(
    diffOf(
      [
        'def collect(run):',
        '    try:',
        '        usage = fetch_usage(run.id)',
        '    except Exception as err:',
        '        log(err)',
        '        return True',
        '    return True',
      ],
      'scripts/calibrate.py'
    )
  );
  assert.equal(result.categories.swallowedSuccess, 1);
  assert.equal(result.categories.exception, 1);
});

test('ignores test files', () => {
  const lines = ['} catch (e) {', '  return { ok: true };', '}', 'job.status = "x";', 'retry();'];
  assert.equal(
    detectStateTransitionSignal(diffOf(lines, 'tests/sample.test.mjs')).triggered,
    false
  );
});
