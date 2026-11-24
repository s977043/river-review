// ADR-017 rollout step 5: the body of accepted QA evidence reaches the skills that read the
// `qaEvidence` input context. The input is built from the audit result, so these tests check
// the value handed to `generateReview` and the prompt section it renders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { buildExecutionPlan } from '../runners/core/review-runner.mjs';
import { planLocalReview, qaEvidenceForReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { auditQaEvidence, qaEvidenceSkillInput } from '../src/lib/qa-evidence.mjs';
import { buildPrompt, generateReview } from '../src/lib/review-engine.mjs';
import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { compileReviewPrompt } from '../src/prompt/compiler.mjs';
import { buildReviewRequest } from '../src/prompt/review-request.mjs';
import { buildQaEvidenceSection } from '../src/prompt/sections.mjs';
import { createRepoWithSilentCatchChange, runGit } from './helpers/temp-repo.mjs';

const BASE = JSON.parse(
  readFileSync(new URL('./fixtures/qa-evidence/base.json', import.meta.url), 'utf8')
);
const QA_SKILL_ID = 'qa-evidence-consistency';
const TOKEN = `ghp_${'A'.repeat(36)}`;
const RESTRICTED_PATHS = ['logs/pass.txt', 'logs/fail.txt', 'logs/control.txt', 'spec/ac-1.txt'];

function evidenceWithSecret(head) {
  const evidence = structuredClone(BASE.evidence);
  evidence.target.subjectRevision = head;
  evidence.verification[0].attempts[0].command = `npm test --token=${TOKEN}`;
  evidence.artifacts.refs[4].sensitivity = 'public';
  return JSON.stringify(evidence);
}

async function auditFor(head, repoRoot) {
  return auditQaEvidence({
    evidence: evidenceWithSecret(head),
    population: null,
    observed: { head, dirty: true, changedFiles: ['src/app.js'] },
    roots: { repository: repoRoot },
  });
}

function stringsOf(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => stringsOf(v, out));
  return out;
}

const idOf = (skill) => (skill.metadata ?? skill).id;

describe('qaEvidenceSkillInput', () => {
  test('holds the redacted copy and the rest of the audit, nothing more', async () => {
    const head = BASE.evidence.target.subjectRevision;
    const audit = await auditFor(head, '/nonexistent-repo');
    assert.equal(audit.accepted, true);
    const input = qaEvidenceSkillInput(audit);
    assert.deepEqual(input.evidence, audit.redaction.evidence);
    const { redaction, ...rest } = audit;
    assert.deepEqual(input.audit, { ...rest, redaction: { replaced: redaction.replaced } });
    assert.equal(input.audit.redaction.replaced, 1);
  });

  test('is null for rejected evidence and for a missing redacted copy', async () => {
    const rejected = await auditQaEvidence({ evidence: '{ not json', population: null });
    assert.equal(rejected.accepted, false);
    assert.equal(qaEvidenceSkillInput(rejected), null);
    for (const audit of [
      null,
      undefined,
      { accepted: true, redaction: null },
      { accepted: false, redaction: { replaced: 0, evidence: {} } },
    ]) {
      assert.equal(qaEvidenceSkillInput(audit), null);
    }
  });
});

describe('the QA evidence handed to the review', () => {
  test('is redacted, holds no restricted path, and reaches the prompt', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const repoRoot = (await runGit(['rev-parse', '--show-toplevel'], dir)).stdout.trim();
    const qaEvidence = qaEvidenceSkillInput(await auditFor(head, repoRoot));

    const context = await planLocalReview({ cwd: dir, phase: 'downstream', qaEvidence });
    assert.ok(context.availableContexts.includes('qaEvidence'));
    // Without an API key the QA skill is skipped as LLM-only, so plan as a keyed run would.
    const plan = await buildExecutionPlan({
      phase: 'downstream',
      changedFiles: context.changedFiles,
      availableContexts: context.availableContexts,
      llmEnabled: true,
    });
    assert.ok(plan.selected.map(idOf).includes(QA_SKILL_ID));
    const planned = { ...context, plan: { ...context.plan, selected: plan.selected } };

    const handed = qaEvidenceForReview(planned);
    assert.equal(handed, qaEvidence);
    const strings = stringsOf(handed);
    assert.ok(strings.some((text) => text.includes('<REDACTED')));
    assert.ok(!strings.some((text) => text.includes(TOKEN)));
    for (const path of RESTRICTED_PATHS) {
      assert.ok(!strings.some((text) => text.includes(path)), path);
    }
    assert.ok(strings.includes('ci/pass.txt'), 'a public path stays');

    const { prompt } = buildPrompt({
      diffText: context.diff.diffText,
      diffFiles: context.diff.filesForReview,
      plan: planned.plan,
      phase: 'downstream',
      qaEvidence: handed,
    });
    assert.ok(prompt.includes(buildQaEvidenceSection(handed)));
    assert.ok(prompt.includes('### QA Evidence'));
    assert.ok(!prompt.includes(TOKEN));

    const result = await runLocalReview({
      cwd: dir,
      phase: 'downstream',
      dryRun: true,
      context: planned,
    });
    assert.match(result.prompt, /### QA Evidence/);
  });

  test('stays out of the prompt when no selected skill reads qaEvidence', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const qaEvidence = qaEvidenceSkillInput(await auditFor(head, dir));
    const context = await planLocalReview({ cwd: dir, phase: 'downstream', qaEvidence });
    assert.ok(!context.plan.selected.map(idOf).includes(QA_SKILL_ID));
    assert.equal(qaEvidenceForReview(context), undefined);
    const result = await runLocalReview({ cwd: dir, phase: 'downstream', dryRun: true, context });
    assert.doesNotMatch(result.prompt, /### QA Evidence/);
  });

  test('a plan without qaEvidence input keeps the context unavailable', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    for (const qaEvidence of [undefined, null]) {
      const context = await planLocalReview({ cwd: dir, phase: 'downstream', qaEvidence });
      assert.ok(!context.availableContexts.includes('qaEvidence'));
      assert.equal(qaEvidenceForReview(context), undefined);
    }
  });
});

describe('the reviewer orchestration path (--reviewers)', () => {
  test('every reviewer call receives qaEvidence', async () => {
    const qaEvidence = { evidence: {}, audit: { accepted: true } };
    const files = [{ path: 'src/a.js', hunks: [{ header: '@@ -1 +1,2 @@', lines: ['+x'] }] }];
    const seen = [];
    await runReviewerOrchestration({
      diff: { files, filesForReview: files, changedFiles: ['src/a.js'], diffText: '' },
      reviewers: ['bug-hunter', 'test-gap'],
      progress: false,
      env: {},
      qaEvidence,
      generateReviewImpl: async (args) => {
        seen.push(args.qaEvidence);
        return { findings: [], comments: [], prompt: 'test' };
      },
    });
    assert.equal(seen.length, 2);
    assert.ok(seen.every((value) => value === qaEvidence));
  });
});

describe('the Prompt Compiler path (ADR-006)', () => {
  const qaEvidence = { evidence: { schemaVersion: '1' }, audit: { accepted: true } };

  test('generateReview hands qaEvidence to the compiled prompt as to the legacy one', async () => {
    const observe = async (extra) =>
      (
        await generateReview({
          diff: { diffText: '', files: [] },
          plan: { selected: [] },
          phase: 'downstream',
          dryRun: true,
          config: { review: { promptCompiler: { mode: 'observe' } } },
          ...extra,
        })
      ).debug.execution.promptCompiler;
    const without = await observe({});
    const withQa = await observe({ qaEvidence });
    assert.notEqual(withQa.legacyPromptHash, without.legacyPromptHash);
    assert.notEqual(withQa.compiledPromptHash, without.compiledPromptHash);
  });

  test('both renderers place the section', () => {
    const ir = buildReviewRequest({
      subject: { phase: 'downstream', changedFiles: [] },
      judgment: { skillIds: [], severity: 'normal', plan: { selected: [] } },
      context: { diff: '', qaEvidence },
      constraints: {},
      outputContract: { language: 'ja' },
      execution: { provider: 'openai', model: 'gpt-4o-mini' },
    });
    for (const rendererId of ['generic', 'openai']) {
      const compiled = compileReviewPrompt(ir, { rendererId });
      assert.ok(
        `${compiled.systemMessage}\n${compiled.prompt}`.includes(
          buildQaEvidenceSection(qaEvidence)
        ),
        rendererId
      );
    }
  });
});

describe('buildQaEvidenceSection', () => {
  test('is empty without input, so prompts without QA evidence are unchanged', () => {
    for (const value of [undefined, null, '', 'text']) {
      assert.equal(buildQaEvidenceSection(value), '');
    }
    const args = { diffText: 'diff', diffFiles: [], plan: { selected: [] }, phase: 'midstream' };
    assert.equal(buildPrompt({ ...args, qaEvidence: null }).prompt, buildPrompt(args).prompt);
  });

  test('truncates a long input with a marker', () => {
    const section = buildQaEvidenceSection({ evidence: { note: 'x'.repeat(9000) } });
    assert.match(section, /\.\.\.\[truncated\]\n```\n$/);
  });
});
