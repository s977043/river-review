import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/i;
const MAX_INPUT_BYTES = 1024 * 1024;
const PROTECTED_PATHS = [
  '.small_change',
  '.river/risk-map.yaml',
  '.github/workflows/',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSafePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

function isPathArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isSafePath) &&
    new Set(value).size === value.length
  );
}

function isSafePrefix(value) {
  return (
    typeof value === 'string' &&
    isSafePath(value.endsWith('/') ? value.slice(0, -1) : value)
  );
}

function samePaths(left, right) {
  if (!isPathArray(left) || !isPathArray(right) || left.length !== right.length) {
    return false;
  }
  const expected = new Set(right);
  return left.every((path) => expected.has(path));
}

function matchesPrefix(path, prefix) {
  return (
    path === prefix ||
    (prefix.endsWith('/') && path.startsWith(prefix)) ||
    path.startsWith(`${prefix}/`)
  );
}

/**
 * An offline, untrusted-observation diagnostic, NOT a GitHub approval policy.
 * Do not use output as a CI passing check or as an automated review decision.
 * @param {unknown} input
 * @returns {{ kind: string, status: 'candidate' | 'excluded' | 'unknown', reasonCodes: string[], authorizesApproval: false, evidenceTrust: 'unverified-input' }}
 */
export function assessSmallChangeShadow(input) {
  const unknown = new Set();
  const excluded = new Set();
  const subject = isRecord(input) ? input.subject : undefined;
  const change = isRecord(input) ? input.change : undefined;
  const route = isRecord(input) ? input.route : undefined;
  const review = isRecord(input) ? input.review : undefined;
  const checks = isRecord(input) ? input.checks : undefined;
  const scope = isRecord(input) ? input.scope : undefined;
  const policy = isRecord(input) ? input.policy : undefined;

  const head = subject?.headSha;
  if (typeof head !== 'string' || !SHA.test(head)) {
    unknown.add('invalid-subject-sha');
  }

  if (!isRecord(change) || !isPathArray(change.changedFiles)) {
    unknown.add('invalid-change-manifest');
  }
  if (!isNonnegativeInteger(change?.changedLines)) {
    unknown.add('missing-change-size');
  } else if (change.changedLines >= 1000) {
    excluded.add('change-too-large');
  }

  for (const [name, signal] of [
    ['route', route],
    ['review', review],
    ['checks', checks],
    ['scope', scope],
  ]) {
    if (
      !SHA.test(head ?? '') ||
      !isRecord(signal) ||
      typeof signal.headSha !== 'string' ||
      signal.headSha.toLowerCase() !== head.toLowerCase()
    ) {
      unknown.add(`missing-or-stale-${name}`);
    }
  }

  if (route?.policyApplied !== true) {
    unknown.add('risk-policy-not-verified');
  }
  if (route?.selectedMode === 'team' || route?.selectedMode === 'human-required') {
    excluded.add('review-route-escalated');
  } else if (route?.selectedMode !== 'light' && route?.selectedMode !== 'standard') {
    unknown.add('unknown-review-route');
  }
  if (route?.riskAction === 'escalate' || route?.riskAction === 'require_human_review') {
    excluded.add('risk-action-escalated');
  } else if (route?.riskAction !== 'comment_only') {
    unknown.add('unknown-risk-action');
  }

  if (review?.state !== 'completed' || review?.coverage !== 'complete') {
    unknown.add('review-incomplete');
  }
  if (!isNonnegativeInteger(review?.majorOrCriticalCount)) {
    unknown.add('findings-not-verified');
  } else if (review.majorOrCriticalCount > 0) {
    excluded.add('major-or-critical-findings');
  }

  if (checks?.state === 'failed') {
    excluded.add('required-checks-failed');
  } else if (checks?.state !== 'passed') {
    unknown.add('required-checks-not-passed');
  }

  if (!samePaths(change?.changedFiles, scope?.classifiedChangedFiles)) {
    unknown.add('scope-manifest-mismatch');
  }
  if (scope?.classificationComplete !== true) {
    unknown.add('scope-classification-incomplete');
  }
  for (const [field, reason] of [
    ['sharedLibraryTouched', 'shared-library-excluded'],
    ['sensitiveAreaTouched', 'sensitive-area-excluded'],
  ]) {
    if (scope?.[field] === true) {
      excluded.add(reason);
    } else if (scope?.[field] !== false) {
      unknown.add(`unknown-${field}`);
    }
  }

  if (
    !isRecord(policy) ||
    !Number.isSafeInteger(policy.maxServicesInclusive) ||
    policy.maxServicesInclusive < 1 ||
    policy.maxServicesInclusive > 3 ||
    !Array.isArray(policy.excludedPathPrefixes) ||
    !policy.excludedPathPrefixes.every(isSafePrefix)
  ) {
    unknown.add('missing-repo-policy');
  } else if (
    isPathArray(change?.changedFiles) &&
    change.changedFiles.some((path) =>
      policy.excludedPathPrefixes.some((prefix) => matchesPrefix(path, prefix))
    )
  ) {
    excluded.add('repo-policy-path-excluded');
  }

  if (
    isPathArray(change?.changedFiles) &&
    change.changedFiles.some((path) =>
      PROTECTED_PATHS.some((prefix) => matchesPrefix(path, prefix))
    )
  ) {
    excluded.add('review-policy-files-changed');
  }

  if (!Array.isArray(scope?.services) || scope.services.length === 0) {
    unknown.add('missing-affected-services');
  } else {
    const ids = new Set();
    for (const service of scope.services) {
      if (!isRecord(service) || typeof service.name !== 'string' || !service.name.trim()) {
        unknown.add('invalid-affected-service');
        continue;
      }
      if (ids.has(service.name)) {
        unknown.add('duplicate-affected-service');
      }
      ids.add(service.name);
      if (!isNonnegativeInteger(service.priorMergedPrs)) {
        unknown.add('unknown-service-experience');
      } else if (service.priorMergedPrs < 10) {
        excluded.add('insufficient-service-experience');
      }
    }
    if (Number.isSafeInteger(policy?.maxServicesInclusive) &&
        scope.services.length > policy.maxServicesInclusive) {
      excluded.add('too-many-services');
    }
  }

  const status = excluded.size > 0 ? 'excluded' : unknown.size > 0 ? 'unknown' : 'candidate';
  return {
    kind: 'small-change-shadow/v1',
    status,
    reasonCodes: [...excluded, ...unknown],
    authorizesApproval: false,
    evidenceTrust: 'unverified-input',
  };
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--input' || !args[1]) {
    throw new Error('Usage: node scripts/experiments/small-change-shadow.mjs --input <json-file>');
  }
  const file = args[1];
  if (statSync(file).size > MAX_INPUT_BYTES) {
    throw new Error('Input exceeds 1 MiB limit');
  }
  const result = assessSmallChangeShadow(JSON.parse(readFileSync(file, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Never echo user-provided JSON (it may contain sensitive information).
    process.stderr.write(`small-change-shadow: ${error.code ?? error.name ?? 'Error'}\n`);
    process.exitCode = 1;
  }
}
