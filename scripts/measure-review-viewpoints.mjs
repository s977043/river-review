#!/usr/bin/env node
// Review Viewpoint effectiveness measurement (#2252 Phase 8).
//
// Measures, for the single Skill that owns a viewpoints.yaml today
// (api-compatibility):
//   1. activation precision / recall against the hand-labeled corpus in
//      tests/fixtures/review-viewpoints/corpus.mjs
//   2. comment delta between review.viewpoints.mode off / observe / active
//   3. prompt size delta (characters; token count is provider-specific and is
//      not estimated here)
//   4. stage latency delta
//
// What it deliberately does NOT measure: anything that requires an LLM call.
// This repository runs without an API key, so the semantic review layer never
// executes and finding precision/recall cannot be observed here. The comment
// delta below therefore compares the dry-run fallback comment set, which proves
// only that the non-LLM output path is byte-identical across modes.
//
// Usage:
//   node scripts/measure-review-viewpoints.mjs              # human-readable report
//   node scripts/measure-review-viewpoints.mjs --json       # machine-readable
//   node scripts/measure-review-viewpoints.mjs --reps 200   # latency repetitions
//
// The default 15 repetitions leave run-to-run latency noise about as large as
// the off/observe difference; use --reps 200 to reproduce the documented number.

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { generateReview } from '../src/lib/review-engine.mjs';
import { runReviewViewpointStage } from '../src/lib/review-viewpoint-stage.mjs';
import { corpus, VIEWPOINT_IDS } from '../tests/fixtures/review-viewpoints/corpus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const SKILL_ID = 'api-compatibility';
const apiCompatibilitySkillPath = path.join(repoRoot, 'skills', 'midstream', SKILL_ID, 'SKILL.md');

// The plan is forced rather than produced by selectSkills(): this measurement is
// about viewpoint activation given a selected Skill, not about Skill routing.
function reviewPlan() {
  return {
    selected: [
      {
        metadata: {
          id: SKILL_ID,
          name: 'API Compatibility and Test Gap Review',
          phase: 'midstream',
          severity: 'major',
          modelHint: 'high-accuracy',
        },
        path: apiCompatibilitySkillPath,
      },
    ],
  };
}

function parse(diffText) {
  return { ...parseUnifiedDiff(diffText), diffText };
}

function reviewConfig(mode) {
  return { review: { viewpoints: { mode } } };
}

function stripSkillPrefix(id) {
  return id.startsWith(`${SKILL_ID}/`) ? id.slice(SKILL_ID.length + 1) : id;
}

async function activatedViewpointIds(diff) {
  const stage = await runReviewViewpointStage({
    reviewConfig: reviewConfig('observe').review,
    diff,
    plan: reviewPlan(),
  });
  const ids = (stage?.observation?.skills ?? []).flatMap((skill) => skill.activatedViewpointIds);
  return [...new Set(ids.map(stripSkillPrefix))].sort();
}

function emptyCounts() {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function scoreFrom(counts) {
  const precision = rate(counts.tp, counts.tp + counts.fp);
  const recall = rate(counts.tp, counts.tp + counts.fn);
  return { ...counts, precision, recall };
}

export async function measureActivation() {
  const perViewpoint = new Map(VIEWPOINT_IDS.map((id) => [id, emptyCounts()]));
  const overall = emptyCounts();
  const perFixture = [];

  for (const fixture of corpus) {
    const diff = parse(fixture.diff);
    const actual = await activatedViewpointIds(diff);
    const expected = [...fixture.expectedViewpointIds].sort();

    for (const viewpointId of VIEWPOINT_IDS) {
      const isExpected = expected.includes(viewpointId);
      const isActual = actual.includes(viewpointId);
      const bucket = isExpected && isActual ? 'tp' : isExpected ? 'fn' : isActual ? 'fp' : 'tn';
      perViewpoint.get(viewpointId)[bucket] += 1;
      overall[bucket] += 1;
    }

    perFixture.push({
      id: fixture.id,
      shape: fixture.shape,
      knownMiss: Boolean(fixture.knownMiss),
      expected,
      actual,
      match: expected.join(',') === actual.join(','),
    });
  }

  return {
    overall: scoreFrom(overall),
    perViewpoint: Object.fromEntries(
      [...perViewpoint].map(([id, counts]) => [id, scoreFrom(counts)])
    ),
    perFixture,
  };
}

async function runMode(fixture, mode) {
  const started = process.hrtime.bigint();
  const result = await generateReview({
    diff: parse(fixture.diff),
    plan: reviewPlan(),
    phase: 'midstream',
    dryRun: true,
    includeFallback: true,
    config: reviewConfig(mode),
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { result, elapsedMs };
}

function fingerprintComments(comments = []) {
  return JSON.stringify(
    comments.map((comment) => ({
      file: comment.file ?? null,
      line: comment.line ?? null,
      severity: comment.severity ?? null,
      message: comment.message ?? comment.body ?? null,
    }))
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function measureModes({ repetitions = 15 } = {}) {
  const modes = ['off', 'observe', 'active'];
  const perFixture = [];
  const latency = Object.fromEntries(modes.map((mode) => [mode, []]));

  for (const fixture of corpus) {
    const row = { id: fixture.id, modes: {} };
    for (const mode of modes) {
      const { result } = await runMode(fixture, mode);
      row.modes[mode] = {
        promptChars: result.prompt.length,
        commentCount: (result.comments ?? []).length,
        fingerprint: fingerprintComments(result.comments),
      };
    }
    row.findingsIdentical =
      row.modes.off.fingerprint === row.modes.observe.fingerprint &&
      row.modes.off.fingerprint === row.modes.active.fingerprint;
    row.promptDelta = {
      observe: row.modes.observe.promptChars - row.modes.off.promptChars,
      active: row.modes.active.promptChars - row.modes.off.promptChars,
    };
    perFixture.push(row);
  }

  // Latency is measured on the fixture that activates the most obligations, so
  // the number is the worst realistic case for one Skill rather than an average
  // diluted by no-activation fixtures.
  const heaviest = corpus.find((fixture) => fixture.id === 'p08-mixed-diff-contract-plus-noise');
  for (let i = 0; i < repetitions; i += 1) {
    for (const mode of modes) {
      const { elapsedMs } = await runMode(heaviest, mode);
      latency[mode].push(elapsedMs);
    }
  }

  const activeRows = perFixture.filter((row) => row.promptDelta.active > 0);
  return {
    perFixture,
    findingsIdenticalAcrossModes: perFixture.every((row) => row.findingsIdentical),
    promptCharDelta: {
      observeMax: Math.max(...perFixture.map((row) => row.promptDelta.observe)),
      activeMin: activeRows.length
        ? Math.min(...activeRows.map((row) => row.promptDelta.active))
        : 0,
      activeMax: Math.max(...perFixture.map((row) => row.promptDelta.active)),
      activeFixturesWithInjection: activeRows.length,
      activeFixtureCount: perFixture.length,
    },
    latencyMs: {
      repetitions,
      fixture: heaviest.id,
      medianOff: median(latency.off),
      medianObserve: median(latency.observe),
      medianActive: median(latency.active),
    },
  };
}

function formatRate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const repsIndex = process.argv.indexOf('--reps');
  const reps = repsIndex === -1 ? undefined : Number.parseInt(process.argv[repsIndex + 1], 10);
  if (repsIndex !== -1 && (!Number.isInteger(reps) || reps < 1)) {
    throw new Error('--reps requires a positive integer');
  }

  const activation = await measureActivation();
  const modes = await measureModes(reps === undefined ? {} : { repetitions: reps });
  const report = { skillId: SKILL_ID, corpusSize: corpus.length, activation, modes };

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const lines = [];
  lines.push(`# Review Viewpoint measurement (${SKILL_ID})`);
  lines.push(`corpus: ${corpus.length} hand-labeled fixtures`);
  lines.push('');
  lines.push('## Activation (per fixture x viewpoint pair)');
  lines.push(
    `overall: precision ${formatRate(activation.overall.precision)} recall ${formatRate(
      activation.overall.recall
    )} (tp=${activation.overall.tp} fp=${activation.overall.fp} fn=${activation.overall.fn} tn=${activation.overall.tn})`
  );
  for (const [id, score] of Object.entries(activation.perViewpoint)) {
    lines.push(
      `  ${id}: precision ${formatRate(score.precision)} recall ${formatRate(score.recall)} (tp=${score.tp} fp=${score.fp} fn=${score.fn} tn=${score.tn})`
    );
  }
  lines.push('');
  lines.push('## Per fixture');
  for (const row of activation.perFixture) {
    lines.push(
      `  ${row.match ? 'OK  ' : 'MISS'} ${row.id} [${row.shape}] expected=[${row.expected.join(' ')}] actual=[${row.actual.join(' ')}]${row.knownMiss ? ' (labeled knownMiss)' : ''}`
    );
  }
  lines.push('');
  lines.push('## Mode comparison');
  lines.push(`findings identical across off/observe/active: ${modes.findingsIdenticalAcrossModes}`);
  lines.push(`prompt chars delta observe (max): ${modes.promptCharDelta.observeMax}`);
  lines.push(
    `prompt chars delta active: min ${modes.promptCharDelta.activeMin} / max ${modes.promptCharDelta.activeMax} over ${modes.promptCharDelta.activeFixturesWithInjection}/${modes.promptCharDelta.activeFixtureCount} fixtures with injection`
  );
  lines.push(
    `latency median ms (${modes.latencyMs.fixture}, n=${modes.latencyMs.repetitions}): off ${modes.latencyMs.medianOff.toFixed(2)} / observe ${modes.latencyMs.medianObserve.toFixed(2)} / active ${modes.latencyMs.medianActive.toFixed(2)}`
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

// Direct-execution guard: realpath first so a symlinked invocation still matches.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  await main();
}
