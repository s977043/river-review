/**
 * Convergence Efficiency Eval — minimal version (Epic #1171 item4).
 *
 * Measures how efficiently a generate → review → revise loop converges, to
 * quantify the economic value of River Review to a platform team ("with RR vs
 * without RR, how many turns and how much $ to converge?").
 *
 * Pure / deterministic: reads existing signals (issue severities, run diff,
 * usage.estimated_cost_usd) from a fixed run sequence. No LLM, no new telemetry.
 * The CI test exercises only this fixture-based calculation; real LLM
 * benchmarking is a manual exercise.
 */

import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { diffRunHistory } from '../src/lib/review-differ.mjs';
import {
  isIncompleteCoverageStatus,
  normalizeRunCoverageStatus,
} from '../src/lib/review-coverage.mjs';
import { isDirectRun } from './lib/is-direct-run.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CASES = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'convergence-efficiency',
  'cases.json'
);

/** Severities that block convergence. */
const BLOCKING = new Set(['critical', 'major']);

function round4(n) {
  return Math.round((Number(n) || 0) * 1e4) / 1e4;
}

/**
 * Sort run records chronologically (oldest first), NaN-safe with a runId
 * tie-break — mirrors diffRunHistory so the "final run" metrics stay consistent
 * with the internally-sorted oscillation count regardless of input order.
 */
function sortRunsChronologically(runs) {
  return [...runs].sort((a, b) => {
    const ta = a?.timestamp != null ? new Date(a.timestamp).getTime() : NaN;
    const tb = b?.timestamp != null ? new Date(b.timestamp).getTime() : NaN;
    const aNaN = Number.isNaN(ta);
    const bNaN = Number.isNaN(tb);
    if (aNaN && bNaN) return (a?.runId ?? '').localeCompare(b?.runId ?? '');
    if (aNaN) return 1;
    if (bNaN) return -1;
    if (ta !== tb) return ta - tb;
    return (a?.runId ?? '').localeCompare(b?.runId ?? '');
  });
}

/**
 * Compute convergence metrics for a single run sequence.
 *
 * A "run" is a record shaped like `{ runId, timestamp, findings: [{severity,
 * ruleId, file, message, line}], usage: { estimated_cost_usd } }` — the same
 * fields River Review already emits.
 *
 * @param {Array<object>} runs - Chronological run records (oldest first).
 * @returns {{
 *   turnCount: number,
 *   blockingFindingsRemaining: number,
 *   oscillationCount: number,
 *   estimatedCostUsd: number,
 *   converged: boolean,
 * }}
 */
export function evaluateConvergence(runs) {
  // Sort defensively so "final run" metrics match the internally-sorted
  // oscillation count even when the caller passes runs out of order.
  const list = sortRunsChronologically(Array.isArray(runs) ? runs : []);
  const turnCount = list.length;

  const finalFindings = Array.isArray(list[turnCount - 1]?.findings)
    ? list[turnCount - 1].findings
    : [];
  const blockingFindingsRemaining = finalFindings.filter(
    (f) => f != null && BLOCKING.has(f.severity)
  ).length;

  const estimatedCostUsd = round4(
    list.reduce((sum, r) => sum + (Number(r?.usage?.estimated_cost_usd) || 0), 0)
  );

  // Oscillation needs >= 3 runs to detect a present→absent→present pattern.
  const oscillationCount = turnCount >= 3 ? (diffRunHistory(list).oscillated?.length ?? 0) : 0;

  // A zero-finding run is not convergence when its required reviewers failed,
  // timed out or never reached the LLM. Share the same coverage contract as
  // `river runs diff`; missing legacy coverage remains unknown, not incomplete.
  const latestCoverage = normalizeRunCoverageStatus(list[turnCount - 1]);
  const converged =
    turnCount > 0 && blockingFindingsRemaining === 0 && !isIncompleteCoverageStatus(latestCoverage);

  return { turnCount, blockingFindingsRemaining, oscillationCount, estimatedCostUsd, converged };
}

/**
 * Compare a baseline run sequence against a River-Review-assisted one and report
 * the deltas (turns saved, cost delta).
 *
 * @param {{name?: string, description?: string, baseline: object[], treatment: object[]}} testCase
 * @returns {{name: string, baseline: object, treatment: object, delta: object}}
 */
export function compareCase(testCase) {
  const baseline = evaluateConvergence(testCase.baseline);
  const treatment = evaluateConvergence(testCase.treatment);
  return {
    name: testCase.name ?? '(unnamed)',
    baseline,
    treatment,
    delta: {
      turnsSaved: baseline.turnCount - treatment.turnCount,
      blockingDelta: treatment.blockingFindingsRemaining - baseline.blockingFindingsRemaining,
      costDeltaUsd: round4(treatment.estimatedCostUsd - baseline.estimatedCostUsd),
    },
  };
}

/**
 * Evaluate all cases in a cases file.
 * @param {string} [casesPath]
 * @returns {Array<ReturnType<typeof compareCase>>}
 */
export function evaluateCasesFile(casesPath = DEFAULT_CASES) {
  const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
  return cases.map(compareCase);
}

function formatReport(results) {
  const lines = ['# Convergence Efficiency Report', ''];
  for (const r of results) {
    lines.push(`## ${r.name}`);
    lines.push('');
    lines.push('| metric | baseline | with River Review |');
    lines.push('| ------ | -------- | ----------------- |');
    lines.push(`| turns | ${r.baseline.turnCount} | ${r.treatment.turnCount} |`);
    lines.push(
      `| blocking remaining | ${r.baseline.blockingFindingsRemaining} | ${r.treatment.blockingFindingsRemaining} |`
    );
    lines.push(
      `| oscillations | ${r.baseline.oscillationCount} | ${r.treatment.oscillationCount} |`
    );
    lines.push(
      `| est. cost (USD) | ${r.baseline.estimatedCostUsd} | ${r.treatment.estimatedCostUsd} |`
    );
    lines.push(`| converged | ${r.baseline.converged} | ${r.treatment.converged} |`);
    lines.push('');
    lines.push(`→ turns saved: ${r.delta.turnsSaved}, cost delta: ${r.delta.costDeltaUsd} USD`);
    lines.push('');
  }
  return lines.join('\n');
}

if (isDirectRun(import.meta.url)) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--cases');
  const casesPath = idx >= 0 && args[idx + 1] ? args[idx + 1] : DEFAULT_CASES;
  const results = evaluateCasesFile(casesPath);
  process.stdout.write(formatReport(results) + '\n');
}
