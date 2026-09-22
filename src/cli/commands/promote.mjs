// `river promote` subcommand handler (Judgment Promotion Loop Phase 2,
// #1568-B / #1622).
//
// Turns Phase 1 promotion_candidate entries into human-approved, PR-ready
// scaffolds. Generation (Phase 1) and approval (this command) stay separated:
// `promote` never creates candidates — it only lists, decides on, and scaffolds
// existing ones.
//
// The one exception is `propose` (#1624 / #1574 P0 contract 4): the stable
// generation entry point that turns an explicit feedback selection into a
// content-addressed candidate. It stays a pure, deterministic converter —
// deciding *whether* a cluster deserves promotion remains the caller's job.
//
// Subcommands:
//   river promote propose              Create/converge on a candidate from --input JSONL
//   river promote list                 List promotion candidates
//   river promote approve <id>         Approve a candidate (promotionStatus -> approved)
//   river promote reject  <id>         Reject a candidate  (promotionStatus -> archived)
//   river promote retarget <id>         Change proposedTarget with an audit trail
//   river promote template [<id>]      Emit PR scaffold(s) for approved candidate(s)
//   river promote retire               Archive expired candidates + sync promotionStatus (Phase 3)
//   river promote review-effectiveness Flag needs_review on negative post-activation feedback (Phase 3)
//
// The approval decision records who/when (context.approval) for auditability.
// `now` is injected via RIVER_NOW (ISO string) so tests can pin it.
import path from 'node:path';
import process from 'node:process';
import { ensureGitRepo } from '../../lib/git.mjs';
import { loadMemory } from '../../lib/riverbed-memory.mjs';
import { listFeedbackEntries } from '../../lib/feedback.mjs';
import {
  listPromotionCandidates,
  decidePromotion,
  retargetPromotion,
  buildPrScaffold,
  getPromotionCandidate,
  retirePromotions,
  reviewPromotionEffectiveness,
  DEFAULT_EFFECTIVENESS_THRESHOLD,
  DECISION_STATUS,
} from '../../lib/promotion.mjs';
import {
  PromotionProposalError,
  proposePromotionCandidate,
  readFeedbackJsonl,
} from '../../lib/promotion-candidates.mjs';

/** Resolve `now` from RIVER_NOW (external injection) or fall back to real time. */
function resolveNow() {
  const raw = process.env.RIVER_NOW;
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`RIVER_NOW is not a valid date: ${raw}`);
  }
  return parsed;
}

/** Resolve the Riverbed index path: explicit --index, else the repo's .river/memory. */
async function resolveIndexPath(parsed, targetPath) {
  if (parsed.promoteIndex) {
    return path.resolve(process.cwd(), parsed.promoteIndex);
  }
  const repoRoot = await ensureGitRepo(targetPath);
  return path.resolve(repoRoot, '.river', 'memory', 'index.json');
}

function printCandidate(entry) {
  const pc = getPromotionCandidate(entry);
  console.log(`- ${entry.id}`);
  console.log(`    clusterKey:       ${pc.clusterKey}`);
  console.log(`    recurrenceCount:  ${pc.recurrenceCount}`);
  console.log(`    promotionStatus:  ${pc.promotionStatus}`);
  console.log(
    `    proposedTarget:   ${pc.proposedTarget?.kind}${pc.proposedTarget?.id ? ` (${pc.proposedTarget.id})` : ''}`
  );
  console.log(
    `    scope.paths:      ${pc.scope?.paths?.length ? pc.scope.paths.join(', ') : '(none)'}`
  );
  console.log(`    expiresAt:        ${entry.expiresAt ?? '(none)'}`);
  console.log(`    rationale:        ${pc.rationale}`);
}

function printScaffold(scaffold) {
  console.log(`# ${scaffold.id} (${scaffold.clusterKey})`);
  if (!scaffold.eligible) {
    console.log(`  skipped: ${scaffold.note}`);
    return;
  }
  if (scaffold.requiresPlanGate) {
    console.log(`  PlanGate: ${scaffold.note}`);
  } else if (scaffold.note) {
    console.log(`  note: ${scaffold.note}`);
  }
  if (scaffold.branchName) console.log(`  branch: ${scaffold.branchName}`);
  if (scaffold.prTitle) console.log(`  title:  ${scaffold.prTitle}`);
  if (scaffold.targetPaths.length) console.log(`  paths:  ${scaffold.targetPaths.join(', ')}`);
  if (scaffold.prBody) {
    console.log('  --- body ---');
    for (const line of scaffold.prBody.split('\n')) console.log(`  ${line}`);
    console.log('  --- end body ---');
  }
}

/**
 * Handle the `promote` command.
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runPromoteCommand(parsed, targetPath) {
  const sub = parsed.promoteSubcommand;
  // A mistyped option must never be silently ignored: `--dry-rnu` would
  // otherwise leave dryRun false and let `propose` write the index for real.
  if (parsed.promoteUnknownOption) {
    console.error(
      `Error: unknown option for promote: ${parsed.promoteUnknownOption}. Use: --input --cluster-key --policy-version --target-kind --target-id --approver --reason --index --threshold --feedback-root --include-inactive --output --dry-run`
    );
    return 1;
  }
  if (
    ![
      'propose',
      'list',
      'approve',
      'reject',
      'retarget',
      'template',
      'retire',
      'review-effectiveness',
    ].includes(sub)
  ) {
    console.error(
      'Error: usage: river promote <propose|list|approve <id>|reject <id>|retarget <id>|template [<id>]|retire|review-effectiveness [<id>]> [--input <jsonl>] [--cluster-key <skillId::feedbackType>] [--policy-version <v>] [--target-kind <kind>] [--target-id <id>] [--approver <name>] [--reason <text>] [--index <path>] [--threshold <n>] [--feedback-root <path>] [--output json] [--include-inactive] [--dry-run].'
    );
    return 1;
  }

  const indexPath = await resolveIndexPath(parsed, targetPath);
  const now = resolveNow();

  if (sub === 'propose') {
    if (!parsed.promoteInput || !parsed.promoteClusterKey) {
      console.error(
        'Error: river promote propose requires --input <jsonl> and --cluster-key <skillId::feedbackType>.'
      );
      return 1;
    }
    let result;
    try {
      const entries = await readFeedbackJsonl(path.resolve(process.cwd(), parsed.promoteInput));
      result = proposePromotionCandidate({
        entries,
        clusterKey: parsed.promoteClusterKey,
        indexPath,
        now,
        policyVersion: parsed.promotePolicyVersion ?? undefined,
        min: parsed.promoteThreshold ?? undefined,
        dryRun: Boolean(parsed.dryRun),
      });
    } catch (err) {
      // Contract violations (bad cluster key, mismatched or malformed input,
      // unreadable file) map to exit 1, matching the rest of `promote`. The
      // script's "candidates found -> exit 2" signal is deliberately not
      // carried over: propose is a generation API, not a detection API.
      // Anything else (unexpected runtime / git errors) is rethrown so the
      // CLI's outer handler can attach its Hints.
      if (!(err instanceof PromotionProposalError)) throw err;
      console.error(`Error: ${err.message}`);
      return 1;
    }
    if (result.duplicatesRemoved) {
      console.warn(
        `Warning: --input contained ${result.duplicatesRemoved} duplicate evidence row(s); ${result.evidenceCount} unique item(s) were used.`
      );
    }
    if (result.convergenceNote) {
      console.warn(`Warning: converged (${result.convergenceNote}).`);
    }
    if (parsed.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (result.created) {
      console.log(`Created promotion candidate ${result.candidateId}.`);
    } else if (result.dryRun) {
      console.log(
        result.wouldCreate
          ? `[dry-run] Would create promotion candidate ${result.candidateId} (nothing written).`
          : `[dry-run] Promotion candidate ${result.candidateId} already exists (nothing written).`
      );
    } else {
      console.log(
        `Promotion candidate ${result.candidateId} already exists (converged, no change).`
      );
    }
    console.log(`  clusterKey:      ${result.clusterKey}`);
    console.log(`  contentHash:     ${result.contentHash}`);
    console.log(`  policyVersion:   ${result.policyVersion}`);
    if (result.shadowOnly) {
      console.log(
        '  note: evidence without findingFingerprint — shadow-only (no automatic experiment).'
      );
    }
    if (result.existing) {
      console.log(`  promotionStatus: ${result.existing.promotionStatus ?? '(unknown)'}`);
    }
    if (result.created) console.log(`  written to: ${indexPath}`);
    return 0;
  }

  if (sub === 'list') {
    const index = loadMemory(indexPath);
    const candidates = listPromotionCandidates(index, {
      includeInactive: Boolean(parsed.promoteIncludeInactive),
    });
    if (parsed.output === 'json') {
      console.log(JSON.stringify({ count: candidates.length, candidates }, null, 2));
      return 0;
    }
    if (!candidates.length) {
      console.log('No promotion candidates found.');
      return 0;
    }
    console.log(`Promotion candidates (${candidates.length}):\n`);
    for (const entry of candidates) printCandidate(entry);
    return 0;
  }

  if (sub === 'approve' || sub === 'reject') {
    if (!parsed.promoteId) {
      console.error(`Error: river promote ${sub} requires a candidate <id>.`);
      return 1;
    }
    // `decision` は VALID_DECISIONS の語彙（承認/却下の入力）であり、
    // DECISION_STATUS の値（promotionStatus）とは別軸。綴りが一致するだけ。
    const decision = sub === 'approve' ? 'approved' : 'rejected'; // vocab-literal-ignore
    const approver =
      parsed.promoteApprover ||
      process.env.RIVER_APPROVER ||
      process.env.USER ||
      process.env.USERNAME || // Windows
      'unknown';
    let result;
    try {
      result = decidePromotion({
        indexPath,
        id: parsed.promoteId,
        decision,
        approver,
        reason: parsed.promoteReason ?? null,
        now,
      });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      return 1;
    }
    const pc = getPromotionCandidate(result.entry);
    if (!result.changed) {
      console.log(`Candidate ${result.entry.id} already ${decision} (no change).`);
      return 0;
    }
    if (result.warning) {
      console.warn(`Warning: ${result.warning}`);
    }
    console.log(`Candidate ${result.entry.id} ${decision}.`);
    console.log(`  promotionStatus: ${pc.promotionStatus}`);
    console.log(`  approver: ${approver}`);
    console.log(`  decidedAt: ${result.entry.context.approval.decidedAt}`);
    // Rejecting a candidate that was previously approved invalidates any PR
    // scaffold already generated from it; make the orphaning explicit.
    // ここも decision 軸（VALID_DECISIONS）の比較。promotionStatus ではない。
    if (
      decision === 'rejected' &&
      result.previousDecision === 'approved' // vocab-literal-ignore
    ) {
      console.log(
        '  note: any PR scaffold previously generated for this candidate is now invalid (regenerate after a fresh approval).'
      );
    }
    console.log(`  written to: ${indexPath}`);
    return 0;
  }

  if (sub === 'retarget') {
    if (!parsed.promoteId) {
      console.error('Error: river promote retarget requires a candidate <id>.');
      return 1;
    }
    if (!parsed.promoteTargetKind) {
      console.error('Error: river promote retarget requires --target-kind <kind>.');
      return 1;
    }
    if (!parsed.promoteReason) {
      console.error('Error: river promote retarget requires --reason <text>.');
      return 1;
    }

    const approver = parsed.promoteApprover || process.env.RIVER_APPROVER || null;
    if (!approver) {
      console.error('Error: river promote retarget requires an auditable approver.');
      return 1;
    }

    let result;
    try {
      result = retargetPromotion({
        indexPath,
        id: parsed.promoteId,
        kind: parsed.promoteTargetKind,
        targetId: parsed.promoteTargetId ?? null,
        approver,
        reason: parsed.promoteReason,
        now,
      });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      return 1;
    }

    const pc = getPromotionCandidate(result.entry);
    if (!result.changed) {
      console.log(
        `Candidate ${result.entry.id} already targets ${pc.proposedTarget.kind}${pc.proposedTarget.id ? ` (${pc.proposedTarget.id})` : ''} (no change).`
      );
      return 0;
    }

    console.log(`Candidate ${result.entry.id} retargeted.`);
    console.log(
      `  target: ${result.previousTarget.kind} -> ${result.target.kind}${result.target.id ? ` (${result.target.id})` : ''}`
    );
    console.log(`  approver: ${approver}`);
    console.log(`  decidedAt: ${result.record.decidedAt}`);
    if (result.approvalReset) {
      console.log('  approval: reset; candidate must be approved again for the new target');
    }
    console.log(`  written to: ${indexPath}`);
    return 0;
  }

  if (sub === 'retire') {
    let out;
    try {
      out = retirePromotions({ indexPath, now });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      return 1;
    }
    if (parsed.output === 'json') {
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    // Candidates skipped because expiresAt is unparseable (#1756). Printed
    // before the outcome so the skip is never silent, including on the
    // "nothing to retire" path.
    for (const warning of out.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (!out.count) {
      console.log('No promotion candidates to retire.');
      return 0;
    }
    console.log(`Retired ${out.count} promotion candidate(s):`);
    for (const r of out.results) {
      const parts = [];
      if (r.willExpire) parts.push('expired (entry archived)');
      if (r.statusSync) parts.push(`promotionStatus ${r.statusSync.from} -> ${r.statusSync.to}`);
      console.log(`- ${r.id}: ${parts.join('; ')}`);
    }
    console.log(`  written to: ${indexPath}`);
    return 0;
  }

  if (sub === 'review-effectiveness') {
    const feedbackRoot = parsed.promoteFeedbackRoot
      ? path.resolve(process.cwd(), parsed.promoteFeedbackRoot)
      : await ensureGitRepo(targetPath);
    const feedbackEntries = await listFeedbackEntries({
      repoRoot: feedbackRoot,
      warn: (msg) => console.warn(msg),
    });
    const threshold = parsed.promoteThreshold ?? DEFAULT_EFFECTIVENESS_THRESHOLD;
    let out;
    try {
      out = reviewPromotionEffectiveness({
        indexPath,
        feedbackEntries,
        now,
        threshold,
        reviewer: parsed.promoteApprover ?? null,
        id: parsed.promoteId ?? null,
      });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      return 1;
    }
    if (parsed.output === 'json') {
      console.log(JSON.stringify({ threshold, ...out }, null, 2));
      return 0;
    }
    if (!out.count) {
      console.log('No promotion candidates to review.');
      return 0;
    }
    console.log(`Reviewed ${out.count} promotion candidate(s) (threshold ${threshold}):`);
    for (const r of out.results) {
      const m = r.metrics;
      const summary = `negative=${m.negativeCount} (clusterRecurrence=${m.clusterRecurrenceCount}, reversal=${m.reversalCount}), related=${m.related}`;
      if (r.changed) {
        console.log(`- ${r.id}: FLAGGED needs_review — ${summary}`);
      } else if (!r.eligible) {
        console.log(`- ${r.id}: skipped — ${r.note}`);
      } else {
        console.log(`- ${r.id}: retained — ${summary}`);
      }
    }
    if (out.flagged) console.log(`  written to: ${indexPath}`);
    return 0;
  }

  // template
  const index = loadMemory(indexPath);
  let entries;
  if (parsed.promoteId) {
    const entry = listPromotionCandidates(index, { includeInactive: true }).find(
      (e) => e.id === parsed.promoteId
    );
    if (!entry) {
      console.error(`Error: No promotion_candidate entry with id: ${parsed.promoteId}`);
      return 1;
    }
    entries = [entry];
  } else {
    // Only approved candidates get scaffolds; rejected (archived) ones are excluded.
    entries = listPromotionCandidates(index).filter(
      (e) => getPromotionCandidate(e)?.promotionStatus === DECISION_STATUS.approved
    );
  }

  const scaffolds = entries.map((e) => buildPrScaffold(e));
  if (parsed.output === 'json') {
    console.log(JSON.stringify({ count: scaffolds.length, scaffolds }, null, 2));
    return 0;
  }
  if (!scaffolds.length) {
    console.log('No approved promotion candidates to scaffold.');
    return 0;
  }
  for (const scaffold of scaffolds) printScaffold(scaffold);
  return 0;
}
