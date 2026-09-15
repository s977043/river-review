import { promises as fs } from 'node:fs';
import path from 'node:path';

import { defaultPaths } from '../../runners/core/skill-loader.mjs';
import { detectApiCompatibilitySignals } from './api-compatibility-signals.mjs';
import { collectHeuristicDetections } from './heuristic-review.mjs';
import { observeReviewViewpoints } from './review-viewpoint-observer.mjs';
import { loadReviewViewpoints } from './review-viewpoints.mjs';

// Skill discovery already resolves the River Review package root, including the
// GitHub Action/ncc RIVER_REPO_ROOT override. Reuse that SSoT instead of
// re-deriving it from this module's __dirname, which changes after bundling.
const builtInSkillsRoot = defaultPaths.skillsDir;
const REVIEW_VIEWPOINT_MODES = new Set(['off', 'observe', 'active']);

const NEUTRAL_SIGNAL_PRODUCERS = new Map([
  ['api-compatibility', ({ diff }) => detectApiCompatibilitySignals({ diff })],
]);

export class ReviewViewpointStageError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ReviewViewpointStageError';
    this.details = details;
  }
}

function getSkillId(skill) {
  return skill?.metadata?.id ?? skill?.id ?? null;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function resolveTrustedBuiltInSkillPath(skillPath) {
  const resolved = path.resolve(skillPath);
  if (!isPathInside(path.resolve(builtInSkillsRoot), resolved)) return null;

  // Lexical containment alone is insufficient if a trusted-tree path is a
  // symlink. Canonicalize both sides before deriving references/viewpoints.yaml
  // so a symlink cannot escape the distributed skills root.
  const [realRoot, realSkillPath] = await Promise.all([
    fs.realpath(builtInSkillsRoot),
    fs.realpath(resolved),
  ]);
  return isPathInside(realRoot, realSkillPath) ? realSkillPath : null;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function groupHeuristicSignalsBySkill(detections) {
  const bySkill = new Map();
  for (const detection of detections) {
    if (!detection?.skillId) continue;
    const bucket = bySkill.get(detection.skillId) ?? [];
    const { skillId: _skillId, ...signal } = detection;
    bucket.push(signal);
    bySkill.set(detection.skillId, bucket);
  }
  return bySkill;
}

function dedupeObligations(obligations) {
  const seen = new Set();
  const deduped = [];
  for (const obligation of obligations) {
    if (!obligation?.id || seen.has(obligation.id)) continue;
    seen.add(obligation.id);
    deduped.push(obligation);
  }
  return deduped;
}

function compactSkillObservation(observation) {
  return {
    skillId: observation.skillId,
    signalCount: observation.signals.length,
    activatedViewpointIds: observation.applicableViewpoints.map((viewpoint) => viewpoint.id),
    obligationIds: observation.obligations.map((obligation) => obligation.id),
    comparison: observation.comparison,
  };
}

/**
 * Resolve selected built-in Skill knowledge into Review Obligations.
 *
 * Modes:
 * - off: return immediately without detector or filesystem work.
 * - observe: calculate activation and return debug-safe observation only.
 * - active: return the same observation plus obligations that callers may add
 *   to the LLM prompt.
 *
 * v1 deliberately refuses repository-owned/custom Skill paths. A selected Skill
 * must resolve under the same distributed `skills/` root used by Skill discovery
 * before `<skill>/references/viewpoints.yaml` is considered. This preserves the
 * trust boundary defined by #2252 while the schema remains experimental.
 *
 * @param {object} params
 * @param {object} params.reviewConfig merged review configuration
 * @param {object} params.diff raw parsed diff
 * @param {object} params.plan execution plan with selected Skills
 * @returns {Promise<null|{mode: 'observe'|'active', activeObligations: object[], observation: object}>}
 */
export async function runReviewViewpointStage({ reviewConfig, diff, plan }) {
  const mode = reviewConfig?.viewpoints?.mode ?? 'off';
  if (!REVIEW_VIEWPOINT_MODES.has(mode)) {
    throw new ReviewViewpointStageError(`Unsupported review viewpoints mode: ${String(mode)}`);
  }
  if (mode === 'off') return null;

  const selected = plan?.selected ?? [];
  const heuristicSignals = groupHeuristicSignalsBySkill(collectHeuristicDetections({ diff, plan }));
  const observations = [];
  const obligations = [];
  const skipped = [];
  const errors = [];

  for (const skill of selected) {
    const skillId = getSkillId(skill);
    if (!skillId) continue;

    const producer = NEUTRAL_SIGNAL_PRODUCERS.get(skillId);
    const producerSignals = producer ? producer({ diff, plan }) : [];
    const existingSignals = heuristicSignals.get(skillId) ?? [];
    const signals = [...existingSignals, ...producerSignals];

    const skillPath = skill?.path;
    if (typeof skillPath !== 'string' || skillPath.length === 0) {
      if (signals.length > 0) skipped.push({ skillId, reason: 'missing-skill-path' });
      continue;
    }

    let trustedSkillPath;
    try {
      trustedSkillPath = await resolveTrustedBuiltInSkillPath(skillPath);
    } catch (error) {
      if (mode === 'active') {
        throw new ReviewViewpointStageError(
          `Failed to resolve built-in Skill path for ${skillId}`,
          {
            cause: error,
            skillId,
          }
        );
      }
      errors.push({ skillId, code: 'skill-path-resolution-failed' });
      continue;
    }
    if (!trustedSkillPath) {
      if (signals.length > 0) skipped.push({ skillId, reason: 'outside-built-in-skills' });
      continue;
    }

    const viewpointsPath = path.join(
      path.dirname(trustedSkillPath),
      'references',
      'viewpoints.yaml'
    );
    let exists;
    try {
      exists = await fileExists(viewpointsPath);
    } catch (error) {
      if (mode === 'active') {
        throw new ReviewViewpointStageError(
          `Failed to inspect built-in viewpoints for ${skillId}`,
          {
            cause: error,
            skillId,
          }
        );
      }
      errors.push({ skillId, code: 'catalog-inspection-failed' });
      continue;
    }
    if (!exists) continue;

    try {
      const document = await loadReviewViewpoints(viewpointsPath, { expectedSkillId: skillId });
      const observation = observeReviewViewpoints(document, signals);
      observations.push(compactSkillObservation(observation));
      obligations.push(...observation.obligations);
    } catch (error) {
      if (mode === 'active') {
        throw new ReviewViewpointStageError(`Failed to load built-in viewpoints for ${skillId}`, {
          cause: error,
          skillId,
        });
      }
      errors.push({ skillId, code: 'catalog-load-failed' });
    }
  }

  const dedupedObligations = dedupeObligations(obligations);
  const signalCount = observations.reduce((sum, item) => sum + item.signalCount, 0);
  const activatedViewpointCount = observations.reduce(
    (sum, item) => sum + item.activatedViewpointIds.length,
    0
  );

  return {
    mode,
    activeObligations: mode === 'active' ? dedupedObligations : [],
    observation: {
      mode,
      selectedSkillCount: selected.length,
      catalogSkillCount: observations.length,
      signalCount,
      activatedViewpointCount,
      obligationCount: dedupedObligations.length,
      activeObligationCount: mode === 'active' ? dedupedObligations.length : 0,
      skills: observations,
      skipped,
      errors,
    },
  };
}
