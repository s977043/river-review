import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SHA = /^[a-f0-9]{40}$/i;
const MAX_PRS = 10;
const PAGE_SIZE = 100;
const MAX_PAGES = 3;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireShape(condition, code) {
  if (!condition) throw new Error(code);
}

export function request(path, exec = execFileSync) {
  const output = exec('gh', ['api', path], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output.toString('utf8'));
}

function validateSelection(repository, prs) {
  requireShape(typeof repository === 'string' && REPOSITORY.test(repository), 'invalid-repository');
  requireShape(Array.isArray(prs) && prs.length > 0 && prs.length <= MAX_PRS, 'invalid-pr-count');
  requireShape(
    prs.every((pr) => Number.isSafeInteger(pr) && pr > 0),
    'invalid-pr-number'
  );
  requireShape(new Set(prs).size === prs.length, 'duplicate-pr-number');
}

function readPages(apiRead, path, extract, total = null, expectedCount = null) {
  const values = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = apiRead(path + '?per_page=' + PAGE_SIZE + '&page=' + page);
    const chunk = extract(response);
    requireShape(Array.isArray(chunk) && chunk.length <= PAGE_SIZE, 'invalid-page-response');
    values.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      requireShape(total === null || total() === values.length, 'incomplete-check-run-list');
      return values;
    }
    if ((expectedCount ?? total?.()) === values.length) return values;
  }
  throw new Error('metadata-page-limit');
}

/**
 * Bounded, read-only GitHub metadata observation. This cannot attest a
 * review, classify sensitive scope, or authorize approval/merge.
 */
export function observeHistoricalPrs({ repository, prs, apiRead = request }) {
  validateSelection(repository, prs);
  requireShape(typeof apiRead === 'function', 'invalid-api-adapter');
  const cases = [];

  for (const pr of prs) {
    const prefix = 'repos/' + repository;
    const details = apiRead(prefix + '/pulls/' + pr);
    const headSha = details?.head?.sha;
    requireShape(
      object(details) &&
        details.number === pr &&
        details.base?.repo?.full_name === repository &&
        typeof details.merged_at === 'string' &&
        SHA.test(headSha ?? '') &&
        Number.isSafeInteger(details.additions) &&
        details.additions >= 0 &&
        Number.isSafeInteger(details.deletions) &&
        details.deletions >= 0 &&
        Number.isSafeInteger(details.changed_files) &&
        details.changed_files > 0,
      'invalid-pr-metadata'
    );
    const changedLines = details.additions + details.deletions;
    requireShape(Number.isSafeInteger(changedLines), 'invalid-change-size');

    const files = readPages(
      apiRead,
      prefix + '/pulls/' + pr + '/files',
      (value) => value,
      null,
      details.changed_files
    );
    requireShape(files.length === details.changed_files, 'incomplete-file-manifest');
    const changedFiles = files.map((file) => file?.filename);
    requireShape(
      changedFiles.every((path) => typeof path === 'string' && path.length > 0) &&
        new Set(changedFiles).size === changedFiles.length,
      'invalid-file-manifest'
    );

    let advertisedTotal = null;
    const checkRuns = readPages(
      apiRead,
      prefix + '/commits/' + headSha + '/check-runs',
      (value) => {
        requireShape(
          object(value) &&
            Number.isSafeInteger(value.total_count) &&
            value.total_count >= 0 &&
            (advertisedTotal === null || advertisedTotal === value.total_count),
          'invalid-check-run-count'
        );
        advertisedTotal = value.total_count;
        return value.check_runs;
      },
      () => advertisedTotal
    );
    requireShape(
      checkRuns.every(
        (check) =>
          object(check) &&
          check.head_sha?.toLowerCase() === headSha.toLowerCase() &&
          typeof check.name === 'string' &&
          typeof check.status === 'string' &&
          (check.conclusion === null || typeof check.conclusion === 'string')
      ),
      'invalid-check-run-metadata'
    );
    cases.push({
      pr,
      observation: {
        subject: { headSha },
        change: { changedLines, changedFiles },
      },
      observedChecks: {
        headSha,
        completeList: true,
        runs: checkRuns.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
        })),
      },
    });
  }

  return {
    kind: 'small-change-shadow-batch/v1',
    repository,
    sourceNote:
      'Read-only GitHub CLI API metadata. Operator-editable, not attested. No review, scope, risk-map, or approval proof.',
    cases,
    authorizesApproval: false,
    evidenceTrust: 'unverified-input',
  };
}

function parseArgs(args) {
  requireShape(
    args.length === 4 && args[0] === '--repo' && args[2] === '--prs',
    'invalid-arguments'
  );
  const tokens = args[3].split(',');
  requireShape(
    tokens.every((token) => /^[1-9][0-9]*$/.test(token)),
    'invalid-pr-number'
  );
  const prs = tokens.map(Number);
  validateSelection(args[1], prs);
  return { repository: args[1], prs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = observeHistoricalPrs(parseArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } catch {
    // No API response, token, untrusted PR text or file path is echoed.
    process.stderr.write('small-change-host-observe: failed to collect complete metadata\n');
    process.exitCode = 1;
  }
}
