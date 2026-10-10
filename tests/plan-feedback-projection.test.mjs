import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatHtmlOutput } from '../src/lib/output-formatters/html.mjs';
import { loadPlanFeedbackProjection } from '../src/lib/plan-feedback-projection.mjs';

function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function fixture(test) {
  const folder = mkdtempSync(path.join(tmpdir(), 'river-plan-feedback-'));
  test.after(() => rmSync(folder, { recursive: true, force: true }));
  const plan = path.join(folder, 'plan.md');
  const questions = path.join(folder, 'review-questions.json');
  const feedbackPath = path.join(folder, 'TASK-0001-review-feedback.json');
  writeFileSync(plan, '# Task plan\n');
  writeFileSync(
    questions,
    JSON.stringify({
      version: 1,
      questions: [
        {
          id: 'Q1',
          prompt: '<script>alert(1)</script> rollout?',
          choices: ['Canary', 'Feature flag'],
          artifactRefs: ['plan.md#rollout', '<img src=x onerror=alert(1)>'],
        },
        { id: 'Q2', prompt: 'How long can the review be deferred?' },
      ],
    })
  );
  const body = {
    schemaVersion: 1,
    kind: 'plan-review-feedback',
    taskId: 'TASK-0001',
    source: {
      plan: { path: 'plan.md', sha256: digest(plan) },
      questions: { path: 'review-questions.json', sha256: digest(questions) },
    },
    feedback_only: true,
    approval_granted: false,
    generatedAt: '2026-10-09T00:00:00.000Z',
    answers: [
      { questionId: 'Q1', status: 'answered', response: 'Canary', note: 'Keep QA' },
      { questionId: 'Q2', status: 'deferred', response: '', note: 'Need evidence' },
    ],
  };
  const save = () => writeFileSync(feedbackPath, JSON.stringify(body));
  const load = () =>
    loadPlanFeedbackProjection({ workDir: folder, feedbackPath, taskId: 'TASK-0001' });
  save();
  return { folder, plan, questions, feedbackPath, body, save, load };
}

describe('PlanGate source-matched review feedback projection (#2601)', () => {
  it('renders a separate question section without changing the canonical verdict or findings', (t) => {
    const fixtureData = fixture(t);
    const projection = fixtureData.load();
    assert.equal(projection.approvalGranted, false);
    assert.equal(projection.items[0].status, 'answered');
    assert.equal(projection.items[1].status, 'deferred');
    const review = {
      decision: 'human-review-required',
      findings: [{ severity: 'major', title: 'Blocking finding', message: 'Needs attention' }],
      timestamp: '2026-10-09T00:00:00.000Z',
    };
    const baseline = formatHtmlOutput(review, 'midstream');
    const html = formatHtmlOutput(review, 'midstream', { planFeedback: projection });
    assert.ok(html.includes('Human Review Required'));
    assert.ok(html.includes('Blocking finding'));
    assert.ok(html.includes('DEFERRED'));
    assert.ok(html.includes('Need evidence'));
    assert.ok(html.includes('Keep QA'));
    assert.ok(html.includes('plan.md#rollout'));
    assert.ok(html.includes('Source-matched feedback'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(!html.includes('Auto Approve'));
    assert.ok(!baseline.includes('Planning questions (review-only)'));
    assert.equal(formatHtmlOutput(review, 'midstream', {}), baseline);
  });

  it('keeps unanswered questions explicit without changing review findings or verdict', (t) => {
    const f = fixture(t);
    f.body.answers[1] = { questionId: 'Q2', status: 'unanswered', response: '', note: '' };
    f.save();
    const projection = f.load();
    const review = {
      decision: 'human-review-required',
      findings: [{ severity: 'major', title: 'Unsafe rollout', message: 'Needs review' }],
      timestamp: '2026-10-09T00:00:00.000Z',
    };
    const original = formatHtmlOutput(review, 'upstream');
    const withFeedback = formatHtmlOutput(review, 'upstream', { planFeedback: projection });
    assert.match(withFeedback, /UNANSWERED/);
    assert.match(withFeedback, /Unsafe rollout/);
    assert.match(withFeedback, /Human Review Required/);
    assert.doesNotMatch(original, /UNANSWERED/);
    assert.equal(formatHtmlOutput(review, 'upstream', {}), original);
    assert.equal(projection.approvalGranted, false);
  });

  it('fails closed when the referenced review JSON is missing', (t) => {
    const f = fixture(t);
    rmSync(f.feedbackPath);
    assert.throws(f.load, /ENOENT/);
  });

  it('rejects arbitrary caller objects that claim to be validated', () => {
    assert.throws(
      () =>
        formatHtmlOutput({ findings: [] }, 'upstream', {
          planFeedback: { kind: 'SOURCE_MATCHED_REVIEW_FEEDBACK', validated: true },
        }),
      /source-matched/
    );
  });

  it('rejects a forged clone of an authentic source-matched model', (t) => {
    const f = fixture(t);
    const projection = f.load();
    const clone = { ...projection };
    assert.throws(
      () => formatHtmlOutput({ findings: [] }, 'upstream', { planFeedback: clone }),
      /source-matched/
    );
  });

  it('rejects stale plan bytes and stale questions bytes', (t) => {
    const f = fixture(t);
    writeFileSync(f.plan, '# changed\n');
    assert.throws(f.load, /STALE/);
    writeFileSync(f.plan, '# Task plan\n');
    const updated = JSON.parse(readFileSync(f.questions, 'utf8'));
    updated.questions[0].prompt = 'Changed question';
    writeFileSync(f.questions, JSON.stringify(updated));
    assert.throws(f.load, /STALE/);
  });

  it('rejects forged approval, wrong task and incompatible response states', (t) => {
    const f = fixture(t);
    f.body.approval_granted = true;
    f.save();
    assert.throws(f.load, /unsupported or authoritative/);
    f.body.approval_granted = false;
    f.body.taskId = 'TASK-0002';
    f.save();
    assert.throws(f.load, /unsupported or authoritative/);
    f.body.taskId = 'TASK-0001';
    f.body.answers[1].status = 'approved';
    f.save();
    assert.throws(f.load, /invalid answer/);
    f.body.answers[1].status = 'deferred';
    f.body.answers[1].note = '';
    f.save();
    assert.throws(f.load, /invalid deferred/);
  });

  it('rejects duplicate answer IDs, unknown choices and unknown questions', (t) => {
    const f = fixture(t);
    f.body.answers[1].questionId = 'Q1';
    f.save();
    assert.throws(f.load, /invalid answer/);
    f.body.answers[1].questionId = 'Q2';
    f.body.answers[0].response = 'Delete production';
    f.save();
    assert.throws(f.load, /invalid answered/);
    f.body.answers[0].response = 'Canary';
    f.body.answers[0].questionId = 'unknown';
    f.save();
    assert.throws(f.load, /invalid answer/);
  });

  it('rejects duplicate nested JSON properties, even escaped equivalents', (t) => {
    const f = fixture(t);
    const raw = JSON.stringify(f.body);
    writeFileSync(
      f.feedbackPath,
      raw.replace('"approval_granted":false', '"approval_granted":false,"approval_granted":false')
    );
    assert.throws(f.load, /duplicate JSON property/);
    writeFileSync(
      f.feedbackPath,
      raw.replace(
        '"approval_granted":false',
        '"approval_granted":false,"approval_\\u0067ranted":false'
      )
    );
    assert.throws(f.load, /duplicate JSON property/);
  });

  it('rejects symlinked feedback and symlinked source files', (t) => {
    const f = fixture(t);
    const saved = path.join(f.folder, 'saved.json');
    try {
      writeFileSync(saved, readFileSync(f.feedbackPath));
      rmSync(f.feedbackPath);
      symlinkSync(saved, f.feedbackPath);
    } catch {
      t.skip('symlinks unavailable');
      return;
    }
    assert.throws(f.load, /symlinked/);
  });
});
