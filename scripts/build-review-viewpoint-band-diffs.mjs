#!/usr/bin/env node
// Regenerates tests/fixtures/review-viewpoints/band-diffs.generated.mjs (#2252).
//
// Why a generator: the Phase 8 corpus was written by hand, so every diff in it
// had the shape a human types, not the shape git emits. This script drives a
// disposable git repository under os.tmpdir() and captures REAL git output for
// the same semantic change in three input bands:
//
//   default  git show -U3   (the width every git-generated route in
//                            pages/reference/artifact-input-contract.md uses)
//   u0       git show -U0   (context-free; the declaration line that the
//                            detector's declaration-based fallback reads is
//                            NOT in the hunk)
//   cc       git show --cc  (combined diff of a conflicted merge; `@@@`)
//
// The scenarios replay the semantics of existing hand-labeled corpus rows, so
// the labels attached in corpus.mjs stay hand-written per band and are never
// read back from the detector.
//
// Usage:
//   node scripts/build-review-viewpoint-band-diffs.mjs
//   npx prettier --write tests/fixtures/review-viewpoints/band-diffs.generated.mjs
//
// The second command is required: this script emits plain JSON string literals
// and does not reproduce prettier's line wrapping, so `npm run lint` fails on a
// freshly generated file until prettier has rewritten it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'review-viewpoints',
  'band-diffs.generated.mjs'
);

const DTO_BASE = `interface UserResponse {
  id: string;
  legacyName: string;
  name: string;
}
`;

export const SCENARIOS = [
  {
    key: 'b01-response-dto-field-removed',
    file: 'src/api/user.ts',
    base: DTO_BASE,
    after: `interface UserResponse {
  id: string;
  name: string;
}
`,
    // Conflicting edit on the other branch, touching the same region.
    rival: `interface UserResponse {
  id: string;
  legacyName: string;
  name: string;
  locale: string;
}
`,
    // Resolution differs from BOTH parents: the removal from one side and the
    // added property from the other.
    resolution: `interface UserResponse {
  id: string;
  name: string;
  locale: string;
}
`,
  },
  {
    key: 'b02-requiredness-tightened',
    file: 'src/api/payment.ts',
    base: `interface PaymentRequest {
  idempotencyKey?: string;
  amount: number;
}
`,
    after: `interface PaymentRequest {
  idempotencyKey: string;
  amount: number;
}
`,
    rival: `interface PaymentRequest {
  idempotencyKey?: string;
  amount: number;
  currency: string;
}
`,
    resolution: `interface PaymentRequest {
  idempotencyKey: string;
  amount: number;
  currency: string;
}
`,
  },
  {
    key: 'b03-optional-field-added',
    file: 'src/api/profile.ts',
    base: `interface ProfileResponse {
  id: string;
}
`,
    after: `interface ProfileResponse {
  id: string;
  nickname?: string;
}
`,
    rival: `interface ProfileResponse {
  id: string;
  avatarUrl: string;
}
`,
    resolution: `interface ProfileResponse {
  id: string;
  nickname?: string;
  avatarUrl: string;
}
`,
  },
  {
    key: 'b04-contract-named-outside-api-path',
    file: 'src/models/checkout.ts',
    base: `interface CheckoutResponse {
  id: string;
  couponCode: string;
  total: number;
}
`,
    after: `interface CheckoutResponse {
  id: string;
  total: number;
}
`,
    rival: `interface CheckoutResponse {
  id: string;
  couponCode: string;
  total: number;
  currency: string;
}
`,
    resolution: `interface CheckoutResponse {
  id: string;
  total: number;
  currency: string;
}
`,
  },
  {
    key: 'b05-contract-file-comment-only',
    file: 'src/api/account.ts',
    base: `// account contract
interface AccountResponse {
  id: string;
}
`,
    after: `// account contract (see RFC-12)
interface AccountResponse {
  id: string;
}
`,
    rival: `// account contract, owned by billing
interface AccountResponse {
  id: string;
}
`,
    resolution: `// account contract (see RFC-12), owned by billing
interface AccountResponse {
  id: string;
}
`,
  },
  {
    key: 'b06-internal-type-field-removed',
    file: 'src/lib/util.ts',
    base: `interface Options {
  verbose: boolean;
  retries: number;
}
`,
    after: `interface Options {
  retries: number;
}
`,
    rival: `interface Options {
  verbose: boolean;
  retries: number;
  timeoutMs: number;
}
`,
    resolution: `interface Options {
  retries: number;
  timeoutMs: number;
}
`,
  },
];

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
}

function write(repo, file, content) {
  const target = path.join(repo, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function buildOne(scenario) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'rv-band-'));
  try {
    git(repo, ['init', '-q', '-b', 'main']);
    write(repo, scenario.file, scenario.base);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'base']);
    const baseSha = git(repo, ['rev-parse', 'HEAD']).trim();

    // linear change -> default / u0 bands
    write(repo, scenario.file, scenario.after);
    git(repo, ['commit', '-q', '-a', '-m', 'change']);
    const changeSha = git(repo, ['rev-parse', 'HEAD']).trim();
    const def = git(repo, ['show', '--format=', '-U3', changeSha]);
    const u0 = git(repo, ['show', '--format=', '-U0', changeSha]);

    // conflicted merge -> cc band
    git(repo, ['checkout', '-q', '-b', 'rival', baseSha]);
    write(repo, scenario.file, scenario.rival);
    git(repo, ['commit', '-q', '-a', '-m', 'rival']);
    git(repo, ['checkout', '-q', 'main']);
    try {
      // --no-commit keeps the merge open whether or not git auto-resolves, so
      // the recorded resolution below is what lands in the merge commit.
      git(repo, ['merge', '--no-ff', '--no-commit', '-q', 'rival']);
    } catch {
      /* conflict expected */
    }
    write(repo, scenario.file, scenario.resolution);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'merge rival']);
    const cc = git(repo, ['show', '--format=', '--cc', 'HEAD']);

    // The same merge taken from the other side. A combined diff's prefix
    // COLUMN depends on which parent is first, so the identical resolution
    // reaches a consumer as `- x` here and as ` -x` above. Both are real git
    // output for the same semantic change.
    git(repo, ['checkout', '-q', '-B', 'reverse', 'rival']);
    try {
      git(repo, ['merge', '--no-ff', '--no-commit', '-q', 'main~1']);
    } catch {
      /* conflict expected */
    }
    write(repo, scenario.file, scenario.resolution);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'merge main']);
    const ccReverse = git(repo, ['show', '--format=', '--cc', 'HEAD']);

    return { default: def, u0, cc, ccReverse };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

export function buildBandDiffs() {
  return Object.fromEntries(SCENARIOS.map((scenario) => [scenario.key, buildOne(scenario)]));
}

// Real commits from THIS repository. Chosen so the corpus is not made only of
// diffs a human typed, and spread across 2026-04 .. 2026-09 so the sample is
// not dominated by the diff-processor work that landed on 2026-09-17/18.
// `args` is passed to git verbatim; the output is captured as-is.
export const REPO_COMMITS = [
  {
    key: 'rc01-node-api-review-options-optional-field-default',
    band: 'default',
    args: ['show', '--format=', '-U3', 'dc238b88', '--', 'runners/node-api/src/types.ts'],
  },
  {
    key: 'rc02-node-api-review-options-optional-field-u0',
    band: 'u0',
    args: ['show', '--format=', '-U0', 'dc238b88', '--', 'runners/node-api/src/types.ts'],
  },
  {
    key: 'rc03-skill-selection-result-optional-field-default',
    band: 'default',
    args: ['show', '--format=', '-U3', '91299986', '--', 'runners/node-api/src/types.ts'],
  },
  {
    key: 'rc04-skill-selection-result-optional-field-u0',
    band: 'u0',
    args: ['show', '--format=', '-U0', '91299986', '--', 'runners/node-api/src/types.ts'],
  },
  {
    key: 'rc05-output-kind-union-widened-default',
    band: 'default',
    args: ['show', '--format=', '-U3', '15594086', '--', 'src/types/skill.ts'],
  },
  {
    key: 'rc06-docs-only-default',
    band: 'default',
    args: [
      'show',
      '--format=',
      '-U3',
      '0841e238',
      '--',
      'docs/development/2267-phase6-evidence-state.md',
    ],
  },
  {
    key: 'rc07-package-json-conflicted-merge-cc',
    band: 'cc',
    args: ['show', '--format=', '--cc', '96b9821a', '--', 'package.json'],
  },
];

export function buildRepoCommitDiffs() {
  return Object.fromEntries(
    REPO_COMMITS.map((entry) => {
      const text = git(repoRoot, entry.args);
      if (!text.trim()) {
        throw new Error(`repo commit capture produced no diff: ${entry.key}`);
      }
      return [entry.key, { band: entry.band, args: entry.args, diff: text }];
    })
  );
}

function serialize(bandDiffs, repoCommitDiffs) {
  const lines = [
    '// GENERATED by scripts/build-review-viewpoint-band-diffs.mjs -- do not edit by hand.',
    '//',
    '// Real `git show` output captured from a disposable repository, in three',
    '// input bands (-U3 / -U0 / --cc). The labels for these diffs live in',
    '// tests/fixtures/review-viewpoints/corpus.mjs and are written by hand.',
    '',
    'export const bandDiffs = {',
  ];
  for (const [key, bands] of Object.entries(bandDiffs)) {
    lines.push(`  ${JSON.stringify(key)}: {`);
    for (const band of ['default', 'u0', 'cc', 'ccReverse']) {
      lines.push(`    ${band}: ${JSON.stringify(bands[band])},`);
    }
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('export const repoCommitDiffs = {');
  for (const [key, entry] of Object.entries(repoCommitDiffs)) {
    lines.push(`  ${JSON.stringify(key)}: {`);
    lines.push(`    band: ${JSON.stringify(entry.band)},`);
    lines.push(`    command: ${JSON.stringify(['git', ...entry.args].join(' '))},`);
    lines.push(`    diff: ${JSON.stringify(entry.diff)},`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const bandDiffs = buildBandDiffs();
  const repoCommitDiffs = buildRepoCommitDiffs();
  if (process.argv.includes('--print')) {
    process.stdout.write(JSON.stringify({ bandDiffs, repoCommitDiffs }, null, 2));
    return;
  }
  writeFileSync(OUT, serialize(bandDiffs, repoCommitDiffs));
  process.stdout.write(`wrote ${path.relative(repoRoot, OUT)}\n`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  await main();
}
