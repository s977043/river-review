import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { assessSmallChangeShadow } from './small-change-shadow.mjs';

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_CASES = 30;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Aggregate offline shadow results without promoting incomplete evidence to
 * eligible candidates. Input is operator-provided data, not a Host attestation.
 */
export function assessSmallChangeBatch(input) {
  if (
    !isRecord(input) ||
    input.kind !== 'small-change-shadow-batch/v1' ||
    typeof input.repository !== 'string' ||
    !REPOSITORY.test(input.repository) ||
    !Array.isArray(input.cases) ||
    input.cases.length < 1 ||
    input.cases.length > MAX_CASES
  ) {
    throw new Error('invalid-batch-contract');
  }

  const seen = new Set();
  const counts = { candidate: 0, excluded: 0, unknown: 0 };
  const results = [];

  for (const entry of input.cases) {
    if (
      !isRecord(entry) ||
      !Number.isSafeInteger(entry.pr) ||
      entry.pr < 1 ||
      seen.has(entry.pr) ||
      !Object.hasOwn(entry, 'observation')
    ) {
      throw new Error('invalid-or-duplicate-case');
    }
    seen.add(entry.pr);
    const assessed = assessSmallChangeShadow(entry.observation);
    counts[assessed.status] += 1;
    results.push({
      pr: entry.pr,
      status: assessed.status,
      reasonCodes: assessed.reasonCodes,
    });
  }

  return {
    kind: 'small-change-shadow-batch-result/v1',
    repository: input.repository,
    total: results.length,
    counts,
    candidateShare: counts.unknown === 0 ? counts.candidate / results.length : null,
    results,
    authorizesApproval: false,
    evidenceTrust: 'unverified-input',
  };
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--input' || !args[1]) {
    throw new Error(
      'Usage: node scripts/experiments/small-change-shadow-batch.mjs --input <json-file>'
    );
  }
  const file = args[1];
  if (statSync(file).size > MAX_INPUT_BYTES) {
    throw new Error('input-too-large');
  }
  const output = assessSmallChangeBatch(JSON.parse(readFileSync(file, 'utf8')));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Never print untrusted input or filesystem paths to logs.
    process.stderr.write(
      `small-change-shadow-batch: ${error.code ?? error.name ?? 'invalid-input'}\n`
    );
    process.exitCode = 1;
  }
}
