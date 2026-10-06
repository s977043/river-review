import { minimatch } from 'minimatch';

import { classifyChangedFiles } from './file-classifier.mjs';
import { selectRolesAuto } from './reviewer-orchestrator.mjs';

const SCHEMA_VERSION = '1';

function normalizePath(value) {
  return typeof value === 'string' ? value.trim().replaceAll('\\', '/') : '';
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizePath).filter(Boolean))];
}

function concernSubjects(concern) {
  const changed = uniqueStrings(concern?.changedSubjects);
  const affected = uniqueStrings(
    (Array.isArray(concern?.affectedSubjects) ? concern.affectedSubjects : []).map(
      (subject) => subject?.path
    )
  );
  return [...new Set([...changed, ...affected])];
}

function skillId(skill) {
  const value = skill?.metadata?.id ?? skill?.id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function skillApplyTo(skill) {
  const value = skill?.metadata?.applyTo ?? skill?.applyTo;
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function matchedSkillSubjects(skill, subjects) {
  const patterns = skillApplyTo(skill);
  if (patterns.length === 0) return [];

  return subjects.filter((subject) =>
    patterns.some((pattern) => {
      try {
        return minimatch(subject, pattern, { dot: true });
      } catch {
        return false;
      }
    })
  );
}

function baselineRoles({ fileTypes, riskAssessment, signals }) {
  return selectRolesAuto(fileTypes ?? {}, riskAssessment ?? null, signals);
}

function buildUnavailableObservation(reviewConcernMap, existingRoles, reason) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-planning-observation',
    status: 'unavailable',
    source: {
      concernMapStatus: reviewConcernMap?.analysis?.status ?? null,
      limitations: Array.isArray(reviewConcernMap?.analysis?.limitations)
        ? [...reviewConcernMap.analysis.limitations]
        : [],
      reason,
    },
    existingAutoSelection: {
      reviewerRoles: existingRoles,
    },
    concerns: [],
    recommendation: null,
    delta: null,
    applied: false,
  };
}

export function buildReviewConcernPlanningObservation({
  reviewConcernMap,
  fileTypes,
  riskAssessment,
  signals,
  selectedSkills = [],
} = {}) {
  if (!reviewConcernMap) return null;

  const existingRoles = baselineRoles({ fileTypes, riskAssessment, signals });
  if (
    reviewConcernMap.kind !== 'review-concern-map' ||
    reviewConcernMap.schemaVersion !== '1' ||
    !Array.isArray(reviewConcernMap.concerns)
  ) {
    return buildUnavailableObservation(reviewConcernMap, existingRoles, 'invalid-concern-map');
  }

  const mapStatus = reviewConcernMap.analysis?.status ?? null;
  if (mapStatus === 'failed') {
    return buildUnavailableObservation(reviewConcernMap, existingRoles, 'concern-map-failed');
  }

  const seenConcernIds = new Set();
  const concerns = [];
  for (const concern of reviewConcernMap.concerns) {
    const concernRef =
      typeof concern?.id === 'string' && concern.id.trim() ? concern.id.trim() : null;
    if (!concernRef || seenConcernIds.has(concernRef)) {
      return buildUnavailableObservation(reviewConcernMap, existingRoles, 'invalid-concern-id');
    }
    seenConcernIds.add(concernRef);

    const subjects = concernSubjects(concern);
    const reviewerRoles = selectRolesAuto(classifyChangedFiles(subjects), null, null);
    const skillRecommendations = (Array.isArray(selectedSkills) ? selectedSkills : [])
      .map((skill) => {
        const id = skillId(skill);
        if (!id) return null;
        const matchedSubjects = matchedSkillSubjects(skill, subjects);
        if (matchedSubjects.length === 0) return null;
        return {
          skillId: id,
          matchedSubjects,
          reason: 'selected-skill-applyTo-overlap',
        };
      })
      .filter(Boolean);

    concerns.push({
      concernRef,
      subjects,
      reviewerRoles,
      skillRecommendations,
    });
  }

  const recommendedRoles = [
    ...new Set(concerns.flatMap((concern) => concern.reviewerRoles)),
  ];
  const recommendedSkillIds = [
    ...new Set(
      concerns.flatMap((concern) =>
        concern.skillRecommendations.map((recommendation) => recommendation.skillId)
      )
    ),
  ];
  const existingSet = new Set(existingRoles);
  const recommendedSet = new Set(recommendedRoles);

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-planning-observation',
    status: mapStatus === 'partial' ? 'partial' : 'observed',
    source: {
      concernMapStatus: mapStatus,
      limitations: Array.isArray(reviewConcernMap.analysis?.limitations)
        ? [...reviewConcernMap.analysis.limitations]
        : [],
      reason: null,
    },
    existingAutoSelection: {
      reviewerRoles: existingRoles,
    },
    concerns,
    recommendation: {
      reviewerRoles: recommendedRoles,
      skillIds: recommendedSkillIds,
    },
    delta: {
      reviewerRoles: {
        recommendedOnly: recommendedRoles.filter((role) => !existingSet.has(role)),
        existingOnly: existingRoles.filter((role) => !recommendedSet.has(role)),
        shared: recommendedRoles.filter((role) => existingSet.has(role)),
      },
    },
    applied: false,
  };
}

export function attachConcernRefsToReviewCoverage(reviewCoverage, reviewConcernMap) {
  if (!reviewCoverage || !Array.isArray(reviewCoverage.units)) return reviewCoverage;
  if (
    !reviewConcernMap ||
    reviewConcernMap.kind !== 'review-concern-map' ||
    reviewConcernMap.schemaVersion !== '1' ||
    reviewConcernMap.analysis?.status === 'failed' ||
    !Array.isArray(reviewConcernMap.concerns)
  ) {
    return reviewCoverage;
  }

  const concernSubjectsById = reviewConcernMap.concerns
    .map((concern) => {
      const id = typeof concern?.id === 'string' ? concern.id.trim() : '';
      return id ? { id, subjects: new Set(concernSubjects(concern)) } : null;
    })
    .filter(Boolean);

  let changed = false;
  const units = reviewCoverage.units.map((unit) => {
    const unitSubjects = new Set(uniqueStrings(unit?.subjects));
    const matchedConcernRefs = concernSubjectsById
      .filter((concern) => [...concern.subjects].some((subject) => unitSubjects.has(subject)))
      .map((concern) => concern.id);
    const existingConcernRefs = uniqueStrings(unit?.concernRefs);
    const concernRefs = [...new Set([...existingConcernRefs, ...matchedConcernRefs])];

    if (concernRefs.length === existingConcernRefs.length) return unit;
    changed = true;
    return {
      ...unit,
      concernRefs,
    };
  });

  return changed
    ? {
        ...reviewCoverage,
        units,
      }
    : reviewCoverage;
}
