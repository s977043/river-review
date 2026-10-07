import {
  organizeReviewResolution,
  renderReviewResolutionMarkdown,
  resolveReviewResolutionFindingRef,
} from './review-resolution-organizer.mjs';
import { AUTHOR_RESPONSE_STATES, assertReviewResolutionSemantics } from './review-resolution.mjs';

export const REVIEW_RESOLUTION_HOST_MARKER = '<!-- river-review-resolution -->';

export class ReviewResolutionHostError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReviewResolutionHostError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeRationale(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReviewResolutionHostError(
      'invalid_author_response',
      'author response rationale must be null or a non-empty string'
    );
  }
  return value;
}

export function renderReviewResolutionHostComment(projection) {
  return `${REVIEW_RESOLUTION_HOST_MARKER}\n${renderReviewResolutionMarkdown(projection)}`;
}

/**
 * Build an immutable proposal that changes only authorResponse for one finding.
 *
 * Finding identity uses the same resolver as the deterministic Organizer.
 * This function does not write files/comments and never changes resolution or
 * verification state. The caller owns persistence and host-side mutation.
 */
export function proposeAuthorResponseUpdate({
  findings = [],
  reviewResolution,
  target,
  response,
} = {}) {
  if (!AUTHOR_RESPONSE_STATES.includes(response?.state)) {
    throw new ReviewResolutionHostError(
      'invalid_author_response',
      'author response state is outside the Review Resolution vocabulary'
    );
  }

  const resolvedTarget = resolveReviewResolutionFindingRef(findings, target ?? {});
  if (resolvedTarget.status === 'ambiguous') {
    throw new ReviewResolutionHostError(
      'ambiguous_target',
      'author response target matches multiple findings',
      resolvedTarget
    );
  }
  if (resolvedTarget.status === 'orphan') {
    throw new ReviewResolutionHostError(
      'orphan_target',
      'author response target matches no finding',
      { target: clone(target ?? {}) }
    );
  }

  const projection = organizeReviewResolution({
    findings,
    reviewResolution,
  });
  const matches = projection.findings[resolvedTarget.findingIndex]?.resolutionMatches ?? [];

  if (matches.length === 0) {
    throw new ReviewResolutionHostError(
      'orphan_resolution',
      'matched finding has no Review Resolution item',
      { findingIndex: resolvedTarget.findingIndex }
    );
  }
  if (matches.length > 1) {
    throw new ReviewResolutionHostError(
      'ambiguous_resolution',
      'matched finding has multiple Review Resolution items',
      {
        findingIndex: resolvedTarget.findingIndex,
        resolutionIndexes: matches.map((match) => match.resolutionIndex),
      }
    );
  }

  const proposal = clone(reviewResolution);
  const resolutionIndex = matches[0].resolutionIndex;
  proposal.items[resolutionIndex].authorResponse = {
    state: response.state,
    rationale: normalizeRationale(response.rationale),
  };

  assertReviewResolutionSemantics(proposal);
  return proposal;
}
