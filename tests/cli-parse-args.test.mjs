// tests/cli-parse-args.test.mjs
//
// parseArgs の純粋関数テスト。
// 子プロセスを起動せず、同期的に parse 結果を検証することで高速化する。
// 各テストは < 50ms で完走する想定。

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs, isLlmlessEmptyReview, EAGER_COMMANDS } from '../src/cli.mjs';
import { PHASES } from '../src/lib/planner-utils.mjs';
import { normalizePhase } from '../src/lib/local-runner.mjs';

test('isLlmlessEmptyReview: true when LLM key missing and no findings (#1067)', () => {
  assert.equal(
    isLlmlessEmptyReview({ reviewDebug: { llmSkipped: 'OPENAI_API_KEY not set' }, comments: [] }),
    true
  );
});

test('isLlmlessEmptyReview: false when there are findings', () => {
  assert.equal(
    isLlmlessEmptyReview({
      reviewDebug: { llmSkipped: 'OPENAI_API_KEY not set' },
      comments: [{ severity: 'major' }],
    }),
    false
  );
});

test('isLlmlessEmptyReview: false when LLM ran (no llmSkipped) even with 0 findings', () => {
  assert.equal(isLlmlessEmptyReview({ reviewDebug: { llmUsed: true }, comments: [] }), false);
});

test('isLlmlessEmptyReview: false for dry-run skip (not a missing key)', () => {
  assert.equal(
    isLlmlessEmptyReview({ reviewDebug: { llmSkipped: 'dry-run' }, comments: [] }),
    false
  );
});

// parseArgs は process.env を参照してデフォルト値を決めるため、
// 環境変数がテスト結果に影響しないよう一時的にクリアする。
function withCleanEnv(fn) {
  const keys = ['RIVER_PHASE', 'RIVER_PLANNER_MODE'];
  const backup = {};
  for (const key of keys) {
    backup[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (backup[key] === undefined) delete process.env[key];
      else process.env[key] = backup[key];
    }
  }
}

// -----------------------------------------------------------------------------
// Defaults and commands
// -----------------------------------------------------------------------------

test('parseArgs: empty argv leaves command null and defaults applied', () => {
  withCleanEnv(() => {
    const parsed = parseArgs([]);
    assert.equal(parsed.command, null);
    assert.equal(parsed.target, '.');
    assert.equal(parsed.phase, 'midstream');
    assert.equal(parsed.plannerMode, 'off');
    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.debug, false);
    assert.equal(parsed.estimate, false);
    assert.equal(parsed.maxCost, null);
    assert.equal(parsed.output, 'text');
  });
});

test('parseArgs: run command with default target', () => {
  const parsed = parseArgs(['run']);
  assert.equal(parsed.command, 'run');
  assert.equal(parsed.target, '.');
});

test('parseArgs: run command with explicit target path', () => {
  const repoPath = path.join(os.tmpdir(), 'myrepo');
  const parsed = parseArgs(['run', repoPath]);
  assert.equal(parsed.command, 'run');
  assert.equal(parsed.target, repoPath);
});

test('parseArgs: doctor command', () => {
  const parsed = parseArgs(['doctor', '.']);
  assert.equal(parsed.command, 'doctor');
  assert.equal(parsed.target, '.');
});

test('parseArgs: eval command sets command without target', () => {
  const parsed = parseArgs(['eval']);
  assert.equal(parsed.command, 'eval');
});

test('parseArgs: skills list subcommand', () => {
  const parsed = parseArgs(['skills', 'list']);
  assert.equal(parsed.command, 'skills');
  assert.equal(parsed.skillsSubcommand, 'list');
});

test('parseArgs: skills import subcommand with --from', () => {
  const parsed = parseArgs(['skills', 'import', '--from', '/some/path']);
  assert.equal(parsed.command, 'skills');
  assert.equal(parsed.skillsSubcommand, 'import');
  assert.equal(parsed.fromPath, '/some/path');
});

test('parseArgs: skills export subcommand with --to and --include-assets', () => {
  const parsed = parseArgs(['skills', 'export', '--to', '/out', '--include-assets']);
  assert.equal(parsed.skillsSubcommand, 'export');
  assert.equal(parsed.toPath, '/out');
  assert.equal(parsed.includeAssets, true);
});

// -----------------------------------------------------------------------------
// Boolean flags
// -----------------------------------------------------------------------------

test('parseArgs: --dry-run sets dryRun true', () => {
  const parsed = parseArgs(['run', '.', '--dry-run']);
  assert.equal(parsed.dryRun, true);
});

test('parseArgs: --debug sets debug true', () => {
  const parsed = parseArgs(['run', '.', '--debug']);
  assert.equal(parsed.debug, true);
});

test('parseArgs: --estimate sets estimate true', () => {
  const parsed = parseArgs(['run', '.', '--estimate']);
  assert.equal(parsed.estimate, true);
});

test('parseArgs: --verbose sets verbose true', () => {
  const parsed = parseArgs(['eval', '--verbose']);
  assert.equal(parsed.verbose, true);
});

// -----------------------------------------------------------------------------
// Options with values
// -----------------------------------------------------------------------------

test('parseArgs: --phase downstream', () => {
  const parsed = parseArgs(['run', '.', '--phase', 'downstream']);
  assert.equal(parsed.phase, 'downstream');
});

test('parseArgs: --phase without value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['run', '.', '--phase']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --planner order', () => {
  const parsed = parseArgs(['run', '.', '--planner', 'order']);
  assert.equal(parsed.plannerMode, 'order');
});

test('parseArgs: --planner invalid value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['run', '.', '--planner', 'bogus']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --output markdown', () => {
  const parsed = parseArgs(['run', '.', '--output', 'markdown']);
  assert.equal(parsed.output, 'markdown');
});

test('parseArgs: --output invalid value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['run', '.', '--output', 'xml']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --max-cost accepts positive decimal', () => {
  const parsed = parseArgs(['run', '.', '--max-cost', '0.25']);
  assert.equal(parsed.maxCost, 0.25);
});

test('parseArgs: --max-cost rejects negative value', () => {
  const parsed = parseArgs(['run', '.', '--max-cost', '-1']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --max-cost rejects non-numeric value', () => {
  const parsed = parseArgs(['run', '.', '--max-cost', 'free']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --context comma list', () => {
  const parsed = parseArgs(['run', '.', '--context', 'diff,fullFile,tests']);
  assert.deepEqual(parsed.availableContexts, ['diff', 'fullFile', 'tests']);
});

test('parseArgs: --dependency comma list', () => {
  const parsed = parseArgs(['run', '.', '--dependency', 'code_search,test_runner']);
  assert.deepEqual(parsed.availableDependencies, ['code_search', 'test_runner']);
});

test('parseArgs: --cases path for eval', () => {
  const parsed = parseArgs(['eval', '--cases', 'custom-cases.json']);
  assert.equal(parsed.fixturesCasesPath, 'custom-cases.json');
});

test('parseArgs: --base captures the diff ref', () => {
  const parsed = parseArgs(['run', '.', '--base', 'develop']);
  assert.equal(parsed.base, 'develop');
});

test('parseArgs: --base defaults to null when unset', () => {
  const parsed = parseArgs(['run', '.']);
  assert.equal(parsed.base, null);
});

test('parseArgs: --base without value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['run', '.', '--base']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --skill-set captures the set name', () => {
  const parsed = parseArgs(['run', '.', '--skill-set', 'comprehensive']);
  assert.equal(parsed.skillSet, 'comprehensive');
});

test('parseArgs: --skill-set defaults to null when unset', () => {
  const parsed = parseArgs(['run', '.']);
  assert.equal(parsed.skillSet, null);
});

test('parseArgs: --skill-set without value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['run', '.', '--skill-set']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --fail-on / --warn-on capture severities; --advisory-only sets flag', () => {
  const parsed = parseArgs([
    'review',
    'exec',
    '--fail-on',
    'major',
    '--warn-on',
    'minor',
    '--advisory-only',
  ]);
  assert.equal(parsed.failOn, 'major');
  assert.equal(parsed.warnOn, 'minor');
  assert.equal(parsed.advisoryOnly, true);
});

test('parseArgs: --fail-on defaults null; --advisory-only defaults false', () => {
  const parsed = parseArgs(['review', 'plan']);
  assert.equal(parsed.failOn, null);
  assert.equal(parsed.warnOn, null);
  assert.equal(parsed.advisoryOnly, false);
});

test('parseArgs: --gate sets the flag; defaults false (Epic #1347 S4)', () => {
  assert.equal(parseArgs(['run', '.', '--gate']).gate, true);
  assert.equal(parseArgs(['review', 'exec', '--gate']).gate, true);
  assert.equal(parseArgs(['run', '.']).gate, false);
});

test('parseArgs: --offline and --rules-only set offline; defaults false (#1071)', () => {
  assert.equal(parseArgs(['run', '.', '--offline']).offline, true);
  assert.equal(parseArgs(['run', '.', '--rules-only']).offline, true);
  assert.equal(parseArgs(['run', '.']).offline, false);
});

test('parseArgs: --fail-on rejects an unknown severity', () => {
  const parsed = parseArgs(['review', 'exec', '--fail-on', 'nope']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --depth accepts a valid level', () => {
  const parsed = parseArgs(['run', '.', '--depth', 'thorough']);
  assert.equal(parsed.depth, 'thorough');
});

test('parseArgs: --depth defaults to null when unset', () => {
  const parsed = parseArgs(['run', '.']);
  assert.equal(parsed.depth, null);
});

test('parseArgs: --depth rejects an unknown level', () => {
  const parsed = parseArgs(['run', '.', '--depth', 'nope']);
  assert.equal(parsed.usageError, true);
});

// -----------------------------------------------------------------------------
// skills import options
// -----------------------------------------------------------------------------

test('parseArgs: --strict sets validationMode strict', () => {
  const parsed = parseArgs(['skills', 'import', '--strict']);
  assert.equal(parsed.validationMode, 'strict');
});

test('parseArgs: --loose sets validationMode loose', () => {
  const parsed = parseArgs(['skills', 'import', '--loose']);
  assert.equal(parsed.validationMode, 'loose');
});

test('parseArgs: --source rr', () => {
  const parsed = parseArgs(['skills', 'list', '--source', 'rr']);
  assert.equal(parsed.listSource, 'rr');
});

test('parseArgs: --source invalid value raises a usage error (#1709 S2)', () => {
  const parsed = parseArgs(['skills', 'list', '--source', 'wrong']);
  assert.equal(parsed.usageError, true);
});

// -----------------------------------------------------------------------------
// Help flag
// -----------------------------------------------------------------------------

test('parseArgs: -h triggers help command', () => {
  const parsed = parseArgs(['-h']);
  assert.equal(parsed.command, 'help');
  assert.equal(parsed.usageError, false, 'explicit help is not a usage error');
});

test('parseArgs: --help triggers help command', () => {
  const parsed = parseArgs(['--help']);
  assert.equal(parsed.command, 'help');
  assert.equal(parsed.usageError, false, 'explicit help is not a usage error');
});

// -----------------------------------------------------------------------------
// Environment variable defaults
// -----------------------------------------------------------------------------

test('parseArgs: RIVER_PHASE env overrides default phase', () => {
  const backup = process.env.RIVER_PHASE;
  process.env.RIVER_PHASE = 'upstream';
  try {
    const parsed = parseArgs([]);
    assert.equal(parsed.phase, 'upstream');
  } finally {
    if (backup === undefined) delete process.env.RIVER_PHASE;
    else process.env.RIVER_PHASE = backup;
  }
});

test('parseArgs: explicit --phase overrides RIVER_PHASE env', () => {
  const backup = process.env.RIVER_PHASE;
  process.env.RIVER_PHASE = 'upstream';
  try {
    const parsed = parseArgs(['run', '.', '--phase', 'downstream']);
    assert.equal(parsed.phase, 'downstream');
  } finally {
    if (backup === undefined) delete process.env.RIVER_PHASE;
    else process.env.RIVER_PHASE = backup;
  }
});

// -----------------------------------------------------------------------------
// suppression subcommand (#687 PR-D)
// -----------------------------------------------------------------------------

test('parseArgs: suppression add captures all flags', () => {
  const parsed = parseArgs([
    'suppression',
    'add',
    '--fingerprint',
    'a'.repeat(16),
    '--feedback',
    'false_positive',
    '--rationale',
    'flagged but acceptable in this codebase',
    '--scope',
    'subsystem',
    '--severity',
    'minor',
    '--files',
    'src/auth.ts,src/login.ts',
    '--pr',
    '123',
  ]);
  assert.equal(parsed.command, 'suppression');
  assert.equal(parsed.suppressionSubcommand, 'add');
  assert.equal(parsed.suppressionFingerprint, 'a'.repeat(16));
  assert.equal(parsed.suppressionFeedbackType, 'false_positive');
  assert.equal(parsed.suppressionRationale, 'flagged but acceptable in this codebase');
  assert.equal(parsed.suppressionScope, 'subsystem');
  assert.equal(parsed.suppressionSeverity, 'minor');
  assert.deepEqual(parsed.suppressionFiles, ['src/auth.ts', 'src/login.ts']);
  assert.equal(parsed.suppressionPrNumber, 123);
});

test('parseArgs: suppression add defaults scope to file', () => {
  const parsed = parseArgs([
    'suppression',
    'add',
    '--fingerprint',
    'b'.repeat(16),
    '--feedback',
    'accepted_risk',
    '--rationale',
    'accepted',
  ]);
  assert.equal(parsed.suppressionScope, 'file');
});

test('parseArgs: suppression add rejects a non-positive or non-integer --pr (#1709 S3)', () => {
  // Before Slice 3 these were silently dropped (suppressionPrNumber stayed
  // null) while the entry was still written with exit 0.
  for (const bad of ['0', '-5', 'abc', '1.5']) {
    const parsed = parseArgs([
      'suppression',
      'add',
      '--fingerprint',
      'c'.repeat(16),
      '--feedback',
      'false_positive',
      '--rationale',
      'r',
      '--pr',
      bad,
    ]);
    assert.equal(parsed.usageError, true, `--pr ${bad} should raise a usage error`);
    assert.equal(parsed.suppressionPrNumber, null);
  }
});

test('parseArgs: suppression add --scope requires a value (#1709 S3)', () => {
  // A trailing --scope used to fall back to the default 'file' in silence,
  // and the entry was still written with exit 0.
  const parsed = parseArgs([
    'suppression',
    'add',
    '--fingerprint',
    'd'.repeat(16),
    '--feedback',
    'false_positive',
    '--rationale',
    'r',
    '--scope',
  ]);
  assert.equal(parsed.usageError, true);
});

// --- #802 Phase 3: review plan flags ---

test('parseArgs: review plan with --summary-file and --quiet', () => {
  const parsed = parseArgs([
    'review',
    'plan',
    '--plan-only',
    '--output-file',
    'a.json',
    '--summary-file',
    's.md',
    '--quiet',
  ]);
  assert.equal(parsed.command, 'review');
  assert.equal(parsed.reviewSubcommand, 'plan');
  assert.equal(parsed.planOnly, true);
  assert.equal(parsed.outputFile, 'a.json');
  assert.equal(parsed.summaryFile, 's.md');
  assert.equal(parsed.quiet, true);
});

test('parseArgs: --summary-file requires a value', () => {
  const parsed = parseArgs(['review', 'plan', '--summary-file']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: review plan defaults (no summary, not quiet)', () => {
  const parsed = parseArgs(['review', 'plan', '--plan-only']);
  assert.equal(parsed.summaryFile, null);
  assert.equal(parsed.quiet, false);
  assert.equal(parsed.outputExplicit, false);
  assert.equal(parsed.format, null);
  assert.equal(parsed.formatExplicit, false);
});

test('parseArgs: --output sets outputExplicit; --format sets format/formatExplicit', () => {
  const a = parseArgs(['review', 'plan', '--plan-only', '--output', 'json']);
  assert.equal(a.output, 'json');
  assert.equal(a.outputExplicit, true);
  assert.equal(a.formatExplicit, false);
  const b = parseArgs(['review', 'plan', '--plan-only', '--format', 'markdown']);
  assert.equal(b.format, 'markdown');
  assert.equal(b.formatExplicit, true);
  assert.equal(b.outputExplicit, false);
});

test('parseArgs: --format rejects unknown value', () => {
  const parsed = parseArgs(['review', 'plan', '--format', 'yaml']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: --format requires a value', () => {
  const parsed = parseArgs(['review', 'plan', '--format']);
  assert.equal(parsed.usageError, true);
});

// --- #802 Phase 3 PR-3: exec/verify parser contract ---

test('parseArgs: review exec accepts --plan/--artifact/--output/--format', () => {
  const parsed = parseArgs([
    'review',
    'exec',
    '--plan',
    './plan.json',
    '--artifact',
    'diff=./d.patch',
    '--output',
    'json',
    '--format',
    'json',
  ]);
  assert.equal(parsed.command, 'review');
  assert.equal(parsed.reviewSubcommand, 'exec');
  assert.equal(parsed.planFile, './plan.json');
  assert.deepEqual(parsed.cliArtifacts, { diff: './d.patch' });
  assert.equal(parsed.output, 'json');
  assert.equal(parsed.format, 'json');
});

test('parseArgs: review verify accepts --plan and review artifacts', () => {
  const parsed = parseArgs([
    'review',
    'verify',
    '--plan',
    './plan.json',
    '--artifact',
    'review-self=./rs.md',
  ]);
  assert.equal(parsed.reviewSubcommand, 'verify');
  assert.equal(parsed.planFile, './plan.json');
  assert.deepEqual(parsed.cliArtifacts, { 'review-self': './rs.md' });
});

test('parseArgs: --plan requires a value', () => {
  const parsed = parseArgs(['review', 'exec', '--plan']);
  assert.equal(parsed.usageError, true);
});

test('parseArgs: planFile defaults to null', () => {
  const parsed = parseArgs(['review', 'plan', '--plan-only']);
  assert.equal(parsed.planFile, null);
});

test('parseArgs: --explain sets explain flag (#1045 A3)', () => {
  const parsed = parseArgs(['run', '.', '--explain']);
  assert.equal(parsed.explain, true);
});

test('parseArgs: explain defaults to falsy without --explain', () => {
  const parsed = parseArgs(['run', '.']);
  assert.ok(!parsed.explain);
});

// --- #1471 increment A: feedback add --reviewer/--model/--reversed-by ---

test('parseArgs: feedback add parses --reviewer/--model/--reversed-by values', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'out_of_scope',
    '--skill',
    'doc-hygiene',
    '--reviewer',
    'gemini',
    '--model',
    'gemini-2.5-pro',
    '--reversed-by',
    'a1b2c3d4e5f60718',
  ]);
  assert.equal(parsed.command, 'feedback');
  assert.equal(parsed.feedbackSubcommand, 'add');
  assert.equal(parsed.feedbackReviewer, 'gemini');
  assert.equal(parsed.feedbackModel, 'gemini-2.5-pro');
  assert.equal(parsed.feedbackReversedBy, 'a1b2c3d4e5f60718');
});

test('parseArgs: feedback --reviewer/--model/--reversed-by require a value', () => {
  for (const flag of ['--reviewer', '--model', '--reversed-by']) {
    const parsed = parseArgs(['feedback', 'add', '--type', 'accepted', '--skill', 's', flag]);
    assert.equal(
      parsed.usageError,
      true,
      `${flag} without a value raises a usage error (#1709 S2)`
    );
  }
});

test('parseArgs: feedback --reviewer does not consume a following flag as its value', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'accepted',
    '--skill',
    's',
    '--reviewer',
    '--model',
    'gpt-5',
  ]);
  assert.equal(parsed.usageError, true, 'next flag is not eaten as the value');
  assert.equal(parsed.feedbackReviewer, null);
});

// --- #1673: feedback add --run-id (#1574 P1 producer) ---

test('parseArgs: feedback add parses --run-id', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'false_positive',
    '--skill',
    'secret-scanner',
    '--run-id',
    '2026-07-25T00-00-00-000Z-abc123',
  ]);
  assert.equal(parsed.command, 'feedback');
  assert.equal(parsed.feedbackSubcommand, 'add');
  assert.equal(parsed.feedbackRunId, '2026-07-25T00-00-00-000Z-abc123');
});

test('parseArgs: feedback --run-id defaults to null and requires a value', () => {
  assert.equal(
    parseArgs(['feedback', 'add', '--type', 'accepted', '--skill', 's']).feedbackRunId,
    null
  );
  const missing = parseArgs(['feedback', 'add', '--type', 'accepted', '--skill', 's', '--run-id']);
  assert.equal(
    missing.usageError,
    true,
    '--run-id without a value raises a usage error (#1709 S2)'
  );
});

test('parseArgs: feedback --run-id does not consume a following flag as its value', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'accepted',
    '--skill',
    's',
    '--run-id',
    '--reviewer',
    'gemini',
  ]);
  assert.equal(parsed.usageError, true, 'next flag is not eaten as the value');
  assert.equal(parsed.feedbackRunId, null);
});

// The two silent-miss paths: both exited 0 and wrote an entry with no
// review_run_id, so the loss only showed up later as joinedFeedbackCount 0.

test('parseArgs: feedback --run-id=<id> is accepted, not silently dropped', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'false_positive',
    '--skill',
    'secret-scanner',
    '--run-id=2026-07-25T00-00-00-000Z-abc123',
  ]);
  assert.equal(parsed.command, 'feedback', 'the equals form does not fall through to help');
  assert.equal(parsed.feedbackRunId, '2026-07-25T00-00-00-000Z-abc123');
});

test('parseArgs: feedback --run-id rejects a whitespace-only value instead of nulling it', () => {
  for (const value of ['   ', '\t', '']) {
    const parsed = parseArgs([
      'feedback',
      'add',
      '--type',
      'accepted',
      '--skill',
      's',
      '--run-id',
      value,
    ]);
    assert.equal(
      parsed.usageError,
      true,
      `--run-id ${JSON.stringify(value)} raises a usage error (#1709 S2)`
    );
    assert.equal(parsed.feedbackRunId, null);
  }
});

test('parseArgs: feedback --run-id= with a blank or missing value raises a usage error (#1709 S2)', () => {
  for (const arg of ['--run-id=', '--run-id=   ']) {
    const parsed = parseArgs(['feedback', 'add', '--type', 'accepted', '--skill', 's', arg]);
    assert.equal(parsed.usageError, true, `${arg} raises a usage error (#1709 S2)`);
    assert.equal(parsed.feedbackRunId, null);
  }
});

test('parseArgs: the equals form stays scoped to --run-id (other options unchanged)', () => {
  // --reviewer=gemini is NOT supported: it must keep falling through to the
  // shared parser exactly as before this change.
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'accepted',
    '--skill',
    's',
    '--reviewer=gemini',
  ]);
  assert.equal(parsed.feedbackReviewer, null, '--reviewer= keeps its pre-existing behaviour');
});

// --- #1717: feedback add --pr strict parse + value guards on the siblings ---

test('parseArgs: feedback add parses --pr as a number', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'false_positive',
    '--skill',
    'secret-scanner',
    '--pr',
    '123',
  ]);
  assert.equal(parsed.command, 'feedback');
  assert.equal(parsed.feedbackPrNumber, 123);
});

test('parseArgs: feedback --pr accepts only positive integers', () => {
  // 'abc' / '0' / '-5' / '' used to be dropped in silence (pr:null on an entry
  // that was still written), and parseInt kept the numeric prefix of '1.5' and
  // '12abc', recording a pr that was never typed.
  for (const value of ['abc', '0', '-5', '1.5', '12abc', '', '   ', '+7', '0x10', '1e3']) {
    const parsed = parseArgs([
      'feedback',
      'add',
      '--type',
      'accepted',
      '--skill',
      's',
      '--pr',
      value,
    ]);
    assert.equal(
      parsed.usageError,
      true,
      `--pr ${JSON.stringify(value)} raises a usage error (#1709 S2)`
    );
    assert.equal(parsed.feedbackPrNumber, null);
  }
});

test('parseArgs: feedback --pr requires a value and does not eat the next flag', () => {
  const missing = parseArgs(['feedback', 'add', '--type', 'accepted', '--skill', 's', '--pr']);
  assert.equal(missing.usageError, true, '--pr without a value raises a usage error (#1709 S2)');
  assert.equal(missing.feedbackPrNumber, null);

  const eaten = parseArgs([
    'feedback',
    'add',
    '--type',
    'accepted',
    '--skill',
    's',
    '--pr',
    '--evidence',
    'x',
  ]);
  assert.equal(eaten.usageError, true, 'the following flag is not consumed as the value');
  assert.equal(eaten.feedbackPrNumber, null);
  assert.equal(eaten.feedbackEvidence, null, '--evidence is not swallowed by --pr');
});

test('parseArgs: every feedback add option requires a value', () => {
  for (const flag of ['--type', '--skill', '--trigger', '--fingerprint', '--evidence', '--pr']) {
    const parsed = parseArgs(['feedback', 'add', flag]);
    assert.equal(
      parsed.usageError,
      true,
      `${flag} without a value raises a usage error (#1709 S2)`
    );
  }
});

test('parseArgs: feedback add options do not consume a following flag as their value', () => {
  const fields = {
    '--type': 'feedbackType',
    '--skill': 'feedbackSkillId',
    '--trigger': 'feedbackTrigger',
    '--fingerprint': 'feedbackFingerprint',
    '--evidence': 'feedbackEvidence',
  };
  for (const [flag, field] of Object.entries(fields)) {
    const parsed = parseArgs(['feedback', 'add', flag, '--pr', '123']);
    assert.equal(parsed.usageError, true, `${flag} does not eat --pr`);
    assert.equal(parsed[field], null);
    assert.equal(parsed.feedbackPrNumber, null, `${flag} does not drop the following --pr either`);
  }
});

test('parseArgs: valid feedback add options are unchanged', () => {
  const parsed = parseArgs([
    'feedback',
    'add',
    '--type',
    'false_positive',
    '--skill',
    'secret-scanner',
    '--trigger',
    'self-review',
    '--fingerprint',
    'a1b2c3d4e5f60718',
    '--evidence',
    'test fixture already covers this path',
    '--pr',
    '1717',
  ]);
  assert.equal(parsed.command, 'feedback');
  assert.equal(parsed.feedbackType, 'false_positive');
  assert.equal(parsed.feedbackSkillId, 'secret-scanner');
  assert.equal(parsed.feedbackTrigger, 'self-review');
  assert.equal(parsed.feedbackFingerprint, 'a1b2c3d4e5f60718');
  assert.equal(parsed.feedbackEvidence, 'test fixture already covers this path');
  assert.equal(parsed.feedbackPrNumber, 1717);
});

// ---------------------------------------------------------------------------
// #1753 B1: `--phase` の大小無視は normalizePhase の契約と一致していること
// ---------------------------------------------------------------------------
// #1746 の hotfix 初版が `--phase Upstream` を誤拒否した（v1.72.0 では exit 0）。
// parse 層の検証を自己整合で確かめても意味がないので、実際に phase を消費する
// production の経路（src/lib/local-runner.mjs の normalizePhase。大小無視は
// tests/local-runner-internals.test.mjs が pin 済み）と突き合わせる。
test('parseArgs --phase agrees with normalizePhase for every case variant', () => {
  for (const phase of PHASES) {
    for (const variant of [phase, phase.toUpperCase(), phase[0].toUpperCase() + phase.slice(1)]) {
      const parsed = parseArgs(['run', '.', '--phase', variant]);
      assert.equal(parsed.usageError, false, `--phase ${variant} を誤拒否した`);
      assert.equal(
        parsed.phase,
        normalizePhase(variant),
        `--phase ${variant} の正規化が normalizePhase と一致しない`
      );
    }
  }
});

test('parseArgs --phase rejects a value normalizePhase would silently default', () => {
  // normalizePhase は不正値を midstream に落とす。parse 層はそこを拒否する側に
  // 立つ（黙って別 phase をレビューさせない）ので、契約が分かれるのはここだけ。
  const parsed = parseArgs(['run', '.', '--phase', 'BOGUS']);
  assert.equal(parsed.usageError, true);
  assert.equal(normalizePhase('BOGUS'), 'midstream');
});

// ---------------------------------------------------------------------------
// #1797: KNOWN_OPTION_TOKENS の網羅性
// ---------------------------------------------------------------------------
// `KNOWN_OPTION_TOKENS`（src/cli.mjs）は `takeFreeTextValue` が「次のトークンは
// 散文か、それともフラグか」を判定する唯一の材料であり、#1717 が塞いだ契約
// （`--evidence --pr 123` が evidence に "--pr" を書き込む）はこの Set の網羅性に
// 依存している。登録漏れたオプションは、直前の自由記述オプションの値として
// 黙って飲まれ、exit 0 のままエントリが書き込まれる。
//
// この Set にはそれを守るテストが 1 件も無く、実際 #1797 で追加した
// `--fingerprint-algo` が初版で登録漏れしていた（`--rationale --fingerprint-algo`
// が rationale に "--fingerprint-algo" を書き込む状態）。ここでは個別の
// トークンではなく **集合一致** を pin する。parseArgs が `arg === '--xxx'` で
// 比較しているトークンの集合と、Set の中身が完全に一致すること。
//
// 自己整合を避けるためソースを直接読む（Set は module-private で、export すると
// 本番の API 面が増える）。抽出は 2 つの正規表現だけで行い、テスト側に
// トークンの写しを持たない — 写しを持つと、次に増えるオプションで同じ
// 「更新漏れ」が起きるだけになる。
// 比較側の走査は `src/cli.mjs` だけでは足りない。オプション連鎖は
// `src/cli/parse/` へ順次移設しており（リファクタリング Step 4）、移した分を
// 数え落とすと `extra` が誤って膨らむ。ディレクトリごと読むことで、次にどれだけ
// 移しても走査範囲を直さずに済む。宣言側の `KNOWN_OPTION_TOKENS` は
// `src/cli.mjs` に残っているので、そちらは従来どおり 1 ファイルから取る。
test('KNOWN_OPTION_TOKENS covers exactly the tokens parseArgs compares (#1797)', () => {
  const source = readFileSync(new URL('../src/cli.mjs', import.meta.url), 'utf8');
  const parseDir = new URL('../src/cli/parse/', import.meta.url);
  const parseSources = readdirSync(parseDir)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => readFileSync(new URL(name, parseDir), 'utf8'));
  assert.ok(parseSources.length > 0, 'src/cli/parse/ に .mjs が 1 件も無い');
  // コメントを落としてから比較する。走査は正規表現なので、コメント内に書かれた
  // `arg === '--x'` という**説明のための文字列**まで「parseArgs が解釈する
  // トークン」として拾ってしまう。src/cli/parse/ をディレクトリごと読むように
  // した結果、無関係なモジュールの説明コメント 1 行でこの検査が落ちる状態に
  // なっていた（2026-09-09 の範囲レビュー minor、再現済み）。
  const stripComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/.*$/gm, '');
  const comparedSource = [source, ...parseSources].map(stripComments).join('\n');
  const setStart = source.indexOf('const KNOWN_OPTION_TOKENS');
  const setEnd = source.indexOf('function takeFreeTextValue');
  assert.ok(setStart > 0 && setEnd > setStart, 'KNOWN_OPTION_TOKENS の定義が見つからない');
  const declared = new Set(
    [...source.slice(setStart, setEnd).matchAll(/'(--[a-z0-9-]+)'/g)].map((m) => m[1])
  );
  const compared = new Set(
    [...comparedSource.matchAll(/arg === '(--[a-z0-9-]+)'/g)].map((m) => m[1])
  );

  assert.ok(compared.size > 0, 'parseArgs のオプション比較を 1 件も抽出できていない');
  const missing = [...compared].filter((t) => !declared.has(t)).sort();
  const extra = [...declared].filter((t) => !compared.has(t)).sort();
  assert.deepEqual(
    missing,
    [],
    `parseArgs が解釈するのに KNOWN_OPTION_TOKENS に無いオプション: ${missing.join(' ')}`
  );
  assert.deepEqual(
    extra,
    [],
    `KNOWN_OPTION_TOKENS にあるが parseArgs が解釈しないオプション: ${extra.join(' ')}`
  );
});

// 集合一致だけでは「両方に足し忘れた」形は検出できないため、#1717 の失敗形
// そのものも自由記述オプション × 新規オプションの組で pin する。
test('free-text options never swallow --fingerprint-algo as their value (#1717 契約)', () => {
  const parsed = parseArgs([
    'suppression',
    'add',
    '--fingerprint',
    'a'.repeat(16),
    '--feedback',
    'false_positive',
    '--rationale',
    '--fingerprint-algo',
    'v2',
  ]);
  assert.equal(parsed.usageError, true, '--rationale が値欠落として落ちていない');
  assert.notEqual(parsed.suppressionRationale, '--fingerprint-algo');
});

// ---------------------------------------------------------------------------
// EAGER_COMMANDS の集合 pin
// ---------------------------------------------------------------------------
//
// `EAGER_COMMANDS`（src/cli.mjs）は `COMMAND_USAGE` のキーから `eval` / `review`
// を除いて導出している。この形は許可リストではなく **除外リスト** であり、
// 取りこぼしたときの失敗モードが「目に見える usage error」ではなく「黙った
// 誤パース」になる。`COMMAND_USAGE` に新コマンドを足すと、専用ブランチを
// 持つべきコマンドでも自動的に eager ブランチへ先に食われるためである。
// `eval` と `review` がまさにその「専用ブランチを持つべきコマンド」であり、
// 同じ形は将来もう一度出る。src/cli.mjs は黙った誤パースで released
// regression を 2 件出している面（v1.72.0 / v1.72.1）なので、取りこぼしは
// テストで loud にする。
//
// **`COMMAND_USAGE` にコマンドを足すときは、そのコマンドを eager ブランチに
// 入れてよいか（専用ブランチが要らないか）を判断したうえで、下の EXPECTED も
// 同じ PR で更新すること。** 判断せずに通せる状態にはしない。
//
// 期待値は手書きのリテラルであり、`COMMAND_USAGE` から導出していない。導出
// した値と比べると両辺が一緒に動いて自己整合になり、キー追加を検出できなく
// なる（tests/prompt-sections.test.mjs 冒頭の golden と同じ理由）。
test('EAGER_COMMANDS is exactly the 8 commands the eager branch may consume', () => {
  const EXPECTED = [
    'doctor',
    'evolve',
    'feedback',
    'promote',
    'run',
    'runs',
    'skills',
    'suppression',
  ];
  assert.deepEqual(
    [...EAGER_COMMANDS].sort(),
    EXPECTED,
    'eager ブランチが受理するコマンドが変わった。COMMAND_USAGE に足したコマンドを eager にしてよいか判断し、意図どおりならこの期待値を更新すること'
  );
  // 除外側も明示する。この 2 つが EAGER_COMMANDS に入ると、それぞれの専用
  // ブランチ（eval は positional を取らない / review は REVIEW_SUBCOMMANDS で
  // 照合する）より先に eager ブランチが食う。
  for (const excluded of ['eval', 'review']) {
    assert.equal(
      EAGER_COMMANDS.has(excluded),
      false,
      `${excluded} は専用ブランチを持つため eager ブランチに入れてはならない`
    );
  }
});
