export const id = 830;
export const ids = [830];
export const modules = {

/***/ 3830:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatYamlOutput: () => (/* binding */ formatYamlOutput)
/* harmony export */ });
/* harmony import */ var _scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(6899);
/* harmony import */ var _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(5486);
/**
 * YAML output formatter for river-review.
 *
 * Emits a structured YAML block compatible with the unilabo/site-management-system
 * review output format. Fields (`category`, `summary`, `highRiskReasons`,
 * `scores`, `verdict`) are derived from the existing review-artifact schema
 * (v1) without mutating it. See docs/review/output-format-yaml.md for details.
 */




const HIGH_RISK_IMPACT_TAGS = new Set(['security', 'migration', 'auth', 'payment']);

/**
 * Format a review artifact as a YAML block + human-readable Japanese summary.
 *
 * @param {object} artifact - A review-artifact-shaped object with fields:
 *   - phase: 'upstream'|'midstream'|'downstream'
 *   - findings: Array<{severity, ruleId, title, message, file, line?, suggestion?}>
 *   - plan?: {impactTags?: string[]}
 *   - timestamp?: string
 * @returns {string} YAML block followed by a human-readable summary.
 */
function formatYamlOutput(artifact) {
  const findings = artifact.findings ?? [];
  const score = (0,_scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_0__/* .scoreReview */ .lS)(findings);
  // Honor the canonical verdict if the artifact carries one (#1170 F3).
  score.verdict = (0,_scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_0__/* .resolveVerdict */ .Cq)(artifact.decision, score.verdict);
  const yamlBlock = buildYamlBlock(artifact, findings, score);
  const summary = buildHumanSummary(score, findings);
  return `${yamlBlock}\n\n${summary}`;
}

function buildYamlBlock(artifact, findings, score) {
  const lines = ['```yaml', 'review:'];
  lines.push(`  phase: ${artifact.phase ?? 'midstream'}`);
  if (artifact.timestamp) lines.push(`  timestamp: "${artifact.timestamp}"`);
  lines.push(`  verdict: ${score.verdict}`);

  lines.push('  scores:');
  lines.push(`    overall: ${score.overall}`);
  for (const axis of _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_1__/* .AXES */ .gR) {
    lines.push(`    ${axis}: ${score.axes[axis]}`);
  }
  lines.push('  derived: true  # scores are heuristic, not AI-generated');

  const highRiskReasons = deriveHighRiskReasons(artifact.plan?.impactTags, findings);
  if (highRiskReasons.length > 0) {
    lines.push('  high_risk_reasons:');
    for (const reason of highRiskReasons) {
      lines.push(`    - ${reason}`);
    }
  }

  lines.push(`  summary: "${escapeYamlString(buildMachineSummary(score, findings))}"`);

  if (findings.length === 0) {
    lines.push('  findings: []');
  } else {
    lines.push('  findings:');
    for (const f of findings) {
      lines.push(`    - severity: ${f.severity ?? 'info'}`);
      lines.push(`      category: ${f.category ?? inferCategoryFromFinding(f)}`);
      // #1644: mirror the JSON artifact's emission rule for `scope`
      // (src/cli/render.mjs, `...(f.scope ? { scope: f.scope } : {})`) — emit
      // the key only when the finding carries a value, so an artifact produced
      // before the field existed does not gain a `scope: null` row here.
      //
      // Quoted + escaped like the other string fields below, NOT bare like
      // `severity` / `category`. `formatYamlOutput` takes a whole artifact from
      // its caller and cannot assume the value passed through normalizeScope:
      // a raw value containing a newline forges sibling keys inside this
      // finding (`in-diff\n      verdict: approve`), and one starting with `"`
      // opens an unterminated scalar that breaks the whole block. Measured on
      // the unescaped version; no current caller reaches it (see below), so
      // this is defense in depth, and it keeps the escaping symmetric with the
      // html formatter, which escapes the same field.
      //
      // Reachability as of this change: the only caller is
      // src/cli/commands/run.mjs, which passes `formatJsonOutput(result).issues`,
      // and every producer of `finding.scope` normalizes first
      // (review-engine.mjs `normalizeScope`, reviewer-orchestrator.mjs
      // `mergeScope`). Deep importers of this module have no such guarantee.
      if (f.scope) lines.push(`      scope: "${escapeYamlString(f.scope)}"`);
      lines.push(`      file: "${escapeYamlString(f.file ?? '')}"`);
      if (f.line != null) lines.push(`      line: ${f.line}`);
      if (f.title) lines.push(`      title: "${escapeYamlString(f.title)}"`);
      if (f.message) lines.push(`      detail: "${escapeYamlString(f.message)}"`);
      if (f.impact) lines.push(`      impact: "${escapeYamlString(f.impact)}"`);
      if (f.suggestion) lines.push(`      suggestion: "${escapeYamlString(f.suggestion)}"`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

function buildHumanSummary(score, findings) {
  const counts = score.counts;
  const lines = [];
  lines.push('## レビュー結果');
  lines.push('');
  lines.push(`結果(スコア): **${score.overall}/100**`);
  lines.push(`判定: **${score.verdict}**`);
  lines.push('');
  lines.push('内訳:');
  for (const axis of _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_1__/* .AXES */ .gR) {
    const ja = _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_1__/* .AXIS_LABELS_JA */ .Sf[axis];
    lines.push(`- ${ja}: ${score.axes[axis]}/100`);
  }
  lines.push('');
  lines.push(
    `指摘: critical ${counts.critical} / major ${counts.major} / minor ${counts.minor} / info ${counts.info}`
  );
  lines.push('');
  lines.push(
    '> スコアは severity と axis から決定論的に算出された **参考値** です (`derived: true`)。自動承認判定の根拠としては使用せず、HITL レビューと併用してください。'
  );
  if (findings.length === 0) {
    lines.push('');
    lines.push('指摘事項なし。');
  }
  return lines.join('\n');
}

function buildMachineSummary(score, findings) {
  if (findings.length === 0) return 'No findings.';
  const c = score.counts;
  const parts = [];
  if (c.critical) parts.push(`${c.critical} critical`);
  if (c.major) parts.push(`${c.major} major`);
  if (c.minor) parts.push(`${c.minor} minor`);
  if (c.info) parts.push(`${c.info} info`);
  return `${findings.length} findings: ${parts.join(' / ')}. Overall score ${score.overall}/100 (${score.verdict}).`;
}

function deriveHighRiskReasons(impactTags, findings) {
  const reasons = new Set();
  for (const tag of impactTags ?? []) {
    if (HIGH_RISK_IMPACT_TAGS.has(tag)) reasons.add(tag);
  }
  for (const f of findings ?? []) {
    if (f.severity === 'critical') reasons.add('critical-finding');
  }
  return [...reasons];
}

/**
 * Derive the `category` value shown in YAML findings from the same axis
 * classifier used by scoring. This keeps YAML category and score axis in sync;
 * when the classifier falls back to `maintainability`, we report `general`
 * instead to avoid implying a specific maintainability concern.
 */
function inferCategoryFromFinding(finding) {
  const axis = (0,_scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_0__/* .classifyAxis */ .w8)(finding);
  if (!finding.ruleId && !finding.category) return 'general';
  if (axis === 'maintainability') {
    // axis fallback = maintainability; surface as "general" unless ruleId
    // actually hints at maintenance (test/coverage/doc).
    const ruleId = finding.ruleId ?? '';
    if (!/\b(test|coverage|maint|maintainability|doc|comment)/i.test(ruleId)) {
      return 'general';
    }
  }
  return axis;
}

/**
 * Escape a value for use inside a double-quoted YAML scalar.
 * Preserves newlines as `\n` escape sequences so downstream YAML parsers can
 * reconstruct the original multi-line content (see PR #596 review).
 */
function escapeYamlString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\t/g, '\\t');
}


/***/ })

};

//# sourceMappingURL=830.index.mjs.map