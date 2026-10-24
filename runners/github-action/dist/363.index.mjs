export const id = 363;
export const ids = [363];
export const modules = {

/***/ 7363:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  formatRouterResultMarkdown: () => (/* binding */ formatRouterResultMarkdown),
  routeReviewMode: () => (/* binding */ routeReviewMode)
});

// EXTERNAL MODULE: ./src/lib/file-classifier.mjs
var file_classifier = __webpack_require__(4673);
;// CONCATENATED MODULE: ./src/lib/sensitive-code-paths.mjs
/**
 * High-confidence, path-only signals for review-depth escalation.
 * This heuristic is deliberately incomplete: it never grants permission,
 * downgrades a Risk Map requirement, or claims semantic change coverage.
 */
const SOURCE_ROOTS = new Set([
  'src',
  'runners',
  'apps',
  'app',
  'packages',
  'lib',
  'server',
  'services',
  'api',
]);
const SENSITIVE_PARTS = new Set([
  'auth',
  'authn',
  'authz',
  'authentication',
  'authorization',
  'permission',
  'permissions',
  'access-control',
  'rbac',
  'acl',
  'payment',
  'payments',
  'billing',
  'secret',
  'secrets',
  'privacy',
  'pii',
]);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|php|go|rs|rb|java|kt)$/i;
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|py|php|go|rs|rb|java|kt)$/i;
const NON_PRODUCT_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  'fixture',
  'fixtures',
  '__fixtures__',
  'docs',
  'documentation',
  'examples',
]);

/**
 * Find source-code paths whose directory or filename tokens explicitly name a
 * security/privacy/payment-sensitive area. This is a conservative review hint,
 * not a complete classifier or an approval decision.
 * @param {unknown} changedFiles
 * @returns {string[]}
 */
function findSensitiveCodePaths(changedFiles) {
  if (!Array.isArray(changedFiles)) return [];
  return changedFiles.filter((file) => {
    if (typeof file !== 'string') return false;
    const segments = file.replaceAll('\\', '/').split('/');
    if (!SOURCE_ROOTS.has(segments[0])) return false;
    const basename = segments.at(-1);
    if (!basename || !SOURCE_EXT.test(basename) || TEST_FILE.test(basename)) return false;
    if (segments.slice(1, -1).some((segment) => NON_PRODUCT_DIRS.has(segment.toLowerCase()))) {
      return false;
    }
    // Token boundaries prevent 'author.ts' and 'authoring/' matching 'auth'.
    const stem = basename.replace(SOURCE_EXT, '');
    const nameTokens = stem.toLowerCase().split(/[._-]/);
    const directoryTokens = segments.slice(1, -1).flatMap((segment) => {
      const lower = segment.toLowerCase();
      return [lower, ...lower.split(/[._-]/)];
    });
    return [...directoryTokens, ...nameTokens].some((token) => SENSITIVE_PARTS.has(token));
  });
}

// EXTERNAL MODULE: ./src/lib/diff-processor.mjs
var diff_processor = __webpack_require__(861);
// EXTERNAL MODULE: ./src/lib/risk-map.mjs + 1 modules
var risk_map = __webpack_require__(572);
;// CONCATENATED MODULE: ./src/lib/review-mode-router.mjs





/** @typedef {'light' | 'standard' | 'team' | 'human-required'} ReviewRouterMode */

const MODE_PRIORITY = { light: 0, standard: 1, team: 2, 'human-required': 3 };

function raiseMode(current, candidate) {
  return MODE_PRIORITY[candidate] > MODE_PRIORITY[current] ? candidate : current;
}

function quoteArg(value) {
  return value.includes(' ') ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;
}

/**
 * @param {string} mode
 * @param {string} [targetPath]
 * @param {string|null} [baseRef] the `--base` this routing decision was made
 *   against. Carried into the suggested command because the whole point of
 *   #2046 is that following this suggestion must review the SAME range the
 *   router just judged; without it, `river review plan <path>` re-resolves the
 *   range from the auto-detected default branch and can answer `no-changes`.
 */
function buildNextCommand(mode, targetPath = '.', baseRef = null) {
  const p = quoteArg(targetPath);
  const base = baseRef ? ` --base ${quoteArg(baseRef)}` : '';
  switch (mode) {
    case 'light':
      return `river review plan ${p}${base} --depth quick`;
    case 'standard':
      return `river review plan ${p}${base}`;
    case 'team':
      return `river review plan ${p}${base} --depth thorough --reviewers auto`;
    case 'human-required':
      return '# No AI review recommended. Assign human reviewer.';
    default:
      return `river review plan ${p}${base}`;
  }
}

/**
 * Route a PR to the appropriate review mode based on diff risk.
 * No LLM calls are made — all decisions are heuristic.
 *
 * @param {{ changedFiles: string[], diffText?: string, riskMap?: object | null, targetPath?: string, baseRef?: string | null }} input
 * @returns {{ selectedMode: ReviewRouterMode, confidence: 'high' | 'medium', reasons: string[], matchedTriggers: string[], recommendedReviewers: string, riskAction: string, nextCommand: string }}
 */
function routeReviewMode({
  changedFiles = [],
  diffText,
  riskMap,
  targetPath = '.',
  baseRef = null,
}) {
  const fileTypes = (0,file_classifier/* classifyChangedFiles */.qS)(changedFiles);
  const riskAssessment = riskMap ? (0,risk_map/* evaluateRisk */.lm)(riskMap, changedFiles) : null;
  const aggregateAction = riskAssessment?.aggregateAction ?? 'comment_only';
  const fileCount = changedFiles.length;
  const changedLines = (0,diff_processor/* countChangedLinesFromText */.ye)(diffText);

  let mode = 'standard';
  const reasons = [];
  const matchedTriggers = [];

  // Rule 1: risk-map require_human_review
  if (aggregateAction === 'require_human_review') {
    mode = raiseMode(mode, 'human-required');
    reasons.push('risk-map に require_human_review ルールが適用されました');
    matchedTriggers.push('risk-map:require_human_review');
  }

  // Rule 2: risk-map escalate
  if (aggregateAction === 'escalate') {
    mode = raiseMode(mode, 'team');
    reasons.push('risk-map に escalate ルールが適用されました');
    matchedTriggers.push('risk-map:escalate');
  }

  // Rule 3: migration / schema
  if (fileTypes.migration.length > 0) {
    mode = raiseMode(mode, 'team');
    reasons.push(`マイグレーションファイルが ${fileTypes.migration.length} 件含まれています`);
    matchedTriggers.push('fileType:migration');
  }
  if (fileTypes.schema.length > 0) {
    mode = raiseMode(mode, 'team');
    reasons.push(`スキーマファイルが ${fileTypes.schema.length} 件含まれています`);
    matchedTriggers.push('fileType:schema');
  }

  // Rule 4: deliberate team review for dependency and CI workflow changes.
  // Shared path predicates also drive the existing specialist role selection.
  if (changedFiles.some(file_classifier/* isDependencyFile */.Wb)) {
    mode = raiseMode(mode, 'team');
    reasons.push('依存関係の宣言またはロックファイルが変更されています');
    matchedTriggers.push('fileType:dependency');
  }
  if (changedFiles.some(file_classifier/* isCIWorkflowFile */.cw)) {
    mode = raiseMode(mode, 'team');
    reasons.push('CI ワークフローが変更されています');
    matchedTriggers.push('fileType:ci');
  }

  // Rule 4b: Explicitly sensitive source code deserves deeper review even
  // when no repository risk map is configured. Path-only hints do not grant
  // approval and must never override a human-required risk-map decision.
  const sensitiveCodeFiles = findSensitiveCodePaths(changedFiles);
  if (sensitiveCodeFiles.length > 0) {
    mode = raiseMode(mode, 'team');
    reasons.push(`機密性の高いソースコード領域が ${sensitiveCodeFiles.length} 件変更されています`);
    matchedTriggers.push('fileType:sensitiveCode');
  }

  // Rule 5: large diff
  if (fileCount >= 20) {
    mode = raiseMode(mode, 'team');
    reasons.push(`変更ファイル数が多い (${fileCount} 件)`);
    matchedTriggers.push('diffSize:fileCount');
  }
  if (changedLines >= 500) {
    mode = raiseMode(mode, 'team');
    reasons.push(`変更行数が多い (${changedLines} 行)`);
    matchedTriggers.push('diffSize:changedLines');
  }

  // Rule 6: infra/config keeps the mode at standard; skip when a higher trigger already fired
  // (avoids adding redundant reasons when team/human-required is already decided)
  if (mode !== 'human-required' && mode !== 'team') {
    if (fileTypes.infra.length > 0) {
      mode = raiseMode(mode, 'standard');
      reasons.push(`インフラファイルが ${fileTypes.infra.length} 件含まれています`);
      matchedTriggers.push('fileType:infra');
    }
    if (fileTypes.config.length > 0) {
      mode = raiseMode(mode, 'standard');
      reasons.push(`設定ファイルが ${fileTypes.config.length} 件含まれています`);
      matchedTriggers.push('fileType:config');
    }
  }

  // Rule 7: docs/test only → light (only when there are files to classify)
  const hasSubstantiveFiles =
    fileTypes.app.length > 0 ||
    fileTypes.config.length > 0 ||
    fileTypes.schema.length > 0 ||
    fileTypes.migration.length > 0 ||
    fileTypes.infra.length > 0 ||
    fileTypes.unknown.length > 0;
  const hasAnyFiles = fileCount > 0;

  if (hasAnyFiles && !hasSubstantiveFiles && mode === 'standard') {
    mode = 'light';
    reasons.push('docs・test のみの変更です');
    matchedTriggers.push('docsTestOnly');
  }

  // Determine confidence
  let confidence;
  if (matchedTriggers.length === 0) {
    confidence = 'medium';
    reasons.push('特定のトリガーなし。デフォルトの standard を適用します');
  } else if (
    matchedTriggers.includes('risk-map:require_human_review') ||
    matchedTriggers.includes('risk-map:escalate') ||
    matchedTriggers.includes('fileType:migration') ||
    matchedTriggers.includes('fileType:schema') ||
    matchedTriggers.includes('fileType:dependency') ||
    matchedTriggers.includes('fileType:ci') ||
    matchedTriggers.includes('fileType:sensitiveCode')
  ) {
    confidence = 'high';
  } else {
    confidence = 'medium';
  }

  const recommendedReviewers = mode === 'team' ? 'auto' : 'none';

  return {
    selectedMode: mode,
    confidence,
    reasons,
    matchedTriggers,
    recommendedReviewers,
    riskAction: aggregateAction,
    nextCommand: buildNextCommand(mode, targetPath, baseRef),
  };
}

/**
 * Format router output as markdown.
 *
 * @param {ReturnType<typeof routeReviewMode>} result
 * @returns {string}
 */
function formatRouterResultMarkdown(result) {
  const lines = [
    `## Review Mode Router`,
    ``,
    `| 項目 | 値 |`,
    `| --- | --- |`,
    `| 選択モード | \`${result.selectedMode}\` |`,
    `| 信頼度 | ${result.confidence} |`,
    `| リスクアクション | ${result.riskAction} |`,
    `| 推薦レビュアー | ${result.recommendedReviewers} |`,
    ``,
    `### 判定理由`,
    ...result.reasons.map((r) => `- ${r}`),
    ``,
    `### 次のコマンド`,
    ``,
    `\`\`\`bash`,
    result.nextCommand,
    `\`\`\``,
  ];
  return lines.join('\n');
}


/***/ })

};

//# sourceMappingURL=363.index.mjs.map