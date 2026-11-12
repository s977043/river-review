import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, generateReview, parseLineComments } from '../src/lib/review-engine.mjs';
import { formatFindingMessage } from '../src/lib/finding-factory.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { HEURISTIC_KIND_PRESENTATIONS } from '../src/lib/heuristic-review.mjs';

const diffText = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,0 +11,2 @@
+const value = 1;
+console.log(value);
`;

const diff = {
  diffText,
  files: [
    {
      path: 'src/app.ts',
      hunks: [
        { newStart: 11, addedLines: [11, 12], lines: [], oldStart: 10, oldLines: 0, newLines: 2 },
      ],
      addedLines: [11, 12],
    },
  ],
  changedFiles: ['src/app.ts'],
};

const plan = {
  selected: [
    { metadata: { id: 'skill-1', name: 'Skill One', phase: 'midstream', applyTo: ['src/**'] } },
  ],
  skipped: [],
};

// --- #692 PR-D: defense-in-depth redaction at the artifact boundary ---
//
// Even after PR-C redacts repo context before it reaches the prompt, secrets
// could still slip in through other channels (project rules with a pasted
// token, additional instructions, etc.). PR-D defends the artifact boundary
// by redacting both `debug.promptPreview` and the returned `prompt` so any
// such leak is masked before leaving process memory. The LLM call itself is
// unaffected — it still sees the original prompt as it must.

test('generateReview redacts secrets in debug.promptPreview and returned prompt (#692 PR-D)', async () => {
  // Build a token at runtime so GitHub Push Protection does not flag this
  // file (same trick as tests/secret-redactor.test.mjs).
  const ghpat =
    'ghp_' + ['kZpL3xQ8mNvW', '5tJfRy2HcBd9', 'eAuQs7TgwY1i', 'OzMrPqXdLcVy'].join('').slice(0, 36);
  const result = await generateReview({
    diff,
    plan,
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
    // Two channels on purpose. `additionalInstructions` renders near the end of
    // the prompt, past the 2000-char promptPreview window, so asserting the
    // preview through that channel alone silently depended on the instruction
    // list staying short (it broke when #1666 added two lines). `projectRules`
    // renders near the top, which pins the preview assertion to the redaction
    // invariant instead of to a byte offset.
    projectRules: 'Never commit a token such as ' + ghpat,
    config: {
      review: {
        additionalInstructions: ['Do not leak the token: ' + ghpat],
      },
    },
  });

  assert.match(result.debug.promptPreview, /<REDACTED:githubToken>/);
  assert.equal(/ghp_[A-Za-z0-9]{36,}/.test(result.debug.promptPreview), false);
  assert.match(result.prompt, /<REDACTED:githubToken>/);
  assert.equal(/ghp_[A-Za-z0-9]{36,}/.test(result.prompt), false);
  // The late channel must be masked too — the preview window would not see it.
  assert.ok(
    result.prompt.includes('Do not leak the token: <REDACTED:githubToken>'),
    'additionalInstructions past the preview window are still redacted'
  );
});

// T64 follow-up (gemini security-high): debug.rawLlmOutput must go through the
// same redaction invariant as parsed comment messages. A secret that the LLM
// echoes back (e.g. leaked into the diff) must be masked at storage time so it
// never reaches CI logs via printDebugInfo.
test('generateReview redacts secrets in debug.rawLlmOutput (T64 follow-up)', async () => {
  // Build a token at runtime so GitHub Push Protection does not flag this
  // file (same trick as the #692 PR-D test above).
  const ghpat =
    'ghp_' + ['kZpL3xQ8mNvW', '5tJfRy2HcBd9', 'eAuQs7TgwY1i', 'OzMrPqXdLcVy'].join('').slice(0, 36);
  const originalFetch = global.fetch;
  // Unparseable output (no "<file>:<line>: <message>" line) that echoes a secret.
  const rawLlmText = `検出されたトークン ${ghpat} を確認してください。`;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.debug.llmError, 'LLM output could not be parsed');
    assert.match(result.debug.rawLlmOutput, /ghp_\*\*\*REDACTED\*\*\*/);
    assert.equal(/ghp_[A-Za-z0-9]{20,}/.test(result.debug.rawLlmOutput), false);
  } finally {
    global.fetch = originalFetch;
  }
});

// Regression guard found via #1533 self-review E2E: a genuine "no issues
// found" LLM response (NO_ISSUES) must not be routed through the
// invalid/fallback branch just because it has zero findings to validate.
// Before this test the partial-drop logic misclassified an empty findings
// array as "all findings invalid" (invalidCount=0) and reported a spurious
// fallback, when the correct behavior is llmUsed=true with zero comments.
test('generateReview treats NO_ISSUES as a valid empty response, not a fallback (#1529 regression)', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.debug.llmUsed, true);
    assert.equal(result.debug.llmError, undefined);
    assert.equal(result.debug.droppedInvalidFindings, undefined);
    assert.deepEqual(result.comments, []);
  } finally {
    global.fetch = originalFetch;
  }
});

// #1529 E2E follow-up: a maxTokens cutoff truncated the trailing finding so it
// was missing the required Severity:/Confidence: labels. The old behavior
// invalidated the *entire* batch (invalidCount>0 -> full fallback), discarding
// otherwise-valid findings. The fix drops only the malformed finding(s) and
// keeps the valid ones, recording the drop in debug for observability.
test('generateReview drops individually-invalid findings and keeps the valid ones (#1529 partial-invalid)', async () => {
  const validLine = (n) =>
    `src/app.ts:11: ${formatFindingMessage({
      finding: `Finding number ${n}`,
      evidence: 'const value = 1;',
      impact: 'Potential issue in added code',
      fix: 'Review the added line and adjust as needed',
      severity: 'warning',
      confidence: 'medium',
    })}`;
  const validLines = Array.from({ length: 7 }, (_, i) => validLine(i + 1));
  // Truncated finding: missing the trailing "Severity:"/"Confidence:" labels,
  // simulating a maxTokens cutoff mid-response.
  const truncatedLine =
    'src/app.ts:12: Finding: truncated finding Evidence: const value = 1; Impact: cut off mid';
  const rawLlmText = [...validLines, truncatedLine].join('\n');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.debug.llmUsed, true);
    assert.equal(result.debug.droppedInvalidFindings, 1);
    assert.equal(result.debug.droppedInvalidFindingsSample.file, 'src/app.ts');
    assert.equal(result.debug.droppedInvalidFindingsSample.line, 12);
    assert.match(result.debug.llmError, /dropped 1 of 8/);
    assert.match(result.debug.llmError, /remaining 7 valid finding/);
    // The truncated finding must not leak through to findingFormat as ok:true;
    // debug.findingFormat is computed over the post-drop comment set, so it
    // should report all-valid once the malformed entry has been filtered out.
    assert.equal(result.debug.findingFormat.ok, true);
  } finally {
    global.fetch = originalFetch;
  }
});

// Fail-safe boundary: when *every* finding in the batch is malformed, the
// pipeline must still fall back (unchanged behavior) rather than continuing
// with zero valid findings.
test('generateReview falls back when all findings are invalid (fail-safe unchanged, #1529)', async () => {
  const rawLlmText = [
    'src/app.ts:11: Finding: all invalid one Evidence: const value = 1; Impact: no labels',
    'src/app.ts:12: Finding: all invalid two Evidence: const value = 1; Impact: no labels either',
  ].join('\n');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.debug.llmUsed, false);
    assert.equal(result.debug.droppedInvalidFindings, undefined);
    assert.match(result.debug.llmError, /invalidCount=2/);
    assert.match(result.debug.llmError, /Falling back/);
  } finally {
    global.fetch = originalFetch;
  }
});

// Regression (calibration run #1543): the model emitted findings as prose with
// only Severity:/Confidence: appended inline at end-of-line (no Finding:/
// Evidence:/Impact:/Fix: labels). The relaxed validator accepts them (llmUsed
// true, batch not collapsed at the format gate), but the verifier still rejects
// each one for lacking Evidence:/Fix:. The fix is that a *wholesale* verifier
// rejection now degrades to the heuristic/fallback path instead of emitting an
// empty review — so the final findings originate from the fallback, never the
// inline-only LLM text.
test('generateReview falls back when the verifier rejects every inline-only finding (#1543)', async () => {
  const rawLlmText = [
    'src/app.ts:11: console.log leaks the value and should be removed Severity: warning Confidence: high',
    'src/app.ts:12: added line lacks a guard for the null case Severity: nit Confidence: medium',
  ].join('\n');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: true,
      apiKey: 'test-key',
    });
    // Format gate: the inline-only findings validated (relaxed validator), so
    // the batch was NOT collapsed at the format stage.
    assert.equal(result.debug.llmUsed, true, 'inline-only findings pass format validation');
    assert.equal(result.debug.droppedInvalidFindings, undefined, 'no findings dropped as invalid');
    assert.ok(
      result.debug.findingFormat.recommendedGaps >= 2,
      'recommended content-label gaps are surfaced for observability'
    );
    // Verifier gate: both LLM findings rejected (no Evidence:/Fix:).
    assert.equal(result.debug.verifierAllRejected, true, 'wholesale verifier rejection detected');
    assert.equal(result.debug.verifierStats.rejected, 2, 'both inline-only findings rejected');
    assert.equal(result.debug.verifierStats.verified, 0, 'no inline-only finding survived');
    // Fail-safe: a non-empty review is emitted from the fallback path, and none
    // of the emitted findings carry the inline-only LLM text.
    assert.ok(result.findings.length > 0, 'fallback emits a non-empty review, not an empty one');
    for (const f of result.findings) {
      assert.ok(
        !/console\.log leaks the value/.test(f.message),
        'emitted findings originate from fallback, not the rejected inline-only LLM output'
      );
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('generateReview skips the LLM in offline mode even with an API key (#1097 review)', async () => {
  const envBackup = {
    RIVER_OFFLINE: process.env.RIVER_OFFLINE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.RIVER_OFFLINE = '1';
  process.env.OPENAI_API_KEY = 'sk-test-should-not-be-called';
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
    });
    assert.equal(result.debug.llmSkipped, 'offline (rules-only) mode enabled');
  } finally {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// #2868: a run that never called the LLM emits no fallback warning, whatever
// the skip reason; a run whose LLM call failed still does.
for (const [name, env, dryRun] of [
  ['offline', { RIVER_OFFLINE: '1', OPENAI_API_KEY: 'sk-test-should-not-be-called' }, false],
  ['dry-run', { RIVER_OFFLINE: undefined, OPENAI_API_KEY: undefined }, true],
]) {
  test(`generateReview emits no fallback when the LLM is skipped, ${name} (#2868)`, async (t) => {
    const envBackup = {
      RIVER_OFFLINE: process.env.RIVER_OFFLINE,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    t.after(() => {
      for (const [k, v] of Object.entries(envBackup)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun,
      includeFallback: true,
    });
    assert.ok(result.debug.llmSkipped);
    assert.deepEqual(result.comments, []);
  });
}

test('generateReview keeps the fallback when the LLM call fails (#2868)', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => 'denied',
    headers: { get: () => null },
  });
  const result = await generateReview({
    diff,
    plan,
    phase: 'midstream',
    dryRun: false,
    includeFallback: true,
    apiKey: 'test-key',
  });
  assert.ok(result.debug.llmError);
  assert.equal(result.debug.llmSkipped, undefined);
  assert.ok(result.comments.length > 0);
});

test('generateReview runs heuristics when LLM is skipped', async () => {
  // スキルが選択されている場合、ヒューリスティックが実行される。
  // ヒューリスティックが何も検出しなかった場合、コメントは0件となる（正常な動作）。
  const result = await generateReview({
    diff,
    plan,
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
  });
  assert.equal(result.debug.llmUsed, false);
  assert.ok(result.prompt.includes('River Review'));
  // dry-runモードでもヒューリスティックが実行される
  assert.equal(result.debug.heuristicsUsed, true);
  // スキルが選択されているが検出パターンがない場合、コメントは0件
  assert.equal(result.comments.length, 0);
});

test('generateReview drops dist files from the LLM prompt summary and body — collectRepoDiff shape (#1543 finding 1)', async () => {
  const srcFile = {
    path: 'src/app.ts',
    newPath: 'src/app.ts',
    oldPath: 'src/app.ts',
    hunks: [{ header: '@@ -1,2 +1,2 @@', lines: ['-const value = 1;', '+const value = 2;'] }],
    addedLines: [1],
  };
  const distFile = {
    path: 'runners/github-action/dist/index.mjs',
    newPath: 'runners/github-action/dist/index.mjs',
    oldPath: 'runners/github-action/dist/index.mjs',
    hunks: [{ header: '@@ -1,2 +1,2 @@', lines: ['-const bundled = 1;', '+const bundled = 2;'] }],
    addedLines: [1],
  };
  // collectRepoDiff shape: raw `files` include dist, `filesForReview` (optimizeDiff
  // output) and optimized `diffText` exclude it.
  const collectRepoDiffShape = {
    files: [srcFile, distFile],
    filesForReview: [srcFile],
    diffText:
      'diff --git a/src/app.ts b/src/app.ts\n@@ -1,2 +1,2 @@\n-const value = 1;\n+const value = 2;',
  };
  const result = await generateReview({
    diff: collectRepoDiffShape,
    plan: { selected: [] },
    phase: 'implementation',
    dryRun: true,
  });
  // "Changed files" summary (finding 1) and Diff body must both omit the dist file.
  assert.equal(result.prompt.includes('runners/github-action/dist/index.mjs'), false);
  assert.match(result.prompt, /- src\/app\.ts/);
});

test('generateReview drops dist files in the artifact-driven path that bypasses optimizeDiff (#1543 finding 2)', async () => {
  const rawArtifactDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
diff --git a/runners/github-action/dist/index.mjs b/runners/github-action/dist/index.mjs
--- a/runners/github-action/dist/index.mjs
+++ b/runners/github-action/dist/index.mjs
@@ -1,2 +1,2 @@
-const bundled = 1;
+const bundled = 2;`;
  // Mirror review-plan.mjs: no filesForReview, raw diffText + raw parsed files.
  const parsed = parseUnifiedDiff(rawArtifactDiff);
  const result = await generateReview({
    diff: { diffText: rawArtifactDiff, files: parsed.files },
    plan: { selected: [] },
    phase: 'implementation',
    dryRun: true,
  });
  assert.equal(result.prompt.includes('runners/github-action/dist/index.mjs'), false);
  assert.match(result.prompt, /src\/app\.ts/);
});

test('parseLineComments parses structured lines', () => {
  const parsed = parseLineComments('src/app.ts:12: message body\nNOISE');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].file, 'src/app.ts');
  assert.equal(parsed[0].line, 12);
  assert.equal(parsed[0].message, 'message body');
});

test('parseLineComments understands NO_ISSUES', () => {
  const parsed = parseLineComments('NO_ISSUES');
  assert.deepEqual(parsed, []);
});

test('buildPrompt injects project rules when provided', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    projectRules: '- Use App Router',
  });
  assert.match(prompt, /Project-specific review rules/i);
  assert.match(prompt, /Use App Router/);
});

test('buildPrompt injects PR Description section when prBody provided', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    prBody: '## Why\nFix the login bug\n## What\nGuard null user',
  });
  assert.match(prompt, /PR Description/);
  assert.match(prompt, /Fix the login bug/);
  assert.match(prompt, /PR-DESCRIPTION:0/);
});

test('buildPrompt omits PR Description section when prBody is absent or blank', () => {
  const withoutBody = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
  }).prompt;
  const blankBody = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    prBody: '   \n  ',
  }).prompt;
  assert.doesNotMatch(withoutBody, /PR Description/);
  assert.doesNotMatch(blankBody, /PR Description/);
});

test('buildPrompt adds walkthrough/handoff sections only when enabled in config', () => {
  const off = buildPrompt({ diffText, diffFiles: diff.files, plan, phase: 'midstream' }).prompt;
  assert.doesNotMatch(off, /File Walkthrough/);
  assert.doesNotMatch(off, /Agent Handoff/);

  const on = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    config: { review: { walkthrough: true, agentHandoff: true } },
  }).prompt;
  assert.match(on, /## File Walkthrough/);
  assert.match(on, /## Agent Handoff/);
});

test('generateReview: verifier stats exist in debug output', async () => {
  const result = await generateReview({
    diff: { diffText: '+const x = 1;', files: [], changedFiles: [] },
    plan: { selected: [] },
    phase: 'midstream',
    dryRun: true,
  });
  // verifierStats should always be present after the verifier pass
  assert.ok(result.debug.verifierStats !== undefined, 'verifierStats should exist in debug');
  assert.equal(typeof result.debug.verifierStats.total, 'number');
  assert.equal(typeof result.debug.verifierStats.verified, 'number');
  assert.equal(typeof result.debug.verifierStats.rejected, 'number');
  // verifierRejected should be an array (possibly empty)
  assert.ok(Array.isArray(result.debug.verifierRejected), 'verifierRejected should be an array');
});

test('buildPrompt includes ADR context section when relatedADRs provided', () => {
  const relatedADRs = [
    {
      title: 'ADR-001 Eval Loop',
      path: 'docs/adr/001-eval.md',
      matchReason: 'keyword: evaluation',
    },
    {
      title: 'ADR-002 Scoring',
      path: 'docs/adr/002-scoring.md',
      matchReason: 'references: src/app.ts',
    },
  ];
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    projectRules: null,
    relatedADRs,
  });
  assert.match(prompt, /Related ADRs\/Specs/);
  assert.match(prompt, /ADR-001 Eval Loop/);
  assert.match(prompt, /ADR-002 Scoring/);
  assert.match(prompt, /設計文書との整合性/);
});

test('buildPrompt omits ADR context section when relatedADRs is empty', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    projectRules: null,
    relatedADRs: [],
  });
  assert.ok(!prompt.includes('Related ADRs/Specs'));
});

test('buildPrompt omits ADR context section when relatedADRs is undefined', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    projectRules: null,
  });
  assert.ok(!prompt.includes('Related ADRs/Specs'));
});

// T64: additionalInstructions が単一行 "<file>:<line>: <message>" 形式の
// 出力要求と競合し、LLM出力のパース失敗を招いていた。追加指示の適用範囲を
// message 内容に限定し、行フォーマットは常に維持する旨をプロンプトに含める。
test('buildPrompt scopes additionalInstructions to message content and preserves line format (T64)', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    config: {
      review: {
        additionalInstructions: ['出力は要約・重大な懸念・具体的な提案の3部構成を維持する。'],
      },
    },
  });
  assert.match(prompt, /追加指示:/);
  assert.match(prompt, /<message> 内容にのみ適用/);
  assert.match(prompt, /行フォーマット自体は常に維持/);
  // format instruction line must precede the user-supplied instructions
  const formatNoteIndex = prompt.indexOf('<message> 内容にのみ適用');
  const userInstructionIndex = prompt.indexOf(
    '出力は要約・重大な懸念・具体的な提案の3部構成を維持する。'
  );
  assert.ok(formatNoteIndex > -1 && userInstructionIndex > -1);
  assert.ok(formatNoteIndex < userInstructionIndex);
});

test('buildPrompt omits the additionalInstructions format note when none are configured', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
  });
  assert.doesNotMatch(prompt, /追加指示:/);
  assert.doesNotMatch(prompt, /<message> 内容にのみ適用/);
});

test('buildPrompt switches language based on config', () => {
  const { prompt, language } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
    projectRules: null,
    config: { review: { language: 'en' } },
  });
  assert.equal(language, 'en');
  assert.match(prompt, /Write the <message> in English/);
});

// --- #1685: design-intent comments adjacent to the cited line ---
//
// VERIFICATION.md self-check 7 covers the agent-driven path, but SKILL.md and
// reference bodies never reach the model on the CLI path (buildSkillSummary
// emits id/phase/severity only, see the #1666 F1 test in finding-format).
// Without a prompt line the rule is unreachable for `river run`, so the
// instruction is asserted here rather than inferred from the reference doc.
test('buildPrompt tells the model to read adjacent intent comments before flagging (#1685)', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
  });
  assert.match(prompt, /read the comments and docblocks adjacent to it in the diff/);
  assert.match(prompt, /never repeat a suggestion one of them already answers/);
  // Omission is scoped to low-stakes findings, so the escape hatch cannot be
  // widened by the model's own judgement.
  assert.match(prompt, /ONLY for nits, style, and design-preference points/);
  // A comment that does not match the code is still a finding (#1685 Non-goals).
  assert.match(prompt, /A comment that contradicts the code it documents is itself a finding/);
});

// The floor is the security property of this instruction, not a nicety: severity
// feeds deriveVerdict's gate decision, so a wording that lets the model drop a
// finding on the strength of an adjacent comment turns any in-diff comment into a
// GO/NO-GO switch — the prompt-level form of the review-criteria self-weakening
// class skilled in #1669, and the same trap as #1682 F2 (loosening verification
// is an attack surface). Asserted separately so a future reword cannot quietly
// delete it while the "read the comments" clause keeps the other test green.
test('buildPrompt forbids an intent comment from suppressing a real risk (#1685 floor)', () => {
  const { prompt } = buildPrompt({
    diffText,
    diffFiles: diff.files,
    plan,
    phase: 'midstream',
  });
  assert.match(
    prompt,
    /Never omit a security, data-loss, or correctness risk because a comment calls it intentional/
  );
  // Reporting it is not enough — the finding has to engage with the comment.
  assert.match(prompt, /cite that comment in <message>, and state the risk that remains/);
  // Downgrading needs a real mitigation, not merely a declared intent.
  assert.match(prompt, /Lower the severity only when the stated intent genuinely mitigates/);
  // The pre-fix wording ("drop the finding or lower its severity") both allowed
  // an unconditional drop and asked for a <message> on a finding that no longer
  // exists. Pin its absence so it cannot be reintroduced.
  assert.doesNotMatch(prompt, /drop the finding or lower its severity/);
});

test('buildPrompt keeps the intent-comment instruction independent of language (#1685)', () => {
  // The instruction block is English on both paths; only <message> switches.
  for (const language of ['ja', 'en']) {
    const { prompt } = buildPrompt({
      diffText,
      diffFiles: diff.files,
      plan,
      phase: 'midstream',
      config: { review: { language } },
    });
    assert.match(
      prompt,
      /read the comments and docblocks adjacent to it in the diff/,
      `language=${language}`
    );
  }
});

// --- #1597: output-stage filter for findings on generated (dist) paths ---
//
// #1570 excluded dist/ paths from the LLM-facing diff only. The heuristic
// detectors deliberately still scan the raw diff.files (the #1070 canary
// boundary), so a heuristic finding can still land on a dist bundle and reach
// output — observed in calibration run 29686736870 where logging-observability
// findings pointed at runners/github-action/dist/index.mjs. The finding-output
// stage now drops those, keeps non-generated findings unchanged, and records
// the suppression in debug for observability.
const silentCatchDiff = {
  diffText: 'diff placeholder',
  files: [
    {
      path: 'runners/github-action/dist/index.mjs',
      hunks: [{ newStart: 47857, lines: ['+  } catch (e) {}'] }],
      addedLines: [47857],
    },
    {
      path: 'src/service.mjs',
      hunks: [{ newStart: 20, lines: ['+  } catch (e) {}'] }],
      addedLines: [20],
    },
  ],
  changedFiles: ['runners/github-action/dist/index.mjs', 'src/service.mjs'],
};

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

test('generateReview drops findings on generated (dist) paths but keeps source findings (#1597)', async () => {
  const result = await generateReview({
    diff: silentCatchDiff,
    plan: loggingPlan,
    phase: 'midstream',
    dryRun: true, // skip LLM → heuristic detectors run over the raw diff
    includeFallback: false,
  });

  // Heuristic silent-catch findings are raised for BOTH files (detection is
  // untouched), but only the source-path one survives to output.
  const findingFiles = result.findings.map((f) => f.file);
  assert.ok(
    findingFiles.includes('src/service.mjs'),
    'the source-path finding must remain in the emitted findings'
  );
  assert.ok(
    !findingFiles.some((f) => f.startsWith('runners/github-action/dist/')),
    'no finding on a dist/ path may reach the emitted findings'
  );

  // The emitted PR comments (1:1 with findings) must also exclude the dist path.
  const commentFiles = result.comments.map((c) => c.file);
  assert.ok(
    !commentFiles.some((f) => f.startsWith('runners/github-action/dist/')),
    'no comment on a dist/ path may reach output'
  );

  // classified (display/severity buckets) is derived from findings, so it too
  // must exclude the dist path — this also proves score exclusion, since the
  // rubric penalty is computed from findings.
  const classifiedFiles = Object.values(result.classified ?? {})
    .flat()
    .map((f) => f?.file)
    .filter(Boolean);
  assert.ok(
    !classifiedFiles.some((f) => String(f).startsWith('runners/github-action/dist/')),
    'no classified finding on a dist/ path may reach output'
  );

  // Suppression is observable in debug.
  assert.ok(
    result.debug.suppressedGeneratedPathFindings >= 1,
    'debug must record the suppressed generated-path finding count'
  );
  assert.ok(
    result.debug.suppressedGeneratedPathFindingsSample.some((s) =>
      s.file.startsWith('runners/github-action/dist/')
    ),
    'debug sample must include the suppressed dist path'
  );
});

test('generateReview leaves debug.suppressedGeneratedPathFindings unset when no generated-path finding (#1597)', async () => {
  const sourceOnlyDiff = {
    diffText: 'diff placeholder',
    files: [
      {
        path: 'src/service.mjs',
        hunks: [{ newStart: 20, lines: ['+  } catch (e) {}'] }],
        addedLines: [20],
      },
    ],
    changedFiles: ['src/service.mjs'],
  };
  const result = await generateReview({
    diff: sourceOnlyDiff,
    plan: loggingPlan,
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
  });
  assert.equal(
    result.debug.suppressedGeneratedPathFindings,
    undefined,
    'no suppression key when nothing was suppressed'
  );
  assert.ok(
    result.findings.some((f) => f.file === 'src/service.mjs'),
    'the source-path finding is unchanged'
  );
});

// #1597 (adversarial-review boundary / canary): the output filter is narrowed
// to generated `dist/` directories ONLY. Findings on `.md` and lock files —
// which ARE stripped from the LLM-facing diff by isExcludedFile — must still
// reach output, otherwise a real finding (e.g. a hardcoded secret in a docs
// code fence, or a lock-file issue) would be silently hidden. The reviewer
// measured a silent-catch finding on docs/how-to.md being wrongly suppressed;
// this test locks the fix.
test('generateReview does NOT suppress findings on .md or lock files (#1597 boundary)', async () => {
  const docsAndLockDiff = {
    diffText: 'diff placeholder',
    files: [
      {
        path: 'docs/how-to.md',
        hunks: [{ newStart: 5, lines: ['+  } catch (e) {}'] }],
        addedLines: [5],
      },
      {
        path: 'package-lock.json',
        hunks: [{ newStart: 9, lines: ['+  } catch (e) {}'] }],
        addedLines: [9],
      },
    ],
    changedFiles: ['docs/how-to.md', 'package-lock.json'],
  };
  const result = await generateReview({
    diff: docsAndLockDiff,
    plan: loggingPlan,
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
  });
  const findingFiles = result.findings.map((f) => f.file);
  assert.ok(
    findingFiles.includes('docs/how-to.md'),
    'a finding on a .md file must reach output (not suppressed as a generated path)'
  );
  assert.ok(
    findingFiles.includes('package-lock.json'),
    'a finding on a lock file must reach output (not suppressed as a generated path)'
  );
  assert.equal(
    result.debug.suppressedGeneratedPathFindings,
    undefined,
    'nothing was on a dist/ path, so no generated-path suppression occurred'
  );
});

// #1857 / ADR-007 `observe` 条件 3: the overview cap is a RANKING outcome, and
// the report does not truncate to it (every comment is printed). The only place
// the cap is observable is therefore debug — without this counter, "how often
// does the cap bite" is unmeasurable, which is what the `observe` stage needs to
// know. The expected count is one the reader can compute by hand (6 findings,
// medium cap 5 -> 1), not read back off the implementation.
test('generateReview records the overview-cap overflow in debug (#1857)', async () => {
  const validLine = (n) =>
    `src/app.ts:11: ${formatFindingMessage({
      finding: `Overflow finding number ${n}`,
      // 30+ chars, otherwise prefilterFindings suppresses every finding as
      // insufficient_evidence and nothing ever reaches the ranking stage.
      evidence: 'const value = 1; // the added line under review',
      impact: 'Potential issue in added code',
      fix: 'Review the added line and adjust as needed',
      severity: 'warning',
      confidence: 'medium',
    })}`;
  const rawLlmText = Array.from({ length: 6 }, (_, i) => validLine(i + 1)).join('\n');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.findings.length, 6);
    assert.equal(result.classified.overview.length, 5);
    assert.equal(result.debug.overviewCapOverflow, 1);
    // The overflow finding is NOT a suppression and carries no reason code.
    assert.deepEqual(result.classified.suppressed, []);
    // ...and it is still in the emitted set, which is why the Markdown report
    // may not announce it as hidden.
    assert.equal(result.comments.length, 6);
  } finally {
    global.fetch = originalFetch;
  }
});

test('generateReview leaves debug.overviewCapOverflow unset when nothing overflowed (#1857)', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
  });
  try {
    const result = await generateReview({
      diff,
      plan,
      phase: 'midstream',
      dryRun: false,
      includeFallback: false,
      apiKey: 'test-key',
    });
    assert.equal(result.debug.overviewCapOverflow, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test.describe('verifier stage keeps checking everything that is not a detector batch', () => {
  const finding = (severity, path = 'src/app.js') =>
    `src/app.js:1: Finding: real issue Evidence: the change at ${path} breaks auth ` +
    `Impact: bad Fix: Replace the call with the audited helper Severity: ${severity} ` +
    'Confidence: high';
  const reply = (content) => async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  const rejectedRequest = async () => ({
    ok: false,
    status: 400,
    text: async () => 'denied',
    headers: { get: () => null },
  });
  const mkDiff = (added) => {
    const diffText = `diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-a\n+${added}\n`;
    return { diffText, files: parseUnifiedDiff(diffText).files };
  };
  const plan = (severity, extra = []) => ({
    selected: [{ metadata: { id: 'first', name: 'first', severity } }, ...extra],
    skipped: [],
  });
  const PLAIN = 'export const v = 1;';

  async function review(t, { fetchImpl, added = PLAIN, reviewPlan }) {
    const env = {
      OPENAI_API_KEY: undefined,
      RIVER_OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      RIVER_OFFLINE: undefined,
      RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
    };
    const savedEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    const originalFetch = global.fetch;
    t.after(() => {
      global.fetch = originalFetch;
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = fetchImpl;
    return generateReview({
      diff: mkDiff(added),
      plan: reviewPlan,
      phase: 'midstream',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    });
  }
  const summarize = (result) => result.findings.map((f) => `${f.ruleId}:${f.severity}`);

  test('TC-04 an LLM blocker above the first skill severity is still rejected', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      reviewPlan: plan('minor'),
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.debug.verifierStats.rejected, 1);
    assert.deepEqual(result.debug.verifierRejected[0].reasons, [
      'Severity exceeds skill severity without justification',
    ]);
  });

  test('TC-04 an LLM blocker quoting a detector preset is still rejected', async (t) => {
    const preset = HEURISTIC_KIND_PRESENTATIONS.get('merge-conflict');
    const result = await review(t, {
      fetchImpl: reply(
        `src/app.js:1: Finding: ${preset.finding} Evidence: ${preset.evidence} ` +
          `Impact: ${preset.impact} Fix: ${preset.fix} Severity: blocker Confidence: high`
      ),
      reviewPlan: plan('minor'),
    });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.debug.verifierRejected[0].reasons, [
      'Severity exceeds skill severity without justification',
    ]);
  });

  test('TC-04 control: an LLM blocker under a critical first skill passes', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      reviewPlan: plan('critical'),
    });
    assert.deepEqual(
      result.findings.map((f) => f.severity),
      ['critical']
    );
  });

  test('TC-04 an LLM finding citing a file outside the diff is still rejected', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker', 'src/ghost.js')),
      reviewPlan: plan('critical'),
    });
    assert.deepEqual(result.debug.verifierRejected[0].reasons, [
      'Evidence references file not found in diff',
    ]);
    assert.ok(!result.findings.some((f) => f.severity === 'critical'));
  });

  // The empty result relies on the first-skill comparison rejecting the fallback's
  // major. This pin is not a spec of that defect: it fixes that this change does
  // not relax it, and it moves with the PR that fixes the comparison or fallback.
  test('TC-05 the fallback under a minor first skill stays rejected', async (t) => {
    const result = await review(t, { fetchImpl: rejectedRequest, reviewPlan: plan('minor') });
    assert.deepEqual(result.findings, []);
  });

  test('TC-05 the fallback under a major first skill stays major', async (t) => {
    const result = await review(t, { fetchImpl: rejectedRequest, reviewPlan: plan('major') });
    assert.deepEqual(summarize(result), ['first:major']);
  });

  test('TC-08 a degraded batch keeps the detector finding', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      added: '<<<<<<< HEAD',
      reviewPlan: plan('minor', [
        { metadata: { id: 'logging-observability', name: 'l', severity: 'minor' } },
      ]),
    });
    assert.deepEqual(summarize(result), ['logging-observability:critical']);
    assert.equal(result.debug.verifierAllRejected, true);
  });
});
