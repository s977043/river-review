import { readFileSync, writeFileSync } from 'node:fs';

const target = 'src/lib/heuristic-review.mjs';
const source = readFileSync(target, 'utf8');

const before = `/**
 * Generate deterministic review comments from heuristics.
 * These comments are used as a fallback when LLM is not available.
 * @param {{diff: {files?: Array}, plan: {selected?: Array}}} options
 */
export function buildHeuristicComments({ diff, plan }) {
  const comments = [];

  for (const { skillId, detect, skipIfSkill } of HEURISTIC_REGISTRY) {
    if (!hasSkill(plan, skillId)) continue;
    // skipIfSkill: 上位スキルが選択されている場合は重複実行を避ける
    // （test-existence が選択されていれば coverage-gap の同一検出器は実行しない）。
    if (skipIfSkill && hasSkill(plan, skipIfSkill)) continue;
    for (const c of detect({ diff })) {
      comments.push({ ...c, skillId });
    }
  }

  return comments.slice(0, 8);
}
`;

const after = `/**
 * Execute the heuristic detectors selected by the existing Skill plan.
 *
 * This is the detector adapter boundary for Review Viewpoints. It deliberately
 * returns uncapped detector signals in HEURISTIC_REGISTRY order so downstream
 * observe-mode consumers do not lose activation evidence behind the existing
 * eight-comment presentation limit. Routing remains owned by the selected
 * Skill plan and HEURISTIC_REGISTRY remains the detector SSoT.
 *
 * @param {{diff: {files?: Array}, plan: {selected?: Array}}} options
 * @returns {Array<{file?: string, line?: number, kind: string, skillId: string}>}
 */
export function collectHeuristicDetections({ diff, plan }) {
  const detections = [];

  for (const { skillId, detect, skipIfSkill } of HEURISTIC_REGISTRY) {
    if (!hasSkill(plan, skillId)) continue;
    // skipIfSkill: 上位スキルが選択されている場合は重複実行を避ける
    // （test-existence が選択されていれば coverage-gap の同一検出器は実行しない）。
    if (skipIfSkill && hasSkill(plan, skipIfSkill)) continue;
    for (const detection of detect({ diff })) {
      detections.push({ ...detection, skillId });
    }
  }

  return detections;
}

/**
 * Generate deterministic review comments from heuristics.
 * These comments are used as a fallback when LLM is not available.
 * The existing eight-comment presentation cap intentionally stays here rather
 * than in collectHeuristicDetections so observe-mode activation can inspect all
 * detector evidence without changing user-visible heuristic output.
 * @param {{diff: {files?: Array}, plan: {selected?: Array}}} options
 */
export function buildHeuristicComments({ diff, plan }) {
  return collectHeuristicDetections({ diff, plan }).slice(0, 8);
}
`;

const first = source.indexOf(before);
const last = source.lastIndexOf(before);
if (first === -1) {
  throw new Error('Expected buildHeuristicComments block was not found; refusing to patch');
}
if (first !== last) {
  throw new Error('Expected buildHeuristicComments block is not unique; refusing to patch');
}

writeFileSync(target, source.replace(before, after), 'utf8');
