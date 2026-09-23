// tests/cli.test.mjs
//
// river CLI の end-to-end テスト。
// 通常は runCliInProcess() で in-process 実行し、subprocess 経由が必要な
// テスト（process.exitCode の厳密検証）だけ runCliAsSubprocess() を使う。
//
// グルーピング:
//   - river run - dry-run outputs
//   - river run - markdown output
//   - river run - guards & error paths
//   - river doctor
//   - river skills subcommands
//
// 重複していた createRepoWithChange / runCli / runGit は
// tests/helpers/ に統合済み。

import assert from 'node:assert';
import crypto from 'node:crypto';
import { mkdirSync, promises as fsPromises, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test, { describe, mock } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import {
  createTempGitRepo,
  createRepoWithSilentCatchChange,
  runGit,
} from './helpers/temp-repo.mjs';
import { createTempDir, cleanupTempDirAsync } from './helpers/temp-dir.mjs';
import { defaultPaths as skillLoaderPaths } from '../runners/core/skill-loader.mjs';

// Escape every RegExp metacharacter, backslash included (same form as
// scripts/normalize-dist.mjs). Interpolating a raw value into a pattern
// would let `.` or `\\` in the value change what the assertion accepts.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// -----------------------------------------------------------------------------
// river run - dry-run outputs
// -----------------------------------------------------------------------------

describe('river run - dry-run outputs', () => {
  test('emits review comments in dry-run mode', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run', '--debug'], { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /River Review/);
    assert.match(result.stdout, /Review comments/);
    assert.match(result.stdout, /src\/app.js:/);
    assert.match(result.stdout, /LLM:/);
    assert.match(result.stdout, /Changed files/);
  });

  test('falls back gracefully without API key', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--debug'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /River Review/);
    assert.match(
      result.stdout,
      /LLM: LLM API key \(ANTHROPIC_API_KEY \/ OPENAI_API_KEY \/ GOOGLE_API_KEY\) not set/i
    );
    assert.match(result.stdout, /Planner: off/i);
    assert.match(result.stdout, /Review comments/);
  });

  test('reports planner skip reason when requested without API key', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--planner', 'order', '--debug'], {
      cwd: dir,
    });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Planner: order skipped/i);
    assert.match(result.stdout, /OPENAI_API_KEY/i);
  });

  test('injects project rules into prompt when present', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const rulesDir = join(dir, '.river');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, 'rules.md'), '- Use App Router\n- Prefer server components');

    const result = await runCliInProcess(['run', '.', '--dry-run', '--debug'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Project rules: present/);
    assert.match(result.stdout, /Project-specific review rules/i);
  });

  test('reports when there are no changes', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'apply change'], dir);

    const result = await runCliInProcess(['run', '.'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /No changes to review/);
  });
});

// -----------------------------------------------------------------------------
// river run - LLM raw output on parse failure (T64)
// -----------------------------------------------------------------------------
//
// T64: LLM出力が "<file>:<line>: <message>" 形式にパースできず、かつ
// debug.llmError しか出力されないため raw な LLM 応答が全く見えず切り分けが
// できなかった。--debug 実行時は debug.rawLlmOutput（保持済み）を
// printDebugInfo が出力することを確認する。

describe('river run - LLM raw output on parse failure (T64)', () => {
  test('prints raw LLM output when the LLM response cannot be parsed as line comments', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const originalFetch = global.fetch;
    const rawLlmText = 'このPRには重大な問題は見つかりませんでした。詳細は割愛します。';
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: rawLlmText } }] }),
    });

    try {
      const result = await runCliInProcess(['run', '.', '--debug'], {
        cwd: dir,
        env: { OPENAI_API_KEY: 'test-key' },
      });
      assert.strictEqual(result.code, 0, result.stderr);
      assert.match(result.stdout, /LLM error: LLM output could not be parsed/);
      assert.match(result.stdout, /Raw LLM output:/);
      assert.ok(
        result.stdout.includes(rawLlmText),
        `expected stdout to include raw LLM output, got: ${result.stdout}`
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// -----------------------------------------------------------------------------
// river run - markdown output
// -----------------------------------------------------------------------------

describe('river run - markdown output', () => {
  test('supports markdown output for PR comments', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'markdown'], {
      cwd: dir,
    });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /^<!-- river-review -->/);
    assert.match(result.stdout, /## River Review/);
    // #1713: 判定・件数・スコアは本文先頭の 1 行に固定される（旧: 末尾の「### 指摘」節）。
    assert.match(
      result.stdout,
      /\*\*判定: [\w-]+\*\* · .* · スコア \d+\/100 · フェーズ `midstream`/
    );
    // 指摘は severity で 2 分割される。dry-run の nit は minor なので折りたたみ側。
    assert.match(result.stdout, /<summary>軽微・参考の指摘 \(\d+ 件: /);
    // skill id はサニタイズでハイフンがエスケープされる
    assert.match(result.stdout, /#### 🔍 logging\\-observability/);
    assert.doesNotMatch(result.stdout, /--- diff preview ---/);
    assert.match(result.stderr, /River Review \(local\)/);
  });

  test('writes debug output to stderr when markdown output is selected', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(
      ['run', '.', '--dry-run', '--output', 'markdown', '--debug'],
      { cwd: dir }
    );
    assert.strictEqual(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /--- diff preview ---/);
    assert.match(result.stderr, /--- diff preview ---/);
  });
});

// -----------------------------------------------------------------------------
// river run - guards & error paths
// -----------------------------------------------------------------------------

describe('river run - guards & error paths', () => {
  test('skips when PR labels match exclude list', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const configPath = join(dir, '.river-review.json');
    writeFileSync(
      configPath,
      JSON.stringify({ exclude: { prLabelsToIgnore: ['skip-review'] } }, null, 2),
      'utf8'
    );

    const result = await runCliInProcess(['run', '.'], {
      cwd: dir,
      env: { RIVER_PR_LABELS: 'skip-review' },
    });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Review skipped: PR labels matched exclude patterns/);
  });

  test('supports cost estimation only', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--estimate'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Cost Estimate/);
  });

  test('aborts when max-cost is exceeded', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--max-cost', '0.0001'], { cwd: dir });
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stdout + result.stderr, /exceeds max-cost/i);
  });

  test('rejects negative max-cost value', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--max-cost', '-1'], { cwd: dir });
    // #1709 Slice 2: usage error は exit 1 + stderr 要約（help 全文は stdout に出さない）
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /requires a non-negative numeric value/i);
    assert.doesNotMatch(result.stdout, /Usage: river <command>/);
  });

  test('skips markdown-only changes after optimization', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-cli-md-',
      initialFiles: { 'README.md': '# first\n' },
      changedFiles: { 'README.md': '# second\n' },
    });
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /No changes to review/);
  });

  test('fails gracefully outside git repos', async (t) => {
    const dir = createTempDir({ prefix: 'river-cli-empty-' });
    t.after(() => cleanupTempDirAsync(dir));
    mkdirSync(resolve(dir, 'nested'));

    const result = await runCliInProcess(['run', '.'], { cwd: dir });
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /Not a git repository/);
  });
});

// -----------------------------------------------------------------------------
// river doctor
// -----------------------------------------------------------------------------

describe('river doctor', () => {
  test('reports basic setup status', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['doctor', '.', '--debug'], { cwd: dir });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /River Review doctor/);
    assert.match(result.stdout, /Skills loaded:/);
    assert.match(result.stdout, /Merge base:/);
    assert.match(result.stdout, /--- diff preview ---/);
  });

  test('fails gracefully outside git repos', async (t) => {
    const dir = createTempDir({ prefix: 'river-cli-empty-' });
    t.after(() => cleanupTempDirAsync(dir));
    mkdirSync(resolve(dir, 'nested'));

    const result = await runCliInProcess(['doctor', '.'], { cwd: dir });
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /Not a git repository/);
  });
});

// -----------------------------------------------------------------------------
// extracted subcommand handlers route errors through main()'s outer catch
// -----------------------------------------------------------------------------
//
// Regression guard for PR #1592 (adversarial review BLOCKER): the subcommand
// dispatch in main() must use `return await runXxxCommand(...)`, not a bare
// `return`. A bare return settles the handler promise OUTSIDE main()'s
// try/catch, so a GitRepoNotFoundError (thrown by ensureGitRepo inside the
// handler) escapes as a raw stack trace / unhandledRejection instead of the
// friendly "Not a git repository" message + Hints. These tests assert the
// friendly path (message + Hints, exit 1) and that no raw stack trace leaks.
describe('river extracted subcommands - error routing (PR #1592)', () => {
  // Each argv reaches ensureGitRepo(targetPath) inside its handler.
  const cases = [
    { name: 'skills', argv: ['skills', '.'] },
    {
      name: 'suppression add',
      argv: [
        'suppression',
        'add',
        '--fingerprint',
        '0123456789abcdef',
        '--feedback',
        'false_positive',
        '--rationale',
        'regression guard',
      ],
    },
    {
      name: 'feedback add',
      argv: ['feedback', 'add', '--type', 'false_positive', '--skill', 'some-skill'],
    },
  ];

  for (const { name, argv } of cases) {
    test(`${name} fails gracefully outside git repos (friendly message, no stack trace)`, async (t) => {
      const dir = createTempDir({ prefix: 'river-cli-empty-' });
      t.after(() => cleanupTempDirAsync(dir));

      const result = await runCliInProcess(argv, { cwd: dir });
      // main()'s outer catch maps GitRepoNotFoundError to a friendly message,
      // exit 1, and appends Hints.
      assert.strictEqual(result.code, 1, result.stderr);
      assert.match(result.stderr, /Not a git repository/);
      assert.match(result.stderr, /Hints:/);
      // A bare `return` regression would surface a raw stack trace: the error
      // class name and "    at <frame>" lines. Neither must appear.
      assert.doesNotMatch(result.stderr, /GitRepoNotFoundError/);
      assert.doesNotMatch(result.stderr, /\n\s+at\s/);
    });
  }
});

// -----------------------------------------------------------------------------
// river skills subcommands
// -----------------------------------------------------------------------------

describe('river skills subcommands', () => {
  test('import --loose --dry-run exits 0 with summary', async () => {
    const fixturesDir = resolve('tests', 'fixtures', 'agent-skills');
    const result = await runCliInProcess(
      ['skills', 'import', '--from', fixturesDir, '--loose', '--dry-run'],
      { cwd: process.cwd() }
    );
    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Import complete/);
  });

  test('list --source rr exits 0 and shows table', async () => {
    const result = await runCliInProcess(['skills', 'list', '--source', 'rr'], {
      cwd: process.cwd(),
    });
    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /ID/);
    assert.match(result.stdout, /Total:/);
  });

  test('import with empty dir emits warning and exits 0', async (t) => {
    const emptyDir = createTempDir({ prefix: 'river-cli-empty-skills-' });
    t.after(() => cleanupTempDirAsync(emptyDir));

    const result = await runCliInProcess(['skills', 'import', '--from', emptyDir, '--dry-run'], {
      cwd: process.cwd(),
    });
    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout + result.stderr, /No Agent Skills/);
  });
});

// -----------------------------------------------------------------------------
// river --help - option definition coverage (#1701)
// -----------------------------------------------------------------------------

describe('river --help - option definition coverage', () => {
  // Extract a named help block (e.g. "Options:") up to the next blank line.
  // The heading must start a line, otherwise "Options:" also matches inside
  // "Skills Subcommand Options:".
  const blockOf = (help, heading) => {
    const start = help.indexOf(`\n${heading}\n`);
    assert.notStrictEqual(start, -1, `help is missing the "${heading}" block`);
    const body = help.slice(start + heading.length + 2);
    const end = body.indexOf('\n\n');
    return end === -1 ? body : body.slice(0, end);
  };

  test('--format is defined in Options with its accepted values', async () => {
    const result = await runCliInProcess(['--help']);
    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    const options = blockOf(result.stdout, 'Options:');
    // Referenced from the `review route` command entry, so it must also be
    // defined here — see #1701 (the `review route` entry alone left the flag
    // undefined for `review plan` / `review exec`).
    assert.match(options, /^ {2}--format <mode>/m);
    assert.match(options, /text\|markdown\|json/);
  });

  test('--path is defined in Skills Subcommand Options', async () => {
    const result = await runCliInProcess(['--help']);
    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    const skillsOptions = blockOf(result.stdout, 'Skills Subcommand Options:');
    // `skills resolve` requires at least one --path, and the Commands entry
    // references it, so the flag needs a definition line too (#1701).
    assert.match(skillsOptions, /^ {2}--path <file>/m);
  });
});

// -----------------------------------------------------------------------------
// river run - JSON output schema conformance (#1154)
// -----------------------------------------------------------------------------

describe('river run - JSON output schema conformance', () => {
  test('--output json conforms to output.schema.json (including prioritySummary)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });

    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);

    // Validate against output.schema.json using ajv (draft 2020-12)
    const { createRequire } = await import('node:module');
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const req = createRequire(import.meta.url);
    const Ajv2020 = req('ajv/dist/2020');
    const schemaPath = fileURLToPath(new URL('../schemas/output.schema.json', import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    // output.schema references review-coverage.schema.json by $id rather than
    // inlining the Review Coverage contract, so the referenced schema has to be
    // registered before compiling or Ajv throws "can't resolve reference".
    const reviewCoverageSchemaPath = fileURLToPath(
      new URL('../schemas/review-coverage.schema.json', import.meta.url)
    );
    const reviewCoverageSchema = JSON.parse(readFileSync(reviewCoverageSchemaPath, 'utf8'));
    const ajv = new Ajv2020({ strict: false });
    ajv.addSchema(reviewCoverageSchema);
    const validate = ajv.compile(schema);
    const valid = validate(parsed);
    assert.ok(
      valid,
      `JSON output does not conform to output.schema.json: ${JSON.stringify(validate.errors, null, 2)}`
    );

    // Explicit assertion that prioritySummary is present and well-formed
    assert.ok(
      parsed.summary && typeof parsed.summary.prioritySummary === 'object',
      'summary.prioritySummary should be present'
    );
    const ps = parsed.summary.prioritySummary;
    for (const key of ['P1', 'P2', 'P3', 'P4']) {
      assert.strictEqual(
        typeof ps.counts[key],
        'number',
        `prioritySummary.counts.${key} should be a number`
      );
    }
    assert.strictEqual(
      typeof ps.requiresImmediateAttention,
      'boolean',
      'requiresImmediateAttention should be boolean'
    );
  });
});

// -----------------------------------------------------------------------------
// runtime output.schema.json validation (#1254)
// -----------------------------------------------------------------------------

describe('validateOutputArtifact - runtime schema validation (#1254)', () => {
  test('reports violations to stderr for a non-conforming artifact', async () => {
    const { validateOutputArtifact } = await import('../src/cli.mjs');
    const errors = [];
    const originalError = console.error;
    console.error = (msg) => errors.push(String(msg));
    try {
      // `issues` must be an array per output.schema.json; a string violates it.
      validateOutputArtifact({ issues: 'not-an-array', summary: {} });
    } finally {
      console.error = originalError;
    }
    const combined = errors.join('\n');
    assert.match(
      combined,
      /does not conform to schemas\/output\.schema\.json/,
      `expected a schema-violation warning, got: ${combined}`
    );
  });

  test('stays silent for a conforming artifact', async () => {
    const { validateOutputArtifact } = await import('../src/cli.mjs');
    const errors = [];
    const originalError = console.error;
    console.error = (msg) => errors.push(String(msg));
    try {
      validateOutputArtifact({
        issues: [],
        summary: {
          issueCountBySeverity: { info: 0, minor: 0, major: 0, critical: 0 },
          issueCountByPhase: { upstream: 0, midstream: 0, downstream: 0 },
          prioritySummary: {
            counts: { P1: 0, P2: 0, P3: 0, P4: 0 },
            requiresImmediateAttention: false,
          },
        },
      });
    } finally {
      console.error = originalError;
    }
    assert.strictEqual(errors.length, 0, `expected no warnings, got: ${errors.join('\n')}`);
  });
});

// -----------------------------------------------------------------------------
// river run - JSON output decision field (#1150 S1)
// -----------------------------------------------------------------------------

describe('river run - JSON output decision field', () => {
  const VALID_DECISIONS = ['auto-approve', 'human-review-recommended', 'human-review-required'];

  test('--output json includes decision as a valid enum value', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });

    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok('decision' in parsed, 'top-level decision field should be present');
    assert.ok(
      VALID_DECISIONS.includes(parsed.decision),
      `decision must be one of ${VALID_DECISIONS.join(', ')}, got: ${parsed.decision}`
    );
  });

  test('--output json with no findings produces decision auto-approve', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    // dry-run with no real findings still invokes scoreReview([]) → auto-approve
    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });

    assert.strictEqual(result.code, 0, `stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    // When findings are empty, scoreReview([]).verdict must be 'auto-approve'
    if (parsed.issues.length === 0) {
      assert.strictEqual(parsed.decision, 'auto-approve');
    } else {
      assert.ok(
        VALID_DECISIONS.includes(parsed.decision),
        `decision must be a valid enum value, got: ${parsed.decision}`
      );
    }
  });
});

// -----------------------------------------------------------------------------
// river run - gate block (Epic #1347 S2)
// -----------------------------------------------------------------------------
describe('river run - gate block', () => {
  test('dry-run json output gates as NO_GO NOT_EXECUTED (M1 fail-safe)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });
    assert.strictEqual(result.code, 0, result.stderr);
    const artifact = JSON.parse(result.stdout);
    assert.ok(artifact.gate, 'gate block must be present in run json output');
    // dry-run skips the LLM: a vacuous verdict must never read as converged.
    assert.strictEqual(artifact.gate.decision, 'NO_GO');
    assert.strictEqual(artifact.gate.reasonCode, 'NOT_EXECUTED');
    assert.strictEqual(artifact.gate.inputs.reviewExecuted, false);
  });

  test('--gate maps a NO_GO gate to exit 1 (Epic #1347 S4)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    // dry-run gates NO_GO NOT_EXECUTED → --gate must surface exit 1.
    const result = await runCliInProcess(['run', '.', '--dry-run', '--gate'], { cwd: dir });
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /Gate: NO_GO/);
  });

  test('--gate with --advisory-only is a contradiction (exit 1, no review)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const result = await runCliInProcess(['run', '.', '--dry-run', '--gate', '--advisory-only'], {
      cwd: dir,
    });
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /--gate cannot be combined with --advisory-only/);
  });

  test('review exec --gate maps the gate decision to the exit code (review path wiring)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    // `review exec` without --execute is plan-only → gate NOT_EXECUTED (NO_GO) →
    // exit 1. Exercises the review path's combineExitCodes wiring end-to-end.
    const result = await runCliInProcess(['review', 'exec', '--gate'], { cwd: dir });
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /Gate: NO_GO/);
  });

  test('--gate with --plan (replay) is rejected explicitly (no silent always-1)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const result = await runCliInProcess(['review', 'exec', '--plan', 'some-plan.json', '--gate'], {
      cwd: dir,
    });
    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /--gate is not supported with --plan/);
  });

  test('--gate combined with --warn-on takes the stricter exit (gate NO_GO wins)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    // dry-run: severity gate is pass (no findings), gate is NO_GO → combined 1.
    const result = await runCliInProcess(
      ['run', '.', '--dry-run', '--gate', '--warn-on', 'major'],
      {
        cwd: dir,
      }
    );
    assert.strictEqual(result.code, 1, result.stderr);
  });
});

// -----------------------------------------------------------------------------
// river runs digest (Epic #1347 S3)
// -----------------------------------------------------------------------------
describe('river runs digest', () => {
  test('saved run appears in the digest with its gate decision', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const save = await runCliInProcess(['run', '.', '--dry-run', '--save'], { cwd: dir });
    assert.strictEqual(save.code, 0, save.stderr);
    assert.match(save.stderr, /Run saved:/);

    const digest = await runCliInProcess(['runs', 'digest'], { cwd: dir });
    assert.strictEqual(digest.code, 0, digest.stderr);
    assert.match(digest.stdout, /runs digest/);
    // dry-run gates as NO_GO NOT_EXECUTED and must be visible in the digest.
    assert.match(digest.stdout, /NO_GO: 1/);
  });
});

describe('river run - GitHub Actions supervision wiring (#1372 C1/M1)', () => {
  test('auto-save + job summary digest carries gate aggregates (C1)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const summaryFile = join(dir, 'step-summary.md');
    writeFileSync(summaryFile, '# prior content');

    const result = await runCliInProcess(['run', '.', '--dry-run'], {
      cwd: dir,
      env: { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summaryFile },
    });
    assert.strictEqual(result.code, 0, result.stderr);
    // auto-save without --save
    assert.match(result.stderr, /Run saved:/);
    const summary = await import('node:fs/promises').then((fs) => fs.readFile(summaryFile, 'utf8'));
    assert.match(summary, /runs digest/);
    // C1: the digest must aggregate FULL records — gate decisions must appear.
    assert.match(summary, /NO_GO: 1/);
  });

  test('RIVER_AUTO_SAVE=false opts out of the CI auto-save (M1)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const result = await runCliInProcess(['run', '.', '--dry-run'], {
      cwd: dir,
      env: { GITHUB_ACTIONS: 'true', RIVER_AUTO_SAVE: 'false' },
    });
    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(!/Run saved:/.test(result.stderr), 'opt-out must skip the save');
  });
});

// -----------------------------------------------------------------------------
// river run --save - 契約1 provenance (#1574 producer Slice 2 / #1715)
// -----------------------------------------------------------------------------
describe('river run --save - run record provenance', () => {
  // `evidenceSource` is decided by GITHUB_ACTIONS, which this suite itself runs
  // under. Both cases therefore pin the variable explicitly — `undefined` makes
  // runCliInProcess delete it — instead of inheriting the ambient CI value and
  // asserting `local` where the runner correctly reports `CI`.
  // GITHUB_STEP_SUMMARY is cleared for the same reason: leaving CI's real path
  // in place would append this test's digest to the job summary.
  async function saveAndReadRecord(t, { env, commitFirst = false } = {}) {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    if (commitFirst) {
      // Commit the change so the review reads a tree HEAD actually contains.
      // It has to land on a BRANCH off main: committing on main itself would
      // move the merge base onto the change and leave nothing to review.
      await runGit(['checkout', '-b', 'feature'], dir);
      await runGit(['add', '.'], dir);
      await runGit(['commit', '-m', 'commit the change under review'], dir);
    }
    const result = await runCliInProcess(['run', '.', '--dry-run', '--save'], {
      cwd: dir,
      env: { GITHUB_STEP_SUMMARY: undefined, ...env },
    });
    assert.strictEqual(result.code, 0, result.stderr);
    const runId = /Run saved: (\S+)/.exec(result.stderr)?.[1];
    assert.ok(runId, `no runId in stderr: ${result.stderr}`);
    const record = JSON.parse(readFileSync(join(dir, '.river', 'runs', `${runId}.json`), 'utf8'));
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    return { record, head };
  }

  test('records the HEAD it ran against and flags the working-tree review', async (t) => {
    // The default fixture leaves the change UNCOMMITTED, which is the normal
    // shape of a local `river run`: the reviewed lines exist only in the working
    // tree, so `commitSha` names the baseline and `dirty: true` is what says
    // HEAD alone does not reproduce what was reviewed (#1715 W1).
    const { record, head } = await saveAndReadRecord(t, { env: { GITHUB_ACTIONS: undefined } });
    assert.strictEqual(record.commitSha, head);
    assert.deepStrictEqual(record.provenance, {
      evidenceSource: 'local',
      sourceCommitSha: head,
      dirty: true,
      trustedBy: null,
      generatedByCandidate: false,
    });
    // mergeBase is the comparison base and stays a separate field.
    assert.ok('mergeBase' in record);
  });

  test('flags a committed tree as clean, so the sha is reproducible', async (t) => {
    const { record, head } = await saveAndReadRecord(t, {
      env: { GITHUB_ACTIONS: undefined },
      commitFirst: true,
    });
    assert.strictEqual(record.commitSha, head);
    assert.strictEqual(record.provenance.dirty, false);
  });

  test('claims the CI source under GITHUB_ACTIONS without claiming trust', async (t) => {
    const { record, head } = await saveAndReadRecord(t, { env: { GITHUB_ACTIONS: 'true' } });
    assert.strictEqual(record.provenance.evidenceSource, 'CI');
    assert.strictEqual(record.provenance.sourceCommitSha, head);
    // Running in CI is not attestation: the record is still self-reported by a
    // process inside the reviewed repo, so trustedBy stays null (契約1).
    assert.strictEqual(record.provenance.trustedBy, null);
  });
});

// -----------------------------------------------------------------------------
// river suppression add - rulesDigest provenance wiring (#2401)
// -----------------------------------------------------------------------------
//
// #2202 Phase 0 let createSuppression record a rulesDigest, but the only
// production caller (`river suppression add`) passed nothing. These tests go
// through the real CLI entry so they check the wiring, not
// resolveSuppressionProvenance alone (which tests/suppression.test.mjs covers).
describe('river suppression add - rulesDigest provenance (#2401)', () => {
  const ARGV = [
    'suppression',
    'add',
    '--fingerprint',
    '0123456789abcdef',
    '--feedback',
    'false_positive',
    '--rationale',
    'provenance wiring',
  ];

  function readSuppressionEntries(dir) {
    const index = JSON.parse(readFileSync(join(dir, '.river', 'memory', 'index.json'), 'utf8'));
    return index.entries.filter((e) => e.type === 'suppression');
  }

  test('records context.rulesDigest when .river/rules.md exists', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ rules: '- base rule\n' });
    t.after(cleanup);
    // Independent derivation: rulesText is the trimmed rules.md content.
    const expected = crypto.createHash('sha256').update('- base rule').digest('hex');

    const result = await runCliInProcess(ARGV, { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    const entries = readSuppressionEntries(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].context.rulesDigest, expected);
    assert.match(result.stdout, new RegExp(`rulesDigest: ${expected}`));
    assert.doesNotMatch(result.stderr, /Warning:/);
  });

  test('omits the rulesDigest key (not null) when the repo has no project rules', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);

    const result = await runCliInProcess(ARGV, { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    const entries = readSuppressionEntries(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(Object.hasOwn(entries[0].context, 'rulesDigest'), false);
    assert.doesNotMatch(result.stderr, /Warning:/);
  });

  test('still creates the suppression (exit 0) when .river/rules.md is unreadable, omitting only rulesDigest', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);
    // A directory at the rules.md path makes loadProjectRules throw
    // ProjectRulesError (EISDIR). Before #2401 this command never read the
    // rules and exited 0 here; the record-only provenance must not change that.
    mkdirSync(join(dir, '.river', 'rules.md'), { recursive: true });

    const result = await runCliInProcess(ARGV, { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Suppression created: /);
    const entries = readSuppressionEntries(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].context.fingerprint, '0123456789abcdef');
    assert.strictEqual(entries[0].context.feedbackType, 'false_positive');
    assert.strictEqual(Object.hasOwn(entries[0].context, 'rulesDigest'), false);
    // The omission is announced on one stderr line, in the CLI's Warning: shape.
    assert.match(
      result.stderr,
      /^Warning: rulesDigest not recorded on this suppression: Failed to read project rules at /m
    );
  });

  test('does not swallow errors other than ProjectRulesError', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ rules: '- base rule\n' });
    t.after(cleanup);
    // Only the rules digest reaches crypto.createHash on this path (the entry id
    // comes from --fingerprint), so this stands in for an unexpected bug inside
    // provenance resolution. It must surface, not be downgraded to a warning.
    const createHash = mock.method(crypto, 'createHash', () => {
      throw new Error('unexpected-2401');
    });
    t.after(() => createHash.mock.restore());

    const result = await runCliInProcess(ARGV, { cwd: dir });
    createHash.mock.restore();

    assert.strictEqual(result.code, 1, result.stdout);
    assert.match(result.stderr, /unexpected-2401/);
    assert.doesNotMatch(result.stderr, /Warning: rulesDigest not recorded/);
    assert.strictEqual(createHash.mock.callCount() > 0, true);
  });
});

// -----------------------------------------------------------------------------
// river suppression add --skill - skillId / skillVersion provenance (#2401)
// -----------------------------------------------------------------------------
//
// `--skill <id>` is the same option as `feedback add --skill` (one parse helper
// in src/cli.mjs). Through the real CLI entry, it must reach
// resolveSuppressionProvenance as `ruleId` and land in context.skillId /
// context.skillVersion. The expected version is read from the SKILL.md text
// here, not through the skill loader the production path uses.
describe('river suppression add --skill - skill provenance (#2401)', () => {
  const BASE_ARGV = [
    'suppression',
    'add',
    '--fingerprint',
    '0123456789abcdef',
    '--feedback',
    'false_positive',
    '--rationale',
    'skill provenance wiring',
  ];
  const SKILL_ID = 'river-review-security';

  function readSuppressionEntries(dir) {
    const index = JSON.parse(readFileSync(join(dir, '.river', 'memory', 'index.json'), 'utf8'));
    return index.entries.filter((e) => e.type === 'suppression');
  }

  function versionFromSkillMd(skillId) {
    const text = readFileSync(
      join(skillLoaderPaths.skillsDir, 'agent-skills', skillId, 'SKILL.md'),
      'utf8'
    );
    const frontMatter = text.split(/^---$/m)[1];
    assert.match(frontMatter, new RegExp(`^id: ${escapeRegExp(skillId)}$`, 'm'));
    const version = frontMatter.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1];
    assert.ok(version, `no version in ${skillId}/SKILL.md`);
    return version;
  }

  /**
   * Make readdir of the bundled skills directory fail with `makeError()`, and
   * leave every other readdir alone.
   */
  function failSkillsDirReaddir(t, makeError) {
    const realReaddir = fsPromises.readdir.bind(fsPromises);
    const readdir = mock.method(fsPromises, 'readdir', async (dirPath, ...rest) => {
      if (resolve(String(dirPath)) === resolve(skillLoaderPaths.skillsDir)) throw await makeError();
      return realReaddir(dirPath, ...rest);
    });
    t.after(() => readdir.mock.restore());
    return readdir;
  }

  test('records context.skillId and the SKILL.md version as context.skillVersion', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ rules: '- base rule\n' });
    t.after(cleanup);
    const expectedVersion = versionFromSkillMd(SKILL_ID);

    const result = await runCliInProcess([...BASE_ARGV, '--skill', SKILL_ID], { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    const entries = readSuppressionEntries(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].context.skillId, SKILL_ID);
    assert.strictEqual(entries[0].context.skillVersion, expectedVersion);
    // The digest is resolved independently and is still recorded alongside.
    assert.strictEqual(
      entries[0].context.rulesDigest,
      crypto.createHash('sha256').update('- base rule').digest('hex')
    );
    assert.match(result.stdout, new RegExp(`skillId: ${escapeRegExp(SKILL_ID)}`));
    assert.match(result.stdout, new RegExp(`skillVersion: ${escapeRegExp(expectedVersion)}`));
    assert.doesNotMatch(result.stderr, /Warning:/);
  });

  test('also accepts the flag-first order (--skill before the required options)', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);

    const result = await runCliInProcess(
      ['suppression', 'add', '--skill', SKILL_ID, ...BASE_ARGV.slice(2)],
      { cwd: dir }
    );

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(readSuppressionEntries(dir)[0].context.skillId, SKILL_ID);
  });

  test('omitting --skill writes no skillId / skillVersion keys but still records rulesDigest', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ rules: '- base rule\n' });
    t.after(cleanup);

    const result = await runCliInProcess(BASE_ARGV, { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    const { context } = readSuppressionEntries(dir)[0];
    assert.strictEqual(Object.hasOwn(context, 'skillId'), false);
    assert.strictEqual(Object.hasOwn(context, 'skillVersion'), false);
    assert.match(context.rulesDigest, /^[0-9a-f]{64}$/);
  });

  test('an id no skill carries is recorded as given, without skillVersion (same as feedback add)', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);

    const result = await runCliInProcess([...BASE_ARGV, '--skill', 'no-such-skill-2401'], {
      cwd: dir,
    });

    assert.strictEqual(result.code, 0, result.stderr);
    const { context } = readSuppressionEntries(dir)[0];
    assert.strictEqual(context.skillId, 'no-such-skill-2401');
    assert.strictEqual(Object.hasOwn(context, 'skillVersion'), false);
    assert.doesNotMatch(result.stderr, /Warning:/);

    // Parity: feedback add does not check --skill against the registry either.
    const feedback = await runCliInProcess(
      ['feedback', 'add', '--type', 'false_positive', '--skill', 'no-such-skill-2401'],
      { cwd: dir }
    );
    assert.strictEqual(feedback.code, 0, feedback.stderr);
  });

  test('a blank --skill is rejected with exit 1 before anything is written (same as feedback add)', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);

    const result = await runCliInProcess([...BASE_ARGV, '--skill', '   '], { cwd: dir });

    assert.strictEqual(result.code, 1, result.stdout);
    assert.match(result.stderr, /^Error: --skill must not be blank\.$/m);
    assert.throws(() => readFileSync(join(dir, '.river', 'memory', 'index.json')), {
      code: 'ENOENT',
    });

    const feedback = await runCliInProcess(
      ['feedback', 'add', '--type', 'false_positive', '--skill', '   '],
      { cwd: dir }
    );
    assert.strictEqual(feedback.code, 1, feedback.stdout);
  });

  test('--skill unknown creates the suppression but records no skillId, and says why', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);

    const result = await runCliInProcess([...BASE_ARGV, '--skill', 'unknown'], { cwd: dir });

    assert.strictEqual(result.code, 0, result.stderr);
    const { context } = readSuppressionEntries(dir)[0];
    assert.strictEqual(Object.hasOwn(context, 'skillId'), false);
    assert.strictEqual(Object.hasOwn(context, 'skillVersion'), false);
    assert.match(result.stderr, /^Warning: skillId not recorded on this suppression: "unknown" /m);
  });

  test('a skill metadata read failure still creates the suppression, dropping only skillVersion', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ rules: '- base rule\n' });
    t.after(cleanup);
    // A genuine fs error (ENOENT from a real readdir), as listSkillFiles would
    // raise if the bundled skills directory were missing.
    const readdir = failSkillsDirReaddir(t, () =>
      fsPromises.readdir(join(dir, 'no-such-skills-dir')).catch((error) => error)
    );

    const result = await runCliInProcess([...BASE_ARGV, '--skill', SKILL_ID], { cwd: dir });
    readdir.mock.restore();

    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /Suppression created: /);
    const { context } = readSuppressionEntries(dir)[0];
    assert.strictEqual(context.skillId, SKILL_ID);
    assert.strictEqual(Object.hasOwn(context, 'skillVersion'), false);
    assert.match(context.rulesDigest, /^[0-9a-f]{64}$/);
    assert.match(
      result.stderr,
      /^Warning: skillVersion not recorded on this suppression: ENOENT: /m
    );
  });

  test('does not swallow errors other than a skill metadata read failure', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);
    // Stands in for a bug inside skill resolution: no fs `code` / `syscall`,
    // not a SkillLoaderError. It must surface, not become a warning.
    const readdir = failSkillsDirReaddir(t, () => new TypeError('unexpected-2401-skill'));

    const result = await runCliInProcess([...BASE_ARGV, '--skill', SKILL_ID], { cwd: dir });
    readdir.mock.restore();

    assert.strictEqual(result.code, 1, result.stdout);
    assert.match(result.stderr, /unexpected-2401-skill/);
    assert.doesNotMatch(result.stderr, /Warning: skillVersion not recorded/);
  });
});
