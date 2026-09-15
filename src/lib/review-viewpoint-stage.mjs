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
  // symlink. Canonicalize both sides before deriving references/viewpoints.yaml.
  const [realRoot, realSkillPath] = await Promise.all([
    fs.realpath(builtInSkillsRoot),
    fs.realpath(resolved),
  ]);
  if (!isPathInside(realRoot, realSkillPath)) return null;
  return { realRoot, realSkillPath };
}

async function resolveTrustedViewpointsPath({ realRoot, realSkillPath }) {
  const candidate = path.join(path.dirname(realSkillPath), 'references', 'viewpoints.yaml');

  let realViewpointsPath;
  try {
    realViewpointsPath = await fs.realpath(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'missing' };
    throw error;
  }

  // Re-check the final catalog path after resolving references/ and the file
  // itself. Without this second realpath check, a symlink located inside a
  // trusted Skill directory could still point outside the distributed skills
  // root even though SKILL.md itself was trusted.
  if (!isPathInside(realRoot, realViewpointsPath)) {
    return { status: 'outside' };
  }
  return { status: 'ok', path: realViewpointsPath };
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
 * - observe: calculate activation and return debug-safe observation only. Any
 *   signal/catalog failure is recorded without changing the existing review's
 *   success/failure behavior.
 * - active: return the same observation plus obligations that callers may add
 *   to the LLM prompt. Signal/catalog failures fail closed because active mode
 *   explicitly opts into this knowledge as part of the review input.
 *
 * v1 deliberately refuses repository-owned/custom Skill paths. A selected Skill
 * and its final `references/viewpoints.yaml` target must both canonicalize under
 * the same distributed `skills/` root used by Skill discovery. This prevents a
 * symlink inside the trusted tree from escaping the built-in-only boundary.
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
  const observations = [];
  const obligations = [];
  const skipped = [];
  const errors = [];

  let heuristicSignals = new Map();
  try {
    heuristicSignals = groupHeuristicSignalsBySkill(collectHeuristicDetections({ diff, plan }));
  } catch (error) {
    if (mode === 'active') {
      throw new ReviewViewpointStageError('Failed to collect heuristic review signals', {
        cause: error,
      });
    }
    errors.push({ code: 'heuristic-signal-collection-failed' });
  }

  for (const skill of selected) {
    const skillId = getSkillId(skill);
    if (!skillId) continue;

    const producer = NEUTRAL_SIGNAL_PRODUCERS.get(skillId);
    let producerSignals = [];
    if (producer) {
      try {
        producerSignals = producer({ diff, plan });
      } catch (error) {
        if (mode === 'active') {
          throw new ReviewViewpointStageError(`Failed to produce review signals for ${skillId}`, {
            cause: error,
            skillId,
          });
        }
        errors.push({ skillId, code: 'signal-producer-failed' });
      }
    }
    const existingSignals = heuristicSignals.get(skillId) ?? [];
    const signals = [...existingSignals, ...producerSignals];

    const skillPath = skill?.path;
    if (typeof skillPath !== 'string' || skillPath.length === 0) {
      if (signals.length > 0) skipped.push({ skillId, reason: 'missing-skill-path' });
      continue;
    }

    let trustedSkill;
    try {
      trustedSkill = await resolveTrustedBuiltInSkillPath(skillPath);
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
    if (!trustedSkill) {
      if (signals.length > 0) skipped.push({ skillId, reason: 'outside-built-in-skills' });
      continue;
    }

    let catalogResolution;
    try {
      catalogResolution = await resolveTrustedViewpointsPath(trustedSkill);
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

    if (catalogResolution.status === 'missing') continue;
    if (catalogResolution.status === 'outside') {
      if (mode === 'active') {
        throw new ReviewViewpointStageError(
          `Built-in viewpoints path escapes skills root for ${skillId}`,
          { skillId }
        );
      }
      errors.push({ skillId, code: 'catalog-path-outside-built-in-skills' });
      continue;
    }

    const viewpointsPath = catalogResolution.path;
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
