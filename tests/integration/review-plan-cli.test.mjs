// tests/integration/review-plan-cli.test.mjs
//
// `river review plan --plan-only` の CLI 統合 E2E (#802 Phase 3 slice 2)。
//
// slice 1 (#839) で配線した公開エントリポイントを、PlanGate 風の artifact
// fixture に対して end-to-end で検証する。skill/planner 実行・破壊的契約変更
// は対象外。resolver の網羅的優先順テストは tests/artifact-resolver.test.mjs
// が担い、ここは「CLI として通る」代表ケースに絞る。
//
// 出力捕捉の注意: src/cli.mjs の review plan は --output-file 未指定時
// process.stdout.write で JSON を書き出す。runCliInProcess は console のみ
// 捕捉し process.stdout.write を捕捉しない（helpers/cli.mjs 参照）ため、
// in-process E2E は --output-file + ファイル読取で検証し、stdout 直接出力の
// 検証は runCliAsSubprocess を 1 本使う。
// (技術的負債: --output-file 非依存の stdout 捕捉は別 slice で扱う。)

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { runCliInProcess, runCliAsSubprocess } from '../helpers/cli.mjs';
import { createTempDir, cleanupTempDir } from '../helpers/temp-dir.mjs';
import { compileReviewArtifactValidator } from '../helpers/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '..', 'fixtures', 'plangate-review-artifacts');
const validate = compileReviewArtifactValidator();

/** Lay the PlanGate fixture out into a fresh temp repo root. */
function setupRepo(t, { withConfig = false } = {}) {
  const dir = createTempDir({ prefix: 'rr-review-plan-e2e-' });
  t.after(() => cleanupTempDir(dir));
  for (const f of ['plan.md', 'todo.md', 'todo-from-config.md', 'diff.patch']) {
    copyFileSync(join(FIXTURE, f), join(dir, f));
  }
  if (withConfig) {
    copyFileSync(join(FIXTURE, 'config', '.river-review.json'), join(dir, '.river-review.json'));
  }
  return dir;
}

describe('river review plan --plan-only — CLI E2E (#802 Phase 3)', () => {
  test('emits a schema-valid v1 Review Artifact to --output-file (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'review-artifact.json');
    const result = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--phase', 'upstream', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);

    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.version, '1');
    assert.equal(artifact.phase, 'upstream');
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.findings, []);
    assert.equal(artifact.plan.plannerMode, 'off');
    assert.equal('debug' in artifact, false);
  });

  test('--entry <name> keeps the artifact schema-valid with the appended flow pin (#2054 PR-3)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'entry.json');
    const result = await runCliInProcess(
      [
        'review',
        'plan',
        '--plan-only',
        '--phase',
        'upstream',
        '--entry',
        'review-plan',
        '--output-file',
        out,
      ],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);

    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.flow.entry, 'review-plan');
    assert.equal(artifact.flow.id, 'plan-review');
    assert.match(artifact.flow.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(artifact.evidenceRequirements));
    // The schema must actually know the field: an artifact carrying an
    // ill-formed pin is rejected, so `additionalProperties: false` on `flow`
    // and the sha256 pattern are live, not decorative.
    const broken = structuredClone(artifact);
    broken.flow.sha256 = 'not-a-digest';
    assert.equal(validate(broken), false);
  });

  test('review exec --entry <name> keeps the artifact schema-valid with the appended steps (#2011 AC7 P2)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'exec-entry.json');
    const result = await runCliInProcess(
      [
        'review',
        'exec',
        '--phase',
        'upstream',
        '--entry',
        'review-plan',
        '--debug',
        '--output-file',
        out,
      ],
      { cwd: dir, env: { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' } }
    );
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.ok(Array.isArray(artifact.steps) && artifact.steps.length > 0);
    // The schema must actually know `steps`: an unknown outcome is rejected.
    const broken = structuredClone(artifact);
    broken.steps[0].outcome = 'not-an-outcome';
    assert.equal(validate(broken), false);
  });

  test('--debug attaches resolvedArtifacts with cwd-default resolution', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'a.json');
    const result = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--phase', 'upstream', '--debug', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);

    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true);
    const resolved = artifact.debug.resolvedArtifacts;
    assert.equal(resolved.plan.source, 'cwd');
    assert.equal(resolved.plan.exists, true);
    assert.ok(resolved.plan.path.endsWith('plan.md'));
    // No config, no CLI override: todo also resolves via cwd default.
    assert.equal(resolved.todo.source, 'cwd');
    // An unconfigured, absent artifact resolves to null/source:null.
    assert.equal(resolved.coverage.source, null);
    assert.equal(resolved.coverage.exists, false);
  });

  test('config tier wins over cwd default; CLI --artifact wins over config', async (t) => {
    const dir = setupRepo(t, { withConfig: true });

    // Config only: artifacts.todo → todo-from-config.md (config tier).
    const out1 = join(dir, 'cfg.json');
    const r1 = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--phase', 'upstream', '--debug', '--output-file', out1],
      { cwd: dir }
    );
    assert.equal(r1.code, 0, r1.stderr);
    const a1 = JSON.parse(readFileSync(out1, 'utf8'));
    assert.equal(a1.debug.resolvedArtifacts.todo.source, 'config');
    assert.ok(a1.debug.resolvedArtifacts.todo.path.endsWith('todo-from-config.md'));

    // CLI --artifact overrides the config tier.
    const out2 = join(dir, 'cli.json');
    const r2 = await runCliInProcess(
      [
        'review',
        'plan',
        '--plan-only',
        '--phase',
        'upstream',
        '--artifact',
        'todo=todo.md',
        '--debug',
        '--output-file',
        out2,
      ],
      { cwd: dir }
    );
    assert.equal(r2.code, 0, r2.stderr);
    const a2 = JSON.parse(readFileSync(out2, 'utf8'));
    assert.equal(a2.debug.resolvedArtifacts.todo.source, 'cli');
    assert.ok(a2.debug.resolvedArtifacts.todo.path.endsWith('todo.md'));
  });

  // #1746 W2 の hotfix で `--phase` は parse 層で検証するようになった。以前は
  // parse を素通りしてハンドラ (buildReviewPlan の VALID_PHASES) が exit 3 の
  // 設定エラーとして返していたが、`run` / `skills` では同じ不正値が exit 0 で
  // 既定 (midstream) へ黙って落ちるという非対称があった。#1709 の
  // 「usage error は exit 1」契約へ揃える。
  // ハンドラ側の検証は死にコードにならない: `RIVER_PHASE` 由来の phase と
  // ライブラリ経由の buildReviewPlan 呼び出しは parse 層を通らない。
  test('invalid --phase exits 1 as a usage error', async (t) => {
    const dir = setupRepo(t);
    const result = await runCliInProcess(['review', 'plan', '--plan-only', '--phase', 'bogus'], {
      cwd: dir,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--phase must be one of/);
  });

  test('missing --plan-only exits 3', async (t) => {
    const dir = setupRepo(t);
    const result = await runCliInProcess(['review', 'plan', '--phase', 'upstream'], { cwd: dir });
    assert.equal(result.code, 3);
  });

  // One real-subprocess case: exercises actual process.stdout.write +
  // process exit code (which runCliInProcess cannot observe for stdout).
  test('writes a parseable Review Artifact to stdout via subprocess (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const result = await runCliAsSubprocess(
      ['review', 'plan', '--plan-only', '--phase', 'midstream'],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(result.stdout);
    assert.equal(validate(artifact), true, JSON.stringify(artifact));
    assert.equal(artifact.phase, 'midstream');
    assert.equal(artifact.status, 'ok');
  });

  test('--summary-file writes Markdown; JSON artifact unchanged (#802 Phase 3)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'a.json');
    const summary = join(dir, 's.md');
    const result = await runCliInProcess(
      [
        'review',
        'plan',
        '--plan-only',
        '--phase',
        'upstream',
        '--output-file',
        out,
        '--summary-file',
        summary,
      ],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    const md = readFileSync(summary, 'utf8');
    assert.match(md, /^# river review plan/m);
    assert.match(md, /Status: `(ok|no-changes)`/);
    assert.match(md, /## Selected skills \(\d+\)/);
  });

  test('--quiet still emits the JSON artifact to stdout (subprocess, exit 0)', async (t) => {
    const dir = setupRepo(t);
    const result = await runCliAsSubprocess(
      ['review', 'plan', '--plan-only', '--phase', 'midstream', '--quiet'],
      { cwd: dir }
    );
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(result.stdout);
    assert.equal(validate(artifact), true, JSON.stringify(artifact));
  });

  test('--output-file and --summary-file pointing to the same path exits 3', async (t) => {
    const dir = setupRepo(t);
    const same = join(dir, 'same.json');
    const result = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--output-file', same, '--summary-file', same],
      { cwd: dir }
    );
    assert.equal(result.code, 3);
    assert.match(result.stderr, /same path/);
  });

  // --- #802 Phase 3 PR-2: --output / --format contract ---

  test('--output json is accepted (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'o.json');
    const r = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--output', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    assert.equal(validate(JSON.parse(readFileSync(out, 'utf8'))), true);
  });

  test('--format json (alias) is accepted (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'o.json');
    const r = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--format', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
  });

  test('explicit --output text → exit 3 (not implemented)', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', 'plan', '--plan-only', '--output', 'text'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /not implemented/);
  });

  test('--output json --format markdown (conflict) → exit 3', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(
      ['review', 'plan', '--plan-only', '--output', 'json', '--format', 'markdown'],
      { cwd: dir }
    );
    assert.equal(r.code, 3);
    assert.match(r.stderr, /conflicts/);
  });

  test('--output yaml → exit 3 (review disallows yaml)', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', 'plan', '--plan-only', '--output', 'yaml'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
  });

  test('no --output/--format → JSON still emitted (backward compatible, exit 0)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'bc.json');
    const r = await runCliInProcess(['review', 'plan', '--plan-only', '--output-file', out], {
      cwd: dir,
    });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(validate(JSON.parse(readFileSync(out, 'utf8'))), true);
  });

  // --- #802 Phase 3 PR-3: exec/verify parser/dispatch contract ---

  // exec without --plan and without --dry-run (#802 Phase 3 A2-1):
  // resolves artifacts, builds the execution plan with llmEnabled:true so
  // non-heuristic skills can be selected, and calls generateReview to
  // populate findings via the LLM-or-heuristic pipeline. Without an API
  // key the LLM is skipped and findings stay empty, but the structure is
  // exercised end-to-end and `debug.execution` captures the wiring.
  test('review exec --output json (no flags): exit 0 with execution trace', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'exec-execute.json');
    const r = await runCliInProcess(
      [
        'review',
        'exec',
        '--phase',
        'upstream',
        '--debug',
        '--output',
        'json',
        '--output-file',
        out,
      ],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(a), true, JSON.stringify(validate.errors));
    assert.equal(a.version, '1');
    assert.equal(a.phase, 'upstream');
    assert.ok(Array.isArray(a.findings), 'findings must be an array');
    assert.equal(
      a.debug?.executionDeferred,
      undefined,
      'executionDeferred must NOT be set in A2-1'
    );
    assert.ok(a.debug?.execution, 'debug.execution must record the run');
    assert.equal(typeof a.debug.execution.skillsExecuted, 'number');
    assert.equal(typeof a.debug.execution.findingsCount, 'number');
  });

  test('review exec --dry-run keeps the deterministic plan path (no execution trace)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'exec-dry.json');
    const r = await runCliInProcess(
      ['review', 'exec', '--dry-run', '--debug', '--output', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(a.debug?.executionDeferred, undefined);
    assert.equal(a.debug?.execution, undefined, '--dry-run must not populate execution trace');
    assert.ok(a.debug?.resolvedArtifacts);
  });

  // #802 Phase 3 A2-fix-1: availableContexts propagation. Without this,
  // every skill that declares `inputContext: ['diff']` was silently
  // skipped by buildExecutionPlan. With CLI --context, callers can extend
  // the default ['diff'] set without env vars.
  test('review exec --context diff,tests forwards through to plan selection', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'exec-ctx.json');
    const r = await runCliInProcess(
      [
        'review',
        'exec',
        '--context',
        'diff,tests',
        '--debug',
        '--output',
        'json',
        '--output-file',
        out,
      ],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(a), true, JSON.stringify(validate.errors));
    // The plan path stays schema-compliant (availableContexts is debug,
    // not surfaced on the artifact). The behavioral effect is that
    // inputContext-requiring skills are no longer auto-skipped — see
    // unit tests in tests/cli-review-plan.test.mjs for the exact wiring.
    assert.ok(a.debug?.execution, 'debug.execution must still record the run');
  });

  // verify still has no replay/execution path.
  test('review verify --plan ./plan.json --output json: not implemented (exit 3)', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(
      ['review', 'verify', '--plan', './plan.json', '--output', 'json'],
      { cwd: dir }
    );
    assert.equal(r.code, 3);
    assert.match(r.stderr, /not implemented yet/);
    assert.match(r.stderr, /cli-review-verify-spec/);
  });

  for (const sub of ['exec', 'verify']) {
    test(`review ${sub} --output text → output-contract error (exit 3)`, async (t) => {
      const dir = setupRepo(t);
      const r = await runCliInProcess(['review', sub, '--output', 'text'], { cwd: dir });
      assert.equal(r.code, 3);
      assert.match(r.stderr, /not implemented/);
    });

    test(`review ${sub} --output json --format markdown (conflict) → exit 3`, async (t) => {
      const dir = setupRepo(t);
      const r = await runCliInProcess(['review', sub, '--output', 'json', '--format', 'markdown'], {
        cwd: dir,
      });
      assert.equal(r.code, 3);
      assert.match(r.stderr, /conflicts/);
    });
  }

  // #1755: an unknown or missing subcommand is a usage error (exit 1), not the
  // exit 3 this project reserves for the `--gate` ESCALATE decision. The
  // message names the vocabulary and states that the subcommand may be written
  // on either side of the options.
  test('unknown review subcommand → exit 1 with guidance', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', 'bogus'], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /is not a river review subcommand/);
    assert.match(r.stderr, /before or after the options/);
  });

  test('missing review subcommand → exit 1 with guidance', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', '--plan-only'], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /requires a subcommand/);
  });

  test('review subcommand written after the options is resolved (#1755)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'flag-first.json');
    const r = await runCliInProcess(['review', '--plan-only', '--output-file', out, 'plan'], {
      cwd: dir,
    });
    assert.equal(r.code, 0);
    assert.equal(existsSync(out), true);
  });

  // --- #802 Phase 3: review exec --dry-run foundation ---

  test('review exec --dry-run emits a schema-valid v1 artifact (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'exec.json');
    const r = await runCliInProcess(
      [
        'review',
        'exec',
        '--dry-run',
        '--phase',
        'upstream',
        '--output',
        'json',
        '--output-file',
        out,
      ],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.version, '1');
    assert.equal(artifact.phase, 'upstream');
    assert.equal(artifact.plan.plannerMode, 'off');
    assert.deepEqual(artifact.findings, []);
  });

  test('review exec --dry-run --debug attaches resolvedArtifacts', async (t) => {
    const dir = setupRepo(t);
    const out = join(dir, 'execd.json');
    const r = await runCliInProcess(
      ['review', 'exec', '--dry-run', '--debug', '--output', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.ok(a.debug && a.debug.resolvedArtifacts);
  });

  // --- #802 Phase 3: review exec --plan <path> replay foundation ---

  /** Write a minimal valid plan JSON to the test repo and return its path. */
  function writePlan(dir, plan) {
    const out = join(dir, 'replay-source.json');
    writeFileSync(out, JSON.stringify(plan), 'utf8');
    return out;
  }

  test('review exec --plan replays a full Review Artifact (exit 0)', async (t) => {
    const dir = setupRepo(t);
    const planPath = writePlan(dir, {
      version: '1',
      timestamp: '2026-05-19T00:00:00Z',
      phase: 'upstream',
      status: 'ok',
      findings: [],
      plan: {
        plannerMode: 'off',
        selectedSkills: [{ id: 'rr-upstream-x', name: 'X', phase: 'upstream', modelHint: 'cheap' }],
        skippedSkills: [],
      },
    });
    const out = join(dir, 'replay.json');
    const r = await runCliInProcess(
      ['review', 'exec', '--plan', planPath, '--output', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const artifact = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.phase, 'upstream', 'phase echoed from source plan');
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.findings, []);
    assert.equal(artifact.plan.selectedSkills[0].id, 'rr-upstream-x');
  });

  test('review exec --plan --debug attaches replay metadata', async (t) => {
    const dir = setupRepo(t);
    const planPath = writePlan(dir, {
      version: '1',
      timestamp: '2026-05-19T00:00:00Z',
      phase: 'midstream',
      status: 'ok',
      findings: [],
      plan: { plannerMode: 'off', selectedSkills: [{ id: 's', name: 'S' }], skippedSkills: [] },
    });
    const out = join(dir, 'replay-d.json');
    const r = await runCliInProcess(
      ['review', 'exec', '--plan', planPath, '--debug', '--output', 'json', '--output-file', out],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(a.debug?.replay?.source, planPath);
    assert.equal(a.debug.replay.sourcePhase, 'midstream');
    assert.equal(a.debug.replay.sourceTimestamp, '2026-05-19T00:00:00Z');
  });

  test('review exec --plan with missing file → exit 3', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(
      ['review', 'exec', '--plan', './nope.json', '--output', 'json'],
      { cwd: dir }
    );
    assert.equal(r.code, 3);
    assert.match(r.stderr, /Failed to read/);
  });

  test('review exec --plan with malformed JSON → exit 3', async (t) => {
    const dir = setupRepo(t);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json', 'utf8');
    const r = await runCliInProcess(['review', 'exec', '--plan', bad, '--output', 'json'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /Failed to parse/);
  });

  test('review exec --plan with missing plan.selectedSkills → exit 3', async (t) => {
    const dir = setupRepo(t);
    const bad = writePlan(dir, { plannerMode: 'off' });
    const r = await runCliInProcess(['review', 'exec', '--plan', bad, '--output', 'json'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /selectedSkills/);
  });

  test('review exec --plan replay ignores CLI --phase (source plan is authoritative)', async (t) => {
    const dir = setupRepo(t);
    const planPath = writePlan(dir, {
      version: '1',
      timestamp: '2026-05-19T00:00:00Z',
      phase: 'downstream',
      status: 'ok',
      findings: [],
      plan: { plannerMode: 'off', selectedSkills: [{ id: 's', name: 'S' }], skippedSkills: [] },
    });
    const out = join(dir, 'r.json');
    const r = await runCliInProcess(
      [
        'review',
        'exec',
        '--plan',
        planPath,
        '--phase',
        'upstream',
        '--output',
        'json',
        '--output-file',
        out,
      ],
      { cwd: dir }
    );
    assert.equal(r.code, 0, r.stderr);
    const a = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(a.phase, 'downstream', 'CLI --phase must be ignored under --plan replay');
  });

  test('review verify --dry-run → still not implemented (exit 3)', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', 'verify', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /not implemented yet/);
  });

  test('review exec --dry-run --output text → output-contract error (exit 3)', async (t) => {
    const dir = setupRepo(t);
    const r = await runCliInProcess(['review', 'exec', '--dry-run', '--output', 'text'], {
      cwd: dir,
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /not implemented/);
  });
});
