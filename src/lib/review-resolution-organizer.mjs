import { normalizeCoverageStatus } from './review-coverage.mjs';

export const REVIEW_RESOLUTION_PROJECTION_SCHEMA_VERSION = '1';
export const REVIEW_RESOLUTION_PROJECTION_KIND = 'review-resolution-projection';

export const REVIEW_RESOLUTION_WARNING_CODES = Object.freeze([
  'ambiguous_finding_id',
  'ambiguous_fingerprint',
  'identity_mismatch',
  'multiple_resolution_items',
  'orphan_resolution',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushMap(map, key, index) {
  if (!nonEmptyString(key)) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(index);
}

function findingFingerprintForAlgo(finding, algo) {
  if (algo === 'v2') return finding?.fingerprintV2 ?? null;
  return finding?.fingerprint ?? null;
}

function top3RankForFinding(finding, top3Findings) {
  const id = nonEmptyString(finding?.id) ? finding.id : null;
  const fingerprint = nonEmptyString(finding?.fingerprint) ? finding.fingerprint : null;

  for (let index = 0; index < top3Findings.length; index++) {
    const candidate = top3Findings[index];
    if (id && candidate?.id === id) return index + 1;
    if (!id && fingerprint && candidate?.fingerprint === fingerprint) return index + 1;
  }
  return null;
}

function coverageProjection(reviewCoverage) {
  const status = normalizeCoverageStatus(reviewCoverage);
  const incompleteRequiredUnitIds =
    status === 'partial' || status === 'not_executed'
      ? [...new Set((reviewCoverage?.incompleteRequiredUnitIds ?? []).filter(nonEmptyString))]
      : [];

  return {
    status,
    incompleteRequiredUnitIds,
  };
}

function buildFindingIndexes(findings) {
  const byId = new Map();
  const byV1Fingerprint = new Map();
  const byV2Fingerprint = new Map();

  findings.forEach((finding, index) => {
    pushMap(byId, finding?.id, index);
    pushMap(byV1Fingerprint, finding?.fingerprint, index);
    pushMap(byV2Fingerprint, finding?.fingerprintV2, index);
  });

  return { byId, byV1Fingerprint, byV2Fingerprint };
}

function fingerprintCandidates(indexes, findingRef) {
  const fingerprint = findingRef?.fingerprint;
  if (!nonEmptyString(fingerprint)) return [];
  const map = findingRef?.fingerprintAlgo === 'v2' ? indexes.byV2Fingerprint : indexes.byV1Fingerprint;
  return map.get(fingerprint) ?? [];
}

function warning(code, resolutionIndex, details = {}) {
  return { code, resolutionIndex, ...details };
}

function joinResolutionItems(findings, resolutionItems) {
  const indexes = buildFindingIndexes(findings);
  const matchesByFinding = findings.map(() => []);
  const warnings = [];

  resolutionItems.forEach((item, resolutionIndex) => {
    const findingRef = item?.findingRef ?? {};
    const findingIdCandidates = nonEmptyString(findingRef.findingId)
      ? (indexes.byId.get(findingRef.findingId) ?? [])
      : [];

    if (findingIdCandidates.length > 1) {
      warnings.push(
        warning('ambiguous_finding_id', resolutionIndex, {
          findingId: findingRef.findingId,
          candidateFindingIndexes: [...findingIdCandidates],
        })
      );
      return;
    }

    if (findingIdCandidates.length === 1) {
      const findingIndex = findingIdCandidates[0];
      const finding = findings[findingIndex];
      const expectedFingerprint = findingFingerprintForAlgo(finding, findingRef.fingerprintAlgo);
      if (
        nonEmptyString(findingRef.fingerprint) &&
        nonEmptyString(expectedFingerprint) &&
        findingRef.fingerprint !== expectedFingerprint
      ) {
        warnings.push(
          warning('identity_mismatch', resolutionIndex, {
            findingIndex,
            findingId: findingRef.findingId,
            fingerprintAlgo: findingRef.fingerprintAlgo,
          })
        );
      }
      matchesByFinding[findingIndex].push({
        matchBasis: 'finding_id',
        resolutionIndex,
        item: clone(item),
      });
      return;
    }

    const fingerprintMatches = fingerprintCandidates(indexes, findingRef);
    if (fingerprintMatches.length > 1) {
      warnings.push(
        warning('ambiguous_fingerprint', resolutionIndex, {
          fingerprint: findingRef.fingerprint,
          fingerprintAlgo: findingRef.fingerprintAlgo,
          candidateFindingIndexes: [...fingerprintMatches],
        })
      );
      return;
    }

    if (fingerprintMatches.length === 1) {
      const findingIndex = fingerprintMatches[0];
      matchesByFinding[findingIndex].push({
        matchBasis: 'fingerprint',
        resolutionIndex,
        item: clone(item),
      });
      return;
    }

    warnings.push(
      warning('orphan_resolution', resolutionIndex, {
        findingId: findingRef.findingId ?? null,
        fingerprint: findingRef.fingerprint ?? null,
        fingerprintAlgo: findingRef.fingerprintAlgo ?? null,
      })
    );
  });

  matchesByFinding.forEach((matches, findingIndex) => {
    if (matches.length <= 1) return;
    warnings.push(
      warning('multiple_resolution_items', matches[0].resolutionIndex, {
        findingIndex,
        resolutionIndexes: matches.map((match) => match.resolutionIndex),
      })
    );
  });

  return { matchesByFinding, warnings };
}

/**
 * Build a deterministic, host-neutral projection of all findings and their
 * Review Resolution state.
 *
 * The organizer is intentionally projection-only:
 * - it never creates findings;
 * - it never computes or changes system disposition;
 * - it never changes Gate / merge decisions;
 * - it never mutates Review Artifact or Review Resolution inputs.
 */
export function organizeReviewResolution({
  findings = [],
  reviewResolution = null,
  teamLeadReport = null,
  reviewCoverage = null,
} = {}) {
  const sourceFindings = Array.isArray(findings) ? findings : [];
  const resolutionItems = Array.isArray(reviewResolution?.items) ? reviewResolution.items : [];
  const top3Findings = Array.isArray(teamLeadReport?.top3Findings)
    ? teamLeadReport.top3Findings
    : [];
  const blindSpots = Array.isArray(teamLeadReport?.blindSpots) ? teamLeadReport.blindSpots : [];
  const { matchesByFinding, warnings } = joinResolutionItems(sourceFindings, resolutionItems);

  return {
    schemaVersion: REVIEW_RESOLUTION_PROJECTION_SCHEMA_VERSION,
    kind: REVIEW_RESOLUTION_PROJECTION_KIND,
    coverage: coverageProjection(reviewCoverage),
    blindSpots: clone(blindSpots),
    findings: sourceFindings.map((finding, index) => {
      const top3Rank = top3RankForFinding(finding, top3Findings);
      return {
        finding: clone(finding),
        priority: {
          inTop3: top3Rank !== null,
          top3Rank,
        },
        resolutionMatches: matchesByFinding[index],
      };
    }),
    warnings,
  };
}

function markdownText(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim();
}

function findingLabel(finding) {
  const id = nonEmptyString(finding?.id) ? finding.id : '<no-id>';
  const title = finding?.title ?? finding?.message ?? '';
  const file = nonEmptyString(finding?.file) ? finding.file : null;
  const line = Number.isInteger(finding?.lineStart)
    ? finding.lineStart
    : Number.isInteger(finding?.line)
      ? finding.line
      : null;
  const location = file ? `${file}${line ? `:${line}` : ''}` : null;
  return [id, title, location].filter((value) => value !== null && value !== '').join(' — ');
}

function renderMatchValues(matches, selector) {
  if (!Array.isArray(matches) || matches.length === 0) return '—';
  return matches
    .map((match) => selector(match?.item))
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(markdownText)
    .join('; ') || '—';
}

export function renderReviewResolutionMarkdown(projection) {
  const findings = Array.isArray(projection?.findings) ? projection.findings : [];
  const blindSpots = Array.isArray(projection?.blindSpots) ? projection.blindSpots : [];
  const warnings = Array.isArray(projection?.warnings) ? projection.warnings : [];
  const coverage = projection?.coverage ?? { status: 'unknown', incompleteRequiredUnitIds: [] };

  const lines = [
    '## Review Resolution',
    '',
    `Coverage: **${markdownText(coverage.status ?? 'unknown')}**`,
  ];

  if (coverage.incompleteRequiredUnitIds?.length > 0) {
    lines.push(
      `Incomplete required units: ${coverage.incompleteRequiredUnitIds.map(markdownText).join(', ')}`
    );
  }

  lines.push(
    '',
    '### Findings',
    '',
    '| Finding | Priority | System disposition | Author response | Resolution | Verification |',
    '| --- | --- | --- | --- | --- | --- |'
  );

  for (const entry of findings) {
    const matches = entry?.resolutionMatches ?? [];
    const priority = entry?.priority?.inTop3 ? `top${entry.priority.top3Rank}` : '—';
    lines.push(
      [
        markdownText(findingLabel(entry?.finding)),
        priority,
        renderMatchValues(matches, (item) => item?.systemJudgment?.disposition),
        renderMatchValues(matches, (item) => item?.authorResponse?.state),
        renderMatchValues(matches, (item) => item?.resolution?.state),
        renderMatchValues(matches, (item) => item?.verification?.state),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')
    );
  }

  lines.push('', '### Blind spots', '');
  if (blindSpots.length === 0) {
    lines.push('- None');
  } else {
    for (const spot of blindSpots) {
      const role = markdownText(spot?.role ?? '<unknown-role>');
      const label = markdownText(spot?.label ?? '');
      lines.push(`- ${role}${label ? ` — ${label}` : ''}`);
    }
  }

  lines.push('', '### Organizer warnings', '');
  if (warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const item of warnings) {
      lines.push(
        `- ${markdownText(item?.code ?? 'unknown_warning')} (resolution item ${item?.resolutionIndex ?? '—'})`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function renderReviewResolutionJson(projection) {
  return `${JSON.stringify(projection, null, 2)}\n`;
}
