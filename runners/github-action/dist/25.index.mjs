export const id = 25;
export const ids = [25];
export const modules = {

/***/ 6025:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatRouterResultMarkdown: () => (/* binding */ formatRouterResultMarkdown),
/* harmony export */   routeReviewMode: () => (/* binding */ routeReviewMode)
/* harmony export */ });
/* harmony import */ var _file_classifier_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1437);
/* harmony import */ var _diff_processor_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(3249);
/* harmony import */ var _risk_map_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(2374);




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
  const fileTypes = (0,_file_classifier_mjs__WEBPACK_IMPORTED_MODULE_0__/* .classifyChangedFiles */ .q)(changedFiles);
  const riskAssessment = riskMap ? (0,_risk_map_mjs__WEBPACK_IMPORTED_MODULE_2__/* .evaluateRisk */ .lm)(riskMap, changedFiles) : null;
  const aggregateAction = riskAssessment?.aggregateAction ?? 'comment_only';
  const fileCount = changedFiles.length;
  const changedLines = (0,_diff_processor_mjs__WEBPACK_IMPORTED_MODULE_1__/* .countChangedLinesFromText */ .ye)(diffText);

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

  // Rule 4: large diff
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

  // Rule 5: infra/config keeps the mode at standard; skip when a higher trigger already fired
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

  // Rule 6: docs/test only → light (only when there are files to classify)
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
    matchedTriggers.includes('fileType:schema')
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

//# sourceMappingURL=25.index.mjs.map