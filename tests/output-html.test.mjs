import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHtmlOutput,
  formatLoopDashboardHtml,
  escHtml,
} from '../src/lib/output-formatters/html.mjs';

const MOCK_RESULT_EMPTY = { findings: [] };

const MOCK_RESULT_FINDINGS = {
  findings: [
    {
      severity: 'critical',
      file: 'src/auth.js',
      lineStart: 42,
      title: 'SQL Injection',
      message: 'Unsanitized input passed to query.',
      suggestion: 'Use parameterized queries.',
    },
    {
      severity: 'major',
      file: 'src/utils.js',
      title: 'Missing null check',
      message: 'Possible NPE on line 10.',
    },
  ],
};

const MOCK_RESULT_XSS = {
  findings: [
    {
      severity: 'info',
      file: '<script>alert("xss")</script>',
      title: '<b>bold</b>',
      message: '<script>alert(1)</script>',
      suggestion: '<img src=x onerror=alert(1)>',
    },
  ],
};

describe('formatHtmlOutput', () => {
  it('produces a string containing <!DOCTYPE html>', () => {
    const html = formatHtmlOutput(MOCK_RESULT_EMPTY, 'midstream');
    assert.ok(typeof html === 'string', 'output should be a string');
    assert.ok(html.includes('<!DOCTYPE html>'), 'output should contain <!DOCTYPE html>');
    assert.ok(html.includes('<html lang="ja">'), 'output should contain <html lang="ja">');
  });

  it('reflects the decision in the HTML banner', () => {
    // With critical finding, verdict should be human-review-required
    const html = formatHtmlOutput(MOCK_RESULT_FINDINGS, 'midstream');
    assert.ok(
      html.includes('Human Review Required'),
      'output should render the "Human Review Required" label text in the banner'
    );
  });

  it('auto-approve decision appears for empty findings', () => {
    const html = formatHtmlOutput(MOCK_RESULT_EMPTY, 'upstream');
    assert.ok(
      html.includes('Auto Approve'),
      'empty findings should render the "Auto Approve" label text in the banner'
    );
  });

  it('honors a canonical decision over the recomputed verdict (#1170 F3)', () => {
    // Empty findings would recompute to auto-approve, but the artifact carries a
    // canonical human-review-required decision (e.g. a plan-review-gate trigger).
    const html = formatHtmlOutput({ findings: [], decision: 'human-review-required' }, 'upstream');
    assert.ok(
      html.includes('Human Review Required'),
      'canonical decision must win over the formatter-local recomputation'
    );
    assert.ok(!html.includes('Auto Approve'), 'recomputed verdict must not leak into the banner');
  });

  it('XSS: finding with <script> in message gets HTML-escaped in output', () => {
    const html = formatHtmlOutput(MOCK_RESULT_XSS, 'midstream');
    assert.ok(
      !html.includes('<script>alert(1)</script>'),
      'raw <script> tag must not appear in output'
    );
    assert.ok(html.includes('&lt;script&gt;'), 'script tag should be HTML-escaped');
    assert.ok(
      !html.includes('<script>alert("xss")</script>'),
      'raw script in file name must not appear'
    );
  });

  it('empty findings array does not crash and renders no-findings message', () => {
    const html = formatHtmlOutput(MOCK_RESULT_EMPTY, 'downstream');
    assert.ok(html.includes('指摘事項なし'), 'should render no-findings message');
  });
});

describe('formatLoopDashboardHtml (#1191)', () => {
  // diff.new / diff.resolved hold ComparedFinding wrappers (finding under
  // .current for new, .previous for resolved) — mirror review-differ output.
  const DIFF_OSCILLATED = {
    new: [
      {
        fingerprint: 'fp-new',
        changeStatus: 'new',
        current: { severity: 'major', file: 'src/a.mjs', title: 'New issue' },
        previous: null,
      },
    ],
    resolved: [
      {
        fingerprint: 'fp-resolved',
        changeStatus: 'resolved',
        current: null,
        previous: { severity: 'minor', file: 'src/b.mjs', title: 'Fixed issue' },
      },
    ],
    persisting: [],
    oscillated: [
      {
        fingerprint: 'rr-mid-perf-n1|src/list.mjs|N+1',
        finding: { file: 'src/list.mjs', title: 'N+1 query', severity: 'major' },
        timeline: [
          { runId: 'run-1', present: true },
          { runId: 'run-2', present: false },
          { runId: 'run-3', present: true },
        ],
      },
    ],
  };

  it('renders a self-contained HTML document', () => {
    const html = formatLoopDashboardHtml(DIFF_OSCILLATED, {
      runIds: ['run-1', 'run-2', 'run-3'],
      suggestedLoopSignal: 'STOP_OSCILLATED',
    });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Loop Dashboard'));
  });

  it('renders the suggestedLoopSignal banner', () => {
    const html = formatLoopDashboardHtml(DIFF_OSCILLATED, {
      runIds: ['run-1', 'run-2', 'run-3'],
      suggestedLoopSignal: 'STOP_OSCILLATED',
    });
    assert.ok(html.includes('STOP_OSCILLATED'), 'signal label present');
  });

  it('renders churn counts and the oscillation timeline', () => {
    const html = formatLoopDashboardHtml(DIFF_OSCILLATED, {
      runIds: ['run-1', 'run-2', 'run-3'],
      suggestedLoopSignal: 'STOP_OSCILLATED',
    });
    assert.ok(html.includes('new 1'));
    assert.ok(html.includes('resolved 1'));
    assert.ok(html.includes('oscillated 1'));
    assert.ok(html.includes('N+1 query'), 'oscillated finding title present');
    assert.ok(html.includes('●') && html.includes('○'), 'present/absent markers');
    // ComparedFinding fields must be unwrapped (.current / .previous), not undefined.
    assert.ok(html.includes('New issue'), 'new finding title (from .current)');
    assert.ok(html.includes('src/a.mjs'), 'new finding file (from .current)');
    assert.ok(html.includes('Fixed issue'), 'resolved finding title (from .previous)');
    assert.ok(html.includes('src/b.mjs'), 'resolved finding file (from .previous)');
  });

  it('handles no oscillation gracefully', () => {
    const html = formatLoopDashboardHtml(
      { new: [], resolved: [], persisting: [], oscillated: [] },
      { runIds: ['a', 'b'], suggestedLoopSignal: 'CONVERGED' }
    );
    assert.ok(html.includes('No oscillating findings detected.'));
    assert.ok(html.includes('CONVERGED'));
  });

  it('escapes XSS in finding fields and run ids', () => {
    const html = formatLoopDashboardHtml(
      {
        new: [
          {
            fingerprint: 'fp',
            changeStatus: 'new',
            current: { severity: 'info', file: '<script>x</script>', title: '<b>t</b>' },
            previous: null,
          },
        ],
        resolved: [],
        persisting: [],
        oscillated: [],
      },
      { runIds: ['<img src=x onerror=alert(1)>'], suggestedLoopSignal: 'NO_SIGNAL' }
    );
    assert.ok(!html.includes('<script>x</script>'), 'raw script must not appear');
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'raw run id must not appear');
    assert.ok(html.includes('&lt;script&gt;'), 'escaped form present');
  });

  it('tolerates a 2-run diff with no oscillated/timeline fields', () => {
    const html = formatLoopDashboardHtml(
      {
        new: [
          {
            fingerprint: 'fp',
            changeStatus: 'new',
            current: { severity: 'major', file: 'x', title: 'y' },
            previous: null,
          },
        ],
        resolved: [],
        persisting: [],
      },
      { runIds: ['r1', 'r2'], suggestedLoopSignal: 'REVISE_REQUIRED' }
    );
    assert.ok(html.includes('REVISE_REQUIRED'));
    assert.ok(html.includes('oscillated 0'));
  });
});

describe('escHtml', () => {
  it('escapes all five special characters', () => {
    assert.equal(escHtml('& < > " \''), '&amp; &lt; &gt; &quot; &#39;');
  });

  it('handles null/undefined gracefully', () => {
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });
});

// #2325: the churn chips are what a reader takes in at a glance. A green
// "resolved N" chip after a run where a required reviewer timed out overstates
// the result, and a warning further down the page does not reach the person
// reading the chip. These tests pin the chip itself, not only the prose.
describe('formatLoopDashboardHtml coverage qualification (#2325)', () => {
  const RESOLVED_ENTRY = {
    fingerprint: 'fp-resolved',
    changeStatus: 'resolved',
    basis: 'absent_from_current_run',
    current: null,
    previous: { severity: 'minor', file: 'src/b.mjs', title: 'Fixed issue' },
  };
  const makeDiff = (coverageStatus, absenceMayBeUnexecuted) => ({
    new: [],
    resolved: [{ ...RESOLVED_ENTRY, coverageStatus }],
    persisting: [],
    oscillated: [],
    summary: {
      newCount: 0,
      resolvedCount: 1,
      persistingCount: 0,
      scoreChangedCount: 0,
      regressionScore: -1,
      resolvedBasis: 'absent_from_current_run',
      currentCoverageStatus: coverageStatus,
      absenceMayBeUnexecuted,
    },
  });

  it('keeps the chip green and unmarked when coverage is complete', () => {
    const html = formatLoopDashboardHtml(makeDiff('complete', false));
    assert.match(html, /background:#2e7d32"[^>]*>resolved 1<\/span>/);
    assert.ok(!html.includes('resolved 1*'));
    assert.ok(html.includes('coverage: complete'));
    assert.ok(!html.includes('<p class="meta">* <strong>resolved</strong>'));
  });

  it('degrades the chip and names the coverage when the run was partial', () => {
    const html = formatLoopDashboardHtml(makeDiff('partial', true));
    // Colour: no longer the green "verified win" chip.
    assert.doesNotMatch(html, /background:#2e7d32"[^>]*>resolved 1/);
    assert.ok(html.includes('background:#ef6c00'));
    // Text: the asterisk survives copy-paste and screen readers.
    assert.ok(html.includes('resolved 1*</span>'));
    // Words: a neighbouring chip names the coverage status.
    assert.ok(html.includes('coverage: partial'));
    // And the footnote explaining the asterisk sits with the chips.
    const chipIndex = html.indexOf('resolved 1*');
    const footnoteIndex = html.indexOf('<p class="meta">* <strong>resolved</strong>');
    assert.ok(footnoteIndex > chipIndex);
    assert.ok(footnoteIndex - chipIndex < 400);
  });

  it('degrades the chip when coverage is unknown', () => {
    const html = formatLoopDashboardHtml(makeDiff('unknown', true));
    assert.ok(html.includes('resolved 1*</span>'));
    assert.ok(html.includes('coverage: unknown'));
  });

  it('leaves a diff with no resolved entries alone', () => {
    const diff = makeDiff('partial', true);
    diff.resolved = [];
    diff.summary.resolvedCount = 0;
    const html = formatLoopDashboardHtml(diff);
    assert.match(html, /background:#2e7d32"[^>]*>resolved 0<\/span>/);
    assert.ok(!html.includes('resolved 0*'));
    // The coverage chip still reports the run, since it is true of the run.
    assert.ok(html.includes('coverage: partial'));
  });
});
