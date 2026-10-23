import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { minimatch } from 'minimatch';
import { RiskMapSchema } from '../config/risk-map-schema.mjs';

const DEFAULT_RISK_MAP_PATH = path.join('.river', 'risk-map.yaml');

export class RiskMapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RiskMapError';
  }
}

/**
 * Load a risk map from .river/risk-map.yaml (or a custom path).
 * Missing files are treated as "no risk map" without error.
 * @param {string} repoRoot
 * @param {{ riskMapPath?: string }} [options]
 * @returns {Promise<import('../../schemas/risk-map.schema.json') | null>}
 */
export async function loadRiskMap(repoRoot, options = {}) {
  const repoRootAbs = path.resolve(repoRoot);
  const relativePath = options.riskMapPath ?? DEFAULT_RISK_MAP_PATH;
  const fullPath = path.resolve(repoRootAbs, relativePath);

  if (!fullPath.startsWith(repoRootAbs + path.sep) && fullPath !== repoRootAbs) {
    throw new RiskMapError(`Risk map path is outside of the repository: ${relativePath}`);
  }

  let raw;
  try {
    raw = await fs.readFile(fullPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new RiskMapError(`Failed to read risk map at ${fullPath}: ${error.message}`);
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = yaml.load(trimmed);
  } catch (error) {
    throw new RiskMapError(`Failed to parse risk map YAML: ${error.message}`);
  }

  const result = RiskMapSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new RiskMapError(`Invalid risk map schema: ${issues}`);
  }

  return result.data;
}

const ACTION_PRIORITY = {
  comment_only: 0,
  escalate: 1,
  require_human_review: 2,
};

/**
 * Evaluate risk for a list of changed files against a risk map.
 * First matching rule wins per file.
 * @param {object} riskMap - Parsed risk map config
 * @param {string[]} filePaths - List of changed file paths
 * @returns {{ fileRisks: Array<{ file: string, action: string, rule?: object }>, aggregateAction: string, escalatedFiles: string[], humanReviewFiles: string[] }}
 */
export function evaluateRisk(riskMap, filePaths) {
  if (!riskMap || !filePaths?.length) {
    return {
      fileRisks: [],
      aggregateAction: riskMap?.defaults?.action ?? 'comment_only',
      escalatedFiles: [],
      humanReviewFiles: [],
    };
  }

  const defaultAction = riskMap.defaults?.action ?? 'comment_only';
  const fileRisks = [];

  for (const file of filePaths) {
    let matched = false;
    for (const rule of riskMap.rules) {
      if (minimatch(file, rule.pattern, { dot: true })) {
        fileRisks.push({
          file,
          action: rule.action,
          rule: { pattern: rule.pattern, reason: rule.reason },
        });
        matched = true;
        break;
      }
    }
    if (!matched) {
      fileRisks.push({ file, action: defaultAction });
    }
  }

  const escalatedFiles = fileRisks.filter((r) => r.action === 'escalate').map((r) => r.file);
  const humanReviewFiles = fileRisks
    .filter((r) => r.action === 'require_human_review')
    .map((r) => r.file);
  const aggregateAction = aggregateRiskLevel(fileRisks, defaultAction);

  return { fileRisks, aggregateAction, escalatedFiles, humanReviewFiles };
}

/**
 * Find stronger rules hidden behind the first matching rule for actual changed
 * paths. Diagnostic candidates only: never change first-match evaluation,
 * review routing, or GitHub approval / merge authority.
 *
 * Indexes are zero-based positions in the supplied ordered risk map. This
 * reports actual overlapping matches, not hypothetical glob containment.
 *
 * @param {object | null} riskMap parsed and validated risk map
 * @param {string[]} filePaths changed repository-relative file paths
 * @returns {Array<{file: string, selectedRuleIndex: number, selectedPattern: string, selectedAction: string, shadowedRuleIndex: number, shadowedPattern: string, shadowedAction: string}>}
 */
export function diagnoseShadowedRiskRules(riskMap, filePaths) {
  if (!riskMap || (Array.isArray(filePaths) && filePaths.length === 0)) return [];
  if (!Array.isArray(filePaths) || !Array.isArray(riskMap.rules)) {
    throw new RiskMapError('Invalid input for risk rule shadow diagnostic');
  }

  const candidates = [];
  for (const file of filePaths) {
    if (typeof file !== 'string') {
      throw new RiskMapError('Risk rule shadow diagnostic requires string file paths');
    }
    let selectedRule = null;
    let selectedRuleIndex = -1;
    for (const [ruleIndex, rule] of riskMap.rules.entries()) {
      if (!rule || typeof rule.pattern !== 'string' || !(rule.action in ACTION_PRIORITY)) {
        throw new RiskMapError('Invalid risk rule in shadow diagnostic');
      }
      if (!minimatch(file, rule.pattern, { dot: true })) continue;
      if (selectedRule === null) {
        selectedRule = rule;
        selectedRuleIndex = ruleIndex;
      } else if (ACTION_PRIORITY[rule.action] > ACTION_PRIORITY[selectedRule.action]) {
        candidates.push({
          file,
          selectedRuleIndex,
          selectedPattern: selectedRule.pattern,
          selectedAction: selectedRule.action,
          shadowedRuleIndex: ruleIndex,
          shadowedPattern: rule.pattern,
          shadowedAction: rule.action,
        });
      }
    }
  }
  return candidates;
}

/**
 * Aggregate to the highest risk action across all file risks.
 * @param {Array<{ action: string }>} fileRisks
 * @param {string} [fallback='comment_only']
 * @returns {string}
 */
export function aggregateRiskLevel(fileRisks, fallback = 'comment_only') {
  if (!fileRisks?.length) return fallback;

  let maxPriority = -1;
  let maxAction = fallback;
  for (const { action } of fileRisks) {
    const priority = ACTION_PRIORITY[action] ?? 0;
    if (priority > maxPriority) {
      maxPriority = priority;
      maxAction = action;
    }
  }
  return maxAction;
}
