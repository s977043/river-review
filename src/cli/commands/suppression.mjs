// `river suppression` subcommand handler.
//
// Extracted verbatim from src/cli.mjs main() as part of the CLI dispatch
// refactor (split main() into per-subcommand handlers). Behavior, messages,
// and exit codes are unchanged; only the enclosing function and the relative
// import depth differ from the original inline block.
import path from 'node:path';
import { ensureGitRepo } from '../../lib/git.mjs';
import { ProjectRulesError } from '../../lib/rules.mjs';
import { SkillLoaderError } from '../../../runners/core/skill-loader.mjs';

/**
 * Whether `error` is a failure to READ the skill metadata that `--skill`
 * looks its version up in (#2401), as opposed to a bug.
 *
 * loadAllSkillMetadata logs and skips a broken individual skill file, so what
 * escapes it is the schema (`loadSchema`: an fs error, or SkillLoaderError on
 * a JSON parse failure) or the skills directory itself (`listSkillFiles`: an
 * fs error from readdir). Node fs errors carry both `code` and `syscall`,
 * which is what separates them from a TypeError raised by a real bug.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isSkillMetadataReadError(error) {
  if (error instanceof SkillLoaderError) return true;
  return typeof error?.code === 'string' && typeof error?.syscall === 'string';
}

/**
 * Handle the `suppression` command (suppression add).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runSuppressionCommand(parsed, targetPath) {
  if (parsed.suppressionSubcommand !== 'add') {
    console.error(
      'Error: only `river suppression add` is supported (need: --fingerprint --feedback --rationale).'
    );
    return 1;
  }
  if (!parsed.suppressionFingerprint) {
    console.error('Error: --fingerprint <16-hex> is required.');
    return 1;
  }
  if (!/^[0-9a-f]{16}$/.test(parsed.suppressionFingerprint)) {
    console.error('Error: --fingerprint must be exactly 16 lowercase hex chars.');
    return 1;
  }
  if (!parsed.suppressionFeedbackType) {
    console.error(
      'Error: --feedback <false_positive|accepted_risk|wont_fix|not_relevant|duplicate> is required.'
    );
    return 1;
  }
  const validFeedback = new Set([
    'false_positive',
    'accepted_risk',
    'wont_fix',
    'not_relevant',
    'duplicate',
  ]);
  if (!validFeedback.has(parsed.suppressionFeedbackType)) {
    console.error('Error: --feedback must be one of: ' + [...validFeedback].join(', ') + '.');
    return 1;
  }
  if (!parsed.suppressionRationale) {
    console.error('Error: --rationale "<why this finding is being suppressed>" is required.');
    return 1;
  }
  const validScope = new Set(['global', 'subsystem', 'file']);
  if (!validScope.has(parsed.suppressionScope)) {
    console.error('Error: --scope must be one of: global, subsystem, file.');
    return 1;
  }
  // #2401: `--skill` takes the same argv as `feedback add --skill` (one parse
  // helper) and the same value rule: trimmed, blank rejected, and an id that
  // no skill carries still recorded as given (feedback add does not check it
  // against the registry either).
  let skillId;
  if (typeof parsed.suppressionSkillId === 'string') {
    skillId = parsed.suppressionSkillId.trim();
    if (!skillId) {
      console.error('Error: --skill must not be blank.');
      return 1;
    }
  }
  const repoRoot = await ensureGitRepo(targetPath);
  const indexPath = path.resolve(repoRoot, '.river', 'memory', 'index.json');
  const { createSuppression, resolveSuppressionProvenance } =
    await import('../../lib/suppression.mjs');
  // #2401: record the project-rules digest (#2202 Phase 0) through the SSoT.
  // Provenance is record-only, so a failure to read the project rules must not
  // fail the suppression itself: only ProjectRulesError is caught, the key is
  // left out, and the user is told why. Anything else is a real bug and throws.
  let provenance = {};
  try {
    provenance = await resolveSuppressionProvenance({ repoRoot });
  } catch (error) {
    if (!(error instanceof ProjectRulesError)) throw error;
    console.warn(`Warning: rulesDigest not recorded on this suppression: ${error.message}`);
  }
  // #2401: skillId / skillVersion from `--skill`, resolved separately from the
  // digest so that a failure on one side never drops the other. Same policy:
  // a failure to read the skill metadata only drops skillVersion (skillId is
  // the caller's own input and is still resolved through the SSoT, with no
  // skills to look the version up in); anything else throws.
  if (skillId === 'unknown') {
    // resolveSuppressionProvenance never records 'unknown': it is the ruleId of
    // a finding that no skill produced, not the id of a skill.
    console.warn(
      'Warning: skillId not recorded on this suppression: "unknown" is the placeholder for a finding with no skill, not a skill id.'
    );
  } else if (skillId !== undefined) {
    let skillProvenance;
    try {
      skillProvenance = await resolveSuppressionProvenance({ ruleId: skillId });
    } catch (error) {
      if (!isSkillMetadataReadError(error)) throw error;
      console.warn(`Warning: skillVersion not recorded on this suppression: ${error.message}`);
      skillProvenance = await resolveSuppressionProvenance({ ruleId: skillId, skills: [] });
    }
    provenance = { ...provenance, ...skillProvenance };
  }
  const entry = createSuppression({
    indexPath,
    findingId: parsed.suppressionFindingId,
    fingerprint: parsed.suppressionFingerprint,
    // #1797: opt-in; parseArgs defaults this to 'v1' and rejects any value
    // outside the schema enum, so createSuppression never sees an unknown algo.
    ...(parsed.suppressionFingerprintAlgo
      ? { fingerprintAlgo: parsed.suppressionFingerprintAlgo }
      : {}),
    feedbackType: parsed.suppressionFeedbackType,
    scope: parsed.suppressionScope,
    rationale: parsed.suppressionRationale,
    severity: parsed.suppressionSeverity,
    filePaths: parsed.suppressionFiles,
    expiresAt: parsed.suppressionExpiresAt,
    prNumber: parsed.suppressionPrNumber,
    ...provenance,
  });
  console.log('Suppression created: ' + entry.id);
  console.log('  fingerprint: ' + entry.context.fingerprint);
  console.log('  fingerprintAlgo: ' + entry.context.fingerprintAlgo);
  console.log('  feedbackType: ' + entry.context.feedbackType);
  console.log('  scope: ' + entry.context.scope);
  if (entry.context.severity) console.log('  severity: ' + entry.context.severity);
  if (entry.context.skillId) console.log('  skillId: ' + entry.context.skillId);
  if (entry.context.skillVersion) console.log('  skillVersion: ' + entry.context.skillVersion);
  if (entry.context.rulesDigest) console.log('  rulesDigest: ' + entry.context.rulesDigest);
  console.log('  written to: ' + indexPath);
  return 0;
}
