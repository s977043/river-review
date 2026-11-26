// ADR-017 rollout step 5: the body of accepted QA evidence reaches the skills that read the
// `qaEvidence` input context. The input is built from the audit result, so these tests check
// the value handed to `generateReview` and the prompt section it renders.
import assert from 'node:assert/strict';
import fs, { appendFileSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { buildExecutionPlan } from '../runners/core/review-runner.mjs';
import { main } from '../src/cli.mjs';
import { qaEvidenceRedactor, qaSkillFindingsForAudit } from '../src/cli/commands/run.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { planLocalReview, qaEvidenceForReview, runLocalReview } from '../src/lib/local-runner.mjs';
import {
  auditQaEvidence,
  qaEvidencePublicPaths,
  qaEvidenceSkillInput,
} from '../src/lib/qa-evidence.mjs';
import { buildPrompt, generateReview, parseLineComments } from '../src/lib/review-engine.mjs';
import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { compileReviewPrompt } from '../src/prompt/compiler.mjs';
import { buildReviewRequest } from '../src/prompt/review-request.mjs';
import { MAX_QA_EVIDENCE_CHARS, buildQaEvidenceSection } from '../src/prompt/sections.mjs';
import { runCliAsSubprocess } from './helpers/cli.mjs';
import { cleanupTempDirAsync, createTempDir } from './helpers/temp-dir.mjs';
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

// CI の pull_request 実行では PR 本文がプロンプトに入るため、本文に
// `### QA Evidence` があると「QA セクションが無い」ことを確かめるテストが落ちる。
const PR_BODY_ENV_KEYS = ['RIVER_PR_BODY', 'GITHUB_EVENT_PATH'];
let savedPrBodyEnv;
beforeEach(() => {
  savedPrBodyEnv = Object.fromEntries(PR_BODY_ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of PR_BODY_ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedPrBodyEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

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

describe('the QA-EVIDENCE finding anchor', () => {
  const skillText = readFileSync(
    new URL('../skills/downstream/qa-evidence-consistency/SKILL.md', import.meta.url),
    'utf8'
  );
  const section = buildQaEvidenceSection({ evidence: {}, audit: {} });
  const anchors = (text) => [...text.matchAll(/QA-EVIDENCE:[^\s`'"）、。]+/g)].map((m) => m[0]);

  test('the SKILL.md and the prompt write AC anchors in the same <id>:0 form', () => {
    assert.ok(skillText.includes('`QA-EVIDENCE:<AC id>:0`'));
    assert.ok(section.includes('`QA-EVIDENCE:<AC id>:0`'));
    for (const text of [skillText, section]) {
      assert.ok(text.includes('`QA-EVIDENCE:0`'));
      // Every concrete AC anchor carries the :0 line slot the parser needs.
      for (const anchor of anchors(text).filter((a) => /^QA-EVIDENCE:AC-/.test(a))) {
        assert.match(anchor, /^QA-EVIDENCE:AC-\d+:0$/, anchor);
      }
    }
  });

  test('parses into a QA-EVIDENCE file with no line, and the bare form is not parsed', () => {
    const message = 'Finding: x Evidence: status differs Fix: rebuild the record Severity: nit';
    assert.deepEqual(
      parseLineComments(`QA-EVIDENCE:AC-2:0: ${message}`)?.map(({ file, line }) => ({
        file,
        line,
      })),
      [{ file: 'QA-EVIDENCE:AC-2', line: 0 }]
    );
    assert.deepEqual(
      parseLineComments(`QA-EVIDENCE:0: ${message}`)?.map(({ file, line }) => ({ file, line })),
      [{ file: 'QA-EVIDENCE', line: 0 }]
    );
    assert.equal(parseLineComments(`QA-EVIDENCE:AC-2: ${message}`), null);
  });
});

describe('QA-EVIDENCE findings through generateReview (verifier and separation)', () => {
  const APP_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const b = 2;
`;
  // The first selected skill is the one the verifier checks severity against; a critical one
  // lets a blocker through, so a QA finding keeps the severity it was given.
  const PLAN = {
    selected: [{ metadata: { id: 'any-critical', phase: 'downstream', severity: 'critical' } }],
    skipped: [],
  };
  const qaEvidence = {
    evidence: {
      artifacts: {
        refs: [
          { id: 'ci-pass', root: 'artifacts', path: 'ci/pass.txt', sensitivity: 'public' },
          { id: 'log-fail', root: 'repository' },
        ],
      },
    },
    audit: {},
  };
  // Each finding names its anchor and evidence, so no two lines read as duplicates.
  const line = (anchor, evidence) =>
    `${anchor}: Finding: ${anchor} cites ${evidence} Evidence: ${evidence} shows the run ` +
    'Impact: the AC record cannot be trusted Fix: rebuild the evidence record from the run ' +
    'Severity: blocker Confidence: high';
  let originalFetch;
  let originalOffline;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalOffline = process.env.RIVER_OFFLINE;
    delete process.env.RIVER_OFFLINE;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.RIVER_OFFLINE;
    else process.env.RIVER_OFFLINE = originalOffline;
  });

  async function review(llmOutput, extra = {}) {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: llmOutput } }] }),
      text: async () => '',
    });
    return generateReview({
      diff: { ...parseUnifiedDiff(APP_DIFF), diffText: APP_DIFF },
      plan: PLAN,
      phase: 'downstream',
      apiKey: 'test-key-not-a-real-credential',
      includeFallback: false,
      ...extra,
    });
  }
  const rejectedFiles = (result) =>
    [...result.debug.verifierRejected, ...(result.debug.qaEvidenceVerifierRejected ?? [])].map(
      (r) => r.file
    );

  test('a QA finding may cite a public path of the evidence handed to the review', async () => {
    const result = await review(
      [
        line('QA-EVIDENCE:AC-1:0', 'ci/pass.txt'),
        line('QA-EVIDENCE:AC-2:0', 'logs/fail.txt'),
        line('src/app.ts:2', 'ci/pass.txt'),
        line('src/app.ts:2', 'src/app.ts'),
      ].join('\n'),
      { qaEvidence }
    );
    // The QA finding leaves the review findings and comments for qaEvidenceFindings.
    assert.deepEqual(
      result.findings.map((f) => `${f.file}:${f.severity}`),
      ['src/app.ts:critical']
    );
    assert.deepEqual(
      result.comments.map((c) => c.file),
      ['src/app.ts']
    );
    assert.deepEqual(
      result.qaEvidenceFindings.map((f) => `${f.file}:${f.severity}`),
      ['QA-EVIDENCE:AC-1:critical']
    );
    assert.deepEqual(rejectedFiles(result).sort(), ['QA-EVIDENCE:AC-2', 'src/app.ts']);
  });

  test('without QA evidence the same QA finding is checked against the diff only', async () => {
    const result = await review(line('QA-EVIDENCE:AC-1:0', 'ci/pass.txt'));
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.qaEvidenceFindings, []);
    assert.deepEqual(rejectedFiles(result), ['QA-EVIDENCE:AC-1']);
  });

  test('the orchestration path collects QA findings apart from the review findings', async () => {
    const qaFinding = { file: 'QA-EVIDENCE:AC-1', lineStart: 0, title: 'x', severity: 'major' };
    const files = [{ path: 'src/a.js', hunks: [{ header: '@@ -1 +1,2 @@', lines: ['+x'] }] }];
    const result = await runReviewerOrchestration({
      diff: { files, filesForReview: files, changedFiles: ['src/a.js'], diffText: '' },
      reviewers: ['bug-hunter', 'test-gap'],
      progress: false,
      env: {},
      generateReviewImpl: async () => ({
        findings: [],
        comments: [],
        qaEvidenceFindings: [qaFinding],
        prompt: 'test',
      }),
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.qaEvidenceFindings.length, 1);
    assert.equal(result.qaEvidenceFindings[0].file, 'QA-EVIDENCE:AC-1');
  });

  test('qaEvidencePublicPaths takes public paths only', () => {
    assert.deepEqual(
      qaEvidencePublicPaths({
        evidence: {
          artifacts: {
            refs: [
              { path: 'ci/pass.txt', sensitivity: 'public' },
              { path: 'logs/x.txt', sensitivity: 'restricted' },
              { path: 'logs/y.txt' },
              { sensitivity: 'public' },
            ],
          },
        },
      }),
      ['ci/pass.txt']
    );
    for (const input of [undefined, null, {}, { evidence: { artifacts: {} } }]) {
      assert.deepEqual(qaEvidencePublicPaths(input), []);
    }
  });
});

describe('river run --qa-evidence with a reviewer that reaches the LLM', () => {
  const token = `ghp_${'B'.repeat(36)}`;
  const saved = {};
  beforeEach(() => {
    saved.fetch = globalThis.fetch;
    saved.key = process.env.OPENAI_API_KEY;
    saved.offline = process.env.RIVER_OFFLINE;
    saved.log = console.log;
    saved.error = console.error;
    saved.warn = console.warn;
    delete process.env.RIVER_OFFLINE;
    process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.key;
    if (saved.offline === undefined) delete process.env.RIVER_OFFLINE;
    else process.env.RIVER_OFFLINE = saved.offline;
    console.log = saved.log;
    console.error = saved.error;
    console.warn = saved.warn;
  });

  const appLine =
    'src/app.js:1: Finding: the change swallows an error Evidence: src/app.js keeps the catch ' +
    'Impact: failures are hidden Fix: rethrow the error with context Severity: nit Confidence: high';
  const qaLine =
    `QA-EVIDENCE:AC-1:0: Finding: AC-1 cites ${token} Evidence: ci/pass.txt shows the run ` +
    'Impact: the record cannot be trusted Fix: rebuild the evidence record from the run ' +
    'Severity: nit Confidence: high';

  async function runWith(
    t,
    llmOutput,
    {
      qa = true,
      phase = 'downstream',
      evidence = null,
      onFetch = () => {},
      prepare = () => {},
      failRequest = () => false,
      args = [],
    } = {}
  ) {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    prepare(dir);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const work = createTempDir({ prefix: 'river-qa-llm-' });
    t.after(() => cleanupTempDirAsync(work));
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidence ?? evidenceWithSecret(head));
    // Every message the review sends to the LLM, as one text per request.
    const requests = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body ?? '{}');
      const text = (body.messages ?? []).map((m) => m.content).join('\n');
      requests.push(text);
      onFetch({ auditPath });
      if (failRequest(text)) throw new Error('provider unavailable');
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: llmOutput } }] }),
        text: async () => '',
      };
    };
    const out = [];
    console.log = (...args) => out.push(args.join(' '));
    console.error = () => {};
    console.warn = () => {};
    const qaArgs = qa ? ['--qa-evidence', evidencePath, '--qa-audit-output', auditPath] : [];
    const code = await main(['run', dir, '--phase', phase, '--output', 'json', ...qaArgs, ...args]);
    console.log = saved.log;
    const artifact = out.length > 0 ? JSON.parse(out.join('\n')) : null;
    return { code, artifact, auditPath, work, requests };
  }

  test('a reply of QA findings only reviews the diff as NO_ISSUES does', async (t) => {
    // A conflict marker, which an always-on detector reports, so NO_ISSUES has a heuristic issue.
    const prepare = (dir) =>
      appendFileSync(join(dir, 'src/app.js'), '<<<<<<< HEAD\n=======\n>>>>>>> other\n');
    const noIssues = await runWith(t, 'NO_ISSUES', { prepare });
    const qaOnly = await runWith(t, qaLine, { prepare });
    assert.ok(noIssues.artifact.issues.length > 0, 'the heuristic review runs on NO_ISSUES');
    assert.equal(qaOnly.code, noIssues.code);
    assert.deepEqual(qaOnly.artifact, noIssues.artifact);
    const audit = JSON.parse(readFileSync(qaOnly.auditPath, 'utf8'));
    assert.equal(audit.skillFindings.length, 1);
  });

  // The fallback warning a review emits without usable findings must not name the QA skill.
  const withoutExecutionIds = (value) =>
    JSON.parse(JSON.stringify(value, (key, v) => (key === 'sourceExecutionIds' ? undefined : v)));
  const reviewers = ['--reviewers', 'bug-hunter,security-scanner'];
  for (const [name, llmOutput, options] of [
    ['a single reviewer answering NO_ISSUES', 'NO_ISSUES', {}],
    [
      'a single reviewer whose LLM calls all fail',
      `${appLine}\n${qaLine}`,
      { failRequest: () => true },
    ],
    ['--reviewers roles all answering NO_ISSUES', 'NO_ISSUES', { args: reviewers }],
    [
      'one failing --reviewers role',
      `${appLine}\n${qaLine}`,
      {
        args: reviewers,
        failRequest: (text) => text.includes('You are the Security Scanner reviewer'),
      },
    ],
  ]) {
    test(`the fallback issues are the same with and without QA evidence: ${name}`, async (t) => {
      const view = (run) =>
        withoutExecutionIds({
          code: run.code,
          issues: run.artifact.issues,
          decision: run.artifact.decision,
          gate: run.artifact.gate,
        });
      const plain = await runWith(t, llmOutput, { ...options, qa: false });
      const withQa = await runWith(t, llmOutput, options);
      assert.ok(
        plain.artifact.issues.some((issue) => /自動指摘を生成できなかった/.test(issue.title)),
        'the fallback warning'
      );
      assert.deepEqual(view(withQa), view(plain));
    });
  }

  test('the LLM request carries the redacted evidence and its audit result', async (t) => {
    const run = await runWith(t, appLine);
    assert.equal(run.code, 0);
    const sent = run.requests.join('\n');
    assert.match(sent, /### QA Evidence/);
    assert.match(sent, /#### 監査結果/);
    assert.ok(sent.includes('"accepted": true'), 'the audit result');
    const controlRevision = BASE.evidence.verification[0].controls[0].revision;
    assert.ok(sent.includes(controlRevision), 'a value only the evidence holds');
    assert.ok(sent.includes('ci/pass.txt'), 'a public path of the evidence');
    assert.ok(sent.includes('npm test --token=<REDACTED'), 'the redacted command');
    assert.ok(!sent.includes(TOKEN), 'the secret');
    for (const restricted of RESTRICTED_PATHS) {
      assert.ok(!sent.includes(restricted), restricted);
    }
  });

  test('no QA section reaches the LLM without accepted evidence a selected skill reads', async (t) => {
    const runs = {
      'no --qa-evidence': await runWith(t, appLine, { qa: false }),
      'rejected evidence': await runWith(t, appLine, { evidence: '{ not json' }),
      'QA skill not selected': await runWith(t, appLine, { phase: 'midstream' }),
    };
    for (const [name, run] of Object.entries(runs)) {
      assert.equal(run.code, 0, name);
      assert.ok(run.requests.length > 0, `${name}: the LLM was called`);
      assert.doesNotMatch(run.requests.join('\n'), /### QA Evidence/, name);
    }
  });

  const shortWrite = (real, fd, buffer, offset, length, position) => {
    if (typeof buffer === 'string') {
      const bytes = Buffer.from(buffer);
      const at = typeof offset === 'number' ? offset : null;
      return real(fd, bytes, 0, Math.min(16, bytes.length), at);
    }
    return real(fd, buffer, offset, Math.min(16, length), position);
  };
  const faults = {
    'short writes': (real, call, ...args) => shortWrite(real, ...args),
    'an error after a partial write': (real, call, ...args) => {
      if (call === 1) return shortWrite(real, ...args);
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    },
    'a write that writes nothing': () => 0,
  };

  // Fault `writeSync` for the writes whose content holds `marker`; the CLI's named import follows.
  function faultWrites(t, marker, fault) {
    const real = fs.writeSync;
    let calls = 0;
    fs.writeSync = (fd, buffer, ...rest) => {
      const text = typeof buffer === 'string' ? buffer : Buffer.from(buffer).toString('utf8');
      if (!text.includes(marker)) return real(fd, buffer, ...rest);
      calls += 1;
      return fault(real, calls, fd, buffer, ...rest);
    };
    syncBuiltinESMExports();
    t.after(() => {
      fs.writeSync = real;
      syncBuiltinESMExports();
    });
  }
  const filesIn = (dir) => readdirSync(dir).sort();

  for (const [name, fault] of Object.entries(faults)) {
    test(`the first audit write under ${name} publishes the whole file or nothing`, async (t) => {
      faultWrites(t, '"accepted"', fault);
      const run = await runWith(t, `${appLine}\n${qaLine}`);
      if (name === 'short writes') {
        assert.equal(run.code, 0);
        assert.equal(JSON.parse(readFileSync(run.auditPath, 'utf8')).skillFindings.length, 1);
        assert.deepEqual(filesIn(run.work), ['audit.json', 'evidence.json']);
      } else {
        assert.equal(run.code, 1);
        assert.deepEqual(filesIn(run.work), ['evidence.json']);
      }
    });

    test(`the skill findings update under ${name} keeps a whole audit file`, async (t) => {
      faultWrites(t, '"skillFindings"', fault);
      const run = await runWith(t, `${appLine}\n${qaLine}`);
      const audit = JSON.parse(readFileSync(run.auditPath, 'utf8'));
      assert.equal(audit.accepted, true);
      assert.deepEqual(filesIn(run.work), ['audit.json', 'evidence.json']);
      if (name === 'short writes') {
        assert.equal(run.code, 0);
        assert.equal(audit.skillFindings.length, 1);
      } else {
        assert.equal(run.code, 1);
        assert.equal('skillFindings' in audit, false, 'the audit written before the review');
      }
    });
  }

  test('the update refuses a path swapped after the audit was written', async (t) => {
    const run = await runWith(t, `${appLine}\n${qaLine}`, {
      onFetch: ({ auditPath }) => {
        renameSync(auditPath, `${auditPath}.moved`);
        writeFileSync(auditPath, 'someone else\n');
      },
    });
    assert.equal(run.code, 1);
    assert.equal(readFileSync(run.auditPath, 'utf8'), 'someone else\n');
    assert.deepEqual(filesIn(run.work), ['audit.json', 'audit.json.moved', 'evidence.json']);
  });

  test('QA findings leave the issues, the score and the gate unchanged', async (t) => {
    const without = await runWith(t, appLine);
    const withQa = await runWith(t, `${appLine}\n${qaLine}`);
    assert.equal(withQa.code, without.code);
    assert.deepEqual(withQa.artifact, without.artifact);
    assert.deepEqual(
      withQa.artifact.issues.map((issue) => issue.file),
      ['src/app.js']
    );
    const plain = await runWith(t, `${appLine}\n${qaLine}`, { qa: false });
    assert.equal(plain.code, without.code);
    assert.deepEqual(plain.artifact.decision, without.artifact.decision);
  });

  // The selected QA skill declares severity minor; it must not cap the review's own findings.
  for (const [severity, expected] of [
    ['nit', 'minor'],
    ['warning', 'major'],
    ['blocker', 'critical'],
  ]) {
    test(`a ${severity} review finding is judged the same with and without QA evidence`, async (t) => {
      const line = appLine.replace('Severity: nit', `Severity: ${severity}`);
      const plain = await runWith(t, line, { qa: false });
      const withQa = await runWith(t, line);
      const view = (run) => ({
        code: run.code,
        issues: run.artifact.issues,
        decision: run.artifact.decision,
        gate: run.artifact.gate,
      });
      assert.deepEqual(
        plain.artifact.issues.map((issue) => issue.severity),
        [expected]
      );
      assert.deepEqual(view(withQa), view(plain));
    });
  }

  test('the audit result carries the redacted skill findings', async (t) => {
    const run = await runWith(t, `${appLine}\n${qaLine}`);
    assert.equal(run.code, 0);
    const text = readFileSync(run.auditPath, 'utf8');
    const audit = JSON.parse(text);
    assert.equal(audit.accepted, true);
    assert.equal(audit.skillFindings.length, 1);
    const [finding] = audit.skillFindings;
    assert.equal(finding.target, 'AC-1');
    assert.equal(finding.severity, 'minor');
    assert.ok(!text.includes(token), 'skill findings are redacted');
    assert.match(finding.message, /REDACTED/);
  });

  test('no skillFindings field when no selected skill read the evidence', async (t) => {
    const run = await runWith(t, `${appLine}\n${qaLine}`, { phase: 'midstream' });
    assert.equal(run.code, 0);
    const audit = JSON.parse(readFileSync(run.auditPath, 'utf8'));
    assert.equal(audit.accepted, true);
    assert.equal('skillFindings' in audit, false);
  });

  // A key the planner accepts but the OpenAI reviewer cannot use: the QA skill is selected and
  // the LLM call is skipped, so no skill read the evidence.
  test('no skillFindings field when the selected QA skill never reached the LLM', async (t) => {
    delete process.env.OPENAI_API_KEY;
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key-not-a-real-credential';
    t.after(() => {
      if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = savedAnthropic;
    });
    const run = await runWith(t, `${appLine}\n${qaLine}`);
    assert.equal(run.artifact.llmNotExecuted, true);
    const audit = JSON.parse(readFileSync(run.auditPath, 'utf8'));
    assert.equal(audit.accepted, true);
    assert.equal('skillFindings' in audit, false);
  });

  // A provider failure is not a skip (llmNotExecuted stays false), so it must not read as a
  // completed read that found nothing (`skillFindings: []`).
  test('no skillFindings field when the LLM call fails', async (t) => {
    const run = await runWith(t, `${appLine}\n${qaLine}`, { failRequest: () => true });
    assert.equal(run.code, 0);
    assert.ok(
      run.requests.some((text) => text.includes('### QA Evidence')),
      'the QA call'
    );
    assert.notEqual(run.artifact.llmNotExecuted, true);
    const audit = JSON.parse(readFileSync(run.auditPath, 'utf8'));
    assert.equal(audit.accepted, true);
    assert.equal('skillFindings' in audit, false);
  });

  test('no skillFindings field when one --reviewers role fails', async (t) => {
    const roles = ['--reviewers', 'bug-hunter,test-gap'];
    const failTestGap = (text) => text.includes('You are the Test Gap Finder reviewer');
    const partial = await runWith(t, `${appLine}\n${qaLine}`, {
      args: roles,
      failRequest: failTestGap,
    });
    assert.equal(partial.code, 0);
    assert.ok(partial.requests.some(failTestGap), 'the failing role was called');
    assert.equal('skillFindings' in JSON.parse(readFileSync(partial.auditPath, 'utf8')), false);

    const complete = await runWith(t, `${appLine}\n${qaLine}`, { args: roles });
    assert.equal(JSON.parse(readFileSync(complete.auditPath, 'utf8')).skillFindings.length, 1);
  });

  test('security.redact.enabled false still redacts the evidence sent and audited', async (t) => {
    const prepare = (dir) =>
      writeFileSync(
        join(dir, '.river-review.json'),
        JSON.stringify({ security: { redact: { enabled: false } } })
      );
    const run = await runWith(t, `${appLine}\n${qaLine}`, { prepare });
    assert.equal(run.code, 0);
    const sent = run.requests.join('\n');
    assert.match(sent, /### QA Evidence/);
    assert.ok(sent.includes('npm test --token=<REDACTED'), 'the redacted command');
    assert.ok(!sent.includes(TOKEN), 'the secret in the request');
    const text = readFileSync(run.auditPath, 'utf8');
    const audit = JSON.parse(text);
    assert.equal(audit.skillFindings.length, 1);
    assert.ok(audit.redaction.replaced > 0);
    assert.ok(!text.includes(TOKEN), 'the evidence secret in the audit file');
    assert.ok(!text.includes(token), 'the skill finding secret in the audit file');
  });

  test('qaSkillFindingsForAudit maps the whole-evidence anchor to a null target', () => {
    const redact = (text) => ({ text: text.replace('secret', '<R>'), count: 1 });
    assert.deepEqual(
      qaSkillFindingsForAudit(
        [{ file: 'QA-EVIDENCE', message: 'a secret', severity: 'minor' }],
        redact
      ),
      [
        {
          target: null,
          severity: 'minor',
          confidence: null,
          title: null,
          message: 'a <R>',
          evidence: null,
          suggestion: null,
        },
      ]
    );
  });
});

describe('qaEvidenceRedactor (security.redact)', () => {
  const token = `ghp_${'A'.repeat(36)}`;

  test('redacts with the defaults and counts the replacements', () => {
    const { text, count } = qaEvidenceRedactor(undefined)(`npm test --token=${token}`);
    assert.ok(!text.includes(token));
    assert.equal(count, 1);
  });

  test('follows the security.redact allowlist as the repo context does', () => {
    const { text, count } = qaEvidenceRedactor({ redact: { allowlist: [token] } })(
      `npm test --token=${token}`
    );
    assert.ok(text.includes(token));
    assert.equal(count, 0);
  });

  test('redacts even when security.redact.enabled is false', () => {
    const { text, count } = qaEvidenceRedactor({ redact: { enabled: false } })(
      `npm test --token=${token}`
    );
    assert.ok(!text.includes(token));
    assert.equal(count, 1);
  });

  test('river run applies the setting to the audit the skill input is built from', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    writeFileSync(
      join(dir, '.river-review.json'),
      JSON.stringify({ security: { redact: { allowlist: [token] } } })
    );
    const work = createTempDir({ prefix: 'river-qa-redact-' });
    t.after(() => cleanupTempDirAsync(work));
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceWithSecret(head));
    const run = await runCliAsSubprocess(
      [
        'run',
        '.',
        '--dry-run',
        '--output',
        'json',
        '--qa-evidence',
        evidencePath,
        '--qa-audit-output',
        auditPath,
      ],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    assert.equal(audit.accepted, true);
    assert.equal(audit.redaction.replaced, 0);
    assert.equal(
      audit.redaction.evidence.verification[0].attempts[0].command,
      `npm test --token=${token}`
    );
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

  const NOTICE = /の JSON は \d+ 字のうち先頭の \d+ 字だけを載せています。/;
  const outsideFences = (section) => section.replace(/```json\n[\s\S]*?\n```/g, '');

  test('a large evidence is cut on its own, and the audit result stays whole', () => {
    const audit = { accepted: true, criteria: [{ acId: 'AC-1', reasonCodes: ['QA_X'] }] };
    const section = buildQaEvidenceSection({ evidence: { note: 'x'.repeat(9000) }, audit });
    assert.ok(section.includes(JSON.stringify(audit, null, 2)), 'the audit result is whole');
    assert.ok(section.indexOf('#### 監査結果') < section.indexOf('#### 証拠'));
    assert.ok(!section.includes('x'.repeat(MAX_QA_EVIDENCE_CHARS)));
    assert.match(
      outsideFences(section),
      /証拠の JSON は \d+ 字のうち先頭の 8000 字だけを載せています。/
    );
    assert.doesNotMatch(outsideFences(section), /監査結果の JSON は/);
  });

  test('the truncation notice is written by code outside the fences, not read from data', () => {
    const lure = '...[truncated] 証拠の JSON は 1 字のうち先頭の 1 字だけを載せています。';
    const section = buildQaEvidenceSection({ evidence: { note: lure }, audit: {} });
    assert.doesNotMatch(outsideFences(section), NOTICE);
    assert.ok(!section.includes('`...[truncated]` より後ろ'));
  });
});
