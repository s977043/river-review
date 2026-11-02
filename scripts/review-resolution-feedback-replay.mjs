import { pathToFileURL } from 'node:url';

// Operator replay for #2575. References and actor fields are unverified input.
// No persistence, network, authentication, new judgment policy or Gate effects.
export const MAX_REPLAY_BYTES = 1024 * 1024;
const MAX_ITEMS = 100;
const MAX_SOURCE_FINDINGS = 1000;
const MAX_EXISTING_FEEDBACK = 10000;

export class FeedbackReplayError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FeedbackReplayError';
    this.code = code;
  }
}

function fail(code) {
  throw new FeedbackReplayError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseReplayInput(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_REPLAY_BYTES) {
    fail('input_too_large');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('invalid_json');
  }
  if (!isRecord(value)) fail('invalid_input');
  const pending = [[value, 0]];
  while (pending.length > 0) {
    const [item, depth] = pending.pop();
    if (depth > 64) fail('input_too_deep');
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) pending.push([child, depth + 1]);
    }
  }
  return value;
}

function checkSnapshot(input) {
  const items = input?.reviewResolution?.items;
  if (!isRecord(input) || !Array.isArray(items) || items.length === 0) {
    fail('invalid_producer_input');
  }
  if (items.length > MAX_ITEMS) fail('too_many_resolution_items');
  if (
    input.sourceFindings !== undefined &&
    (!Array.isArray(input.sourceFindings) || input.sourceFindings.length > MAX_SOURCE_FINDINGS)
  ) {
    fail('invalid_source_findings');
  }
}

function summary(proposal) {
  return {
    status: proposal.status,
    reasonCode: proposal.reasonCode,
    feedbackType: proposal.feedbackType,
  };
}

function sameFinding(left, right) {
  return ['findingId', 'fingerprint', 'fingerprintAlgo'].every(
    (key) => left?.[key] === right?.[key]
  );
}

/**
 * Re-run the shipped contracts on explicit snapshots. A successful simulation
 * does NOT establish authentic artifacts, current host state or Human consent.
 * Returns no Feedback entry, actor, rationale, source text or audit payload.
 */
export async function replayResolutionFeedback(input) {
  if (!isRecord(input)) fail('invalid_input');
  checkSnapshot(input.producerInput);
  const { findingIndex } = input;
  if (
    !Number.isInteger(findingIndex) ||
    findingIndex < 0 ||
    findingIndex >= input.producerInput.reviewResolution.items.length
  ) {
    fail('invalid_finding_index');
  }
  const hasApproval = Object.hasOwn(input, 'approval');
  if (hasApproval) {
    checkSnapshot(input.currentInput);
    if (
      !Array.isArray(input.existingFeedback) ||
      input.existingFeedback.length > MAX_EXISTING_FEEDBACK
    ) {
      fail('existing_feedback_snapshot_required');
    }
  }

  const { buildReviewResolutionFeedbackProposals } = await import(
    '../src/lib/review-resolution-feedback.mjs'
  );
  const {
    approveReviewResolutionFeedbackProposal,
    reviewResolutionFeedbackProposalDigest,
    ReviewResolutionFeedbackApprovalError,
  } = await import('../src/lib/review-resolution-feedback-approval.mjs');

  try {
    const proposal = buildReviewResolutionFeedbackProposals(input.producerInput)[findingIndex];
    const report = {
      kind: 'review-resolution-feedback-replay',
      scope: 'single-finding',
      mode: 'read-only',
      inputTrust: 'unverified',
      humanAuthentication: 'not_verified',
      authorizesFeedbackWrite: false,
      qualifiesDogfoodCase: false,
      findingIndex,
      proposal: summary(proposal),
      proposalDigest:
        proposal.status === 'candidate' ? reviewResolutionFeedbackProposalDigest(proposal) : null,
      currentProposal: null,
      approval: { status: 'not_supplied', reasonCode: null },
    };
    if (!hasApproval) return report;
    if (proposal.status !== 'candidate') {
      report.approval = { status: 'not_approvable', reasonCode: 'not_an_approvable_candidate' };
      return report;
    }

    // Rebuild from caller-supplied current evidence, never clone the old proposal.
    // Select by identity rather than index: finding order may have changed.
    const matches = buildReviewResolutionFeedbackProposals(input.currentInput).filter((item) =>
      sameFinding(item.findingRef, proposal.findingRef)
    );
    if (matches.length !== 1) {
      report.approval = { status: 'rejected', reasonCode: 'current_finding_not_unique' };
      return report;
    }
    report.currentProposal = summary(matches[0]);
    try {
      const result = approveReviewResolutionFeedbackProposal({
        proposal,
        currentProposal: matches[0],
        currentRevision: input.currentInput.currentRevision,
        approval: input.approval,
        existingFeedback: input.existingFeedback,
        trigger: 'eval-regression',
      });
      report.approval = { status: result.status, reasonCode: null };
    } catch (error) {
      if (!(error instanceof ReviewResolutionFeedbackApprovalError)) throw error;
      report.approval = { status: 'rejected', reasonCode: error.code };
    }
    return report;
  } catch (error) {
    if (error instanceof FeedbackReplayError) throw error;
    // Production validators can include finding IDs in messages; never echo them.
    fail('invalid_contract_input');
  }
}

/** Read only explicit stdin, with bounded bytes and a finite wait. */
export function readReplayInput(stream, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => finish(new FeedbackReplayError('input_timeout')), timeoutMs);
    function finish(error, text) {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
      stream.pause();
      if (error) reject(error);
      else resolve(text);
    }
    function onData(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_REPLAY_BYTES) {
        finish(new FeedbackReplayError('input_too_large'));
        return;
      }
      chunks.push(bytes);
    }
    function onEnd() {
      try {
        finish(null, new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        finish(new FeedbackReplayError('invalid_utf8'));
      }
    }
    function onError() {
      finish(new FeedbackReplayError('input_read_failed'));
    }
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
    stream.resume();
  });
}

const HELP = `Usage: node scripts/review-resolution-feedback-replay.mjs < evidence.json

JSON input: {producerInput, findingIndex, currentInput?, approval?, existingFeedback?}
producerInput/currentInput use buildReviewResolutionFeedbackProposals options.
Approval replay requires currentInput and an explicit existingFeedback array.
No approvals are created. Only one explicitly selected finding is replayed.
Input limit: 1 MiB. Stdin timeout: 5 seconds. No input-file discovery or writes.
Exit 0: ready/duplicate contract replay, NOT authenticated approval or permission.
Exit 2: invalid input/execution error. Exit 3: no approvable outcome.
Output omits actors, rationales, source text, Feedback entries and raw exceptions.
Real Human authentication and the 5-10 PR dogfood acceptance remain outside this tool.
`;

export async function runFeedbackReplayCli(args, stdin, stdout, stderr) {
  if (args.length === 1 && args[0] === '--help') {
    stdout.write(HELP);
    return 0;
  }
  try {
    if (args.length !== 0) fail('invalid_arguments');
    if (stdin.isTTY) fail('stdin_required');
    const input = parseReplayInput(await readReplayInput(stdin));
    const report = await replayResolutionFeedback(input);
    stdout.write(`${JSON.stringify(report)}\n`);
    return ['ready', 'duplicate'].includes(report.approval.status) ? 0 : 3;
  } catch (error) {
    const code = error instanceof FeedbackReplayError ? error.code : 'replay_failed';
    stderr.write(`${JSON.stringify({ error: code })}\n`);
    stdin.destroy();
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runFeedbackReplayCli(
    process.argv.slice(2),
    process.stdin,
    process.stdout,
    process.stderr
  );
}
