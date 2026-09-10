export const id = 599;
export const ids = [599];
export const modules = {

/***/ 3980:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatHtmlOutput: () => (/* binding */ formatHtmlOutput),
/* harmony export */   formatLoopDashboardHtml: () => (/* binding */ formatLoopDashboardHtml)
/* harmony export */ });
/* unused harmony export escHtml */
/* harmony import */ var _finding_factory_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1535);
/* harmony import */ var _scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(9487);
/* harmony import */ var _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(5034);
/**
 * HTML output formatter for river-review.
 *
 * Produces a self-contained, single-file HTML report with inline CSS.
 * All user-derived strings are HTML-escaped to prevent XSS.
 * Data is derived from scoreReview (same engine as JSON/YAML formatters).
 */





/**
 * Escape a string for safe inclusion in HTML content or attribute values.
 *
 * @param {unknown} s - Value to escape
 * @returns {string} HTML-escaped string
 */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEVERITY_COLOR = {
  critical: '#d32f2f',
  major: '#e65100',
  minor: '#f9a825',
  info: '#1565c0',
};

/**
 * #1644: chip colors for the finding scope. Keys mirror FINDING_SCOPES in
 * src/lib/finding-factory.mjs; an unknown value falls back to the neutral grey
 * rather than being dropped, so the report never hides a value the artifact has.
 */
const SCOPE_COLOR = {
  'in-diff': '#37474f',
  'pre-existing': '#9e9e9e',
};

const DECISION_CONFIG = {
  'auto-approve': { bg: '#e8f5e9', border: '#2e7d32', icon: '✓', label: 'Auto Approve' },
  'human-review-recommended': {
    bg: '#fff8e1',
    border: '#f9a825',
    icon: '!',
    label: 'Human Review Recommended',
  },
  'human-review-required': {
    bg: '#ffebee',
    border: '#c62828',
    icon: '×',
    label: 'Human Review Required',
  },
};

const INLINE_STYLE = [
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
  "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
  '       font-size: 14px; color: #212121; background: #fafafa; padding: 24px; }',
  'h1 { font-size: 22px; margin-bottom: 8px; }',
  'h2 { font-size: 16px; margin: 20px 0 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }',
  '.meta { font-size: 12px; color: #757575; margin-bottom: 16px; }',
  '.banner { padding: 12px 16px; border-left: 4px solid; border-radius: 4px;',
  '          font-weight: 600; font-size: 15px; margin-bottom: 20px; }',
  'table { width: 100%; border-collapse: collapse; margin-top: 8px; }',
  'th { background: #f5f5f5; text-align: left; padding: 8px 10px;',
  '     border: 1px solid #e0e0e0; font-weight: 600; }',
  'td { padding: 8px 10px; border: 1px solid #e0e0e0; vertical-align: top; }',
  'tr:nth-child(even) td { background: #fafafa; }',
  '.sev { display: inline-block; padding: 2px 8px; border-radius: 3px;',
  '       font-size: 12px; font-weight: 700; color: #fff; }',
  '.counts { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }',
  '.count-chip { padding: 4px 12px; border-radius: 12px; font-size: 13px;',
  '              font-weight: 600; color: #fff; }',
  '.score-bg { width: 160px; height: 10px; background: #e0e0e0; border-radius: 5px; overflow: hidden; }',
  '.score-bar { height: 10px; border-radius: 5px; background: #4caf50; }',
  '.overall { font-size: 28px; font-weight: 700; color: #1b5e20; }',
  '.overall-wrap { margin: 8px 0 4px; }',
  'pre { white-space: pre-wrap; word-break: break-word; }',
].join('\n');

/**
 * Format a review result as a self-contained HTML report.
 *
 * @param {object} result - Raw review result (findings, plan, timestamp, etc.)
 * @param {string} phase  - Review phase (upstream|midstream|downstream)
 * @returns {string} Complete HTML document
 */
function formatHtmlOutput(result, phase) {
  const findings = result.findings ?? [];
  const score = (0,_scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_1__/* .scoreReview */ .lS)(findings);

  const issueCountBySeverity = { critical: 0, major: 0, minor: 0, info: 0 };
  for (const f of findings) {
    const sev = f.severity ?? 'info';
    if (sev in issueCountBySeverity) issueCountBySeverity[sev]++;
  }

  // Honor the canonical verdict if the result carries one (#1170 F3).
  const decision = (0,_scoring_engine_mjs__WEBPACK_IMPORTED_MODULE_1__/* .resolveVerdict */ .Cq)(result.decision, score.verdict);

  const riskAssessment = result.plan?.riskAssessment;
  const riskSummary = riskAssessment
    ? {
        aggregateAction: riskAssessment.aggregateAction,
        escalatedFiles: riskAssessment.escalatedFiles ?? [],
        humanReviewFiles: riskAssessment.humanReviewFiles ?? [],
      }
    : null;

  const timestamp = result.timestamp ?? new Date().toISOString();
  const phaseDisplay = phase ?? 'midstream';

  const parts = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="ja">');
  parts.push('<head>');
  parts.push('<meta charset="UTF-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push(`<title>River Review Report — ${escHtml(phaseDisplay)}</title>`);
  parts.push(`<style>${INLINE_STYLE}</style>`);
  parts.push('</head>');
  parts.push('<body>');

  // Header
  parts.push('<h1>River Review Report</h1>');
  parts.push(
    `<p class="meta">Phase: <strong>${escHtml(phaseDisplay)}</strong> &nbsp;|&nbsp; Timestamp: <strong>${escHtml(timestamp)}</strong></p>`
  );

  // Decision banner
  const dc = decision ? DECISION_CONFIG[decision] : null;
  if (dc) {
    parts.push(`<div class="banner" style="background:${dc.bg};border-color:${dc.border}">`);
    parts.push(`${dc.icon} ${escHtml(dc.label)}`);
    parts.push('</div>');
  } else {
    parts.push('<div class="banner" style="background:#f5f5f5;border-color:#9e9e9e">');
    parts.push('Decision: N/A');
    parts.push('</div>');
  }

  // Summary
  parts.push('<h2>Summary</h2>');
  parts.push('<div class="counts">');
  for (const [sev, count] of Object.entries(issueCountBySeverity)) {
    const color = SEVERITY_COLOR[sev] ?? '#757575';
    parts.push(
      `<span class="count-chip" style="background:${color}">${escHtml(sev)}: ${count}</span>`
    );
  }
  parts.push('</div>');

  // Score
  parts.push('<h2>Score</h2>');
  parts.push(
    `<div class="overall-wrap"><span class="overall">${escHtml(String(score.overall))}/100</span></div>`
  );
  parts.push('<table>');
  parts.push('<tr><th>Axis</th><th>Score</th><th style="width:200px">Bar</th></tr>');
  for (const axis of _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_2__/* .AXES */ .gR) {
    const val = score.axes?.[axis] ?? 0;
    const label = _scoring_rubric_mjs__WEBPACK_IMPORTED_MODULE_2__/* .AXIS_LABELS_JA */ .Sf?.[axis] ?? axis;
    const pct = Math.max(0, Math.min(100, val));
    parts.push('<tr>');
    parts.push(`<td>${escHtml(label)}</td>`);
    parts.push(`<td style="text-align:right">${escHtml(String(val))}</td>`);
    parts.push(
      `<td><div class="score-bg"><div class="score-bar" style="width:${pct}%"></div></div></td>`
    );
    parts.push('</tr>');
  }
  parts.push('</table>');

  // Findings
  parts.push('<h2>Findings</h2>');
  if (findings.length === 0) {
    parts.push('<p>指摘事項なし。</p>');
  } else {
    parts.push('<table>');
    parts.push(
      '<tr><th>Severity</th><th>File:Line</th><th>Title</th><th>Message</th><th>Suggestion</th></tr>'
    );
    for (const f of findings) {
      const sev = f.severity ?? 'info';
      const color = SEVERITY_COLOR[sev] ?? '#757575';
      const lineNum = f.lineStart ?? f.line;
      const fileRef = f.file ? (lineNum ? `${f.file}:${lineNum}` : f.file) : '';
      parts.push('<tr>');
      // #1644: the scope chip shares the severity cell so the column layout is
      // unchanged, and it follows the JSON artifact's emission rule
      // (src/cli/render.mjs, `...(f.scope ? { scope: f.scope } : {})`): rendered
      // only when the finding carries a value, never as an empty placeholder.
      // It reuses the existing `.sev` chip style rather than adding a rule to
      // INLINE_STYLE, so a scope-less result stays byte-identical to before
      // (pinned by tests/render-markdown-digest.test.mjs).
      // `Object.hasOwn` rather than `?? '#757575'`: `??` only fires on
      // `undefined`, so an inherited key (`toString`, `constructor`) resolves to
      // a Function and puts its source text into the style attribute unescaped
      // — measured, and the opposite of what SCOPE_COLOR's fallback promises.
      const scopeColor = Object.hasOwn(SCOPE_COLOR, f.scope) ? SCOPE_COLOR[f.scope] : '#757575';
      const scopeChip = f.scope
        ? `<span class="sev" style="background:${scopeColor};margin-left:6px">${escHtml(f.scope)}</span>`
        : '';
      parts.push(
        `<td><span class="sev" style="background:${color}">${escHtml(sev)}</span>${scopeChip}</td>`
      );
      parts.push(`<td><code>${escHtml(fileRef)}</code></td>`);
      parts.push(`<td>${escHtml(f.title ?? '')}</td>`);
      // #1915 A: same rule as the markdown renderer — when the chip above
      // states a resolved scope, the reviewer's self-reported `Scope:` label is
      // dropped from the body so one row cannot show two opposite scopes. A
      // finding with no resolved scope keeps its self-report, which is then the
      // only scope information the row has.
      const message = f.scope ? (0,_finding_factory_mjs__WEBPACK_IMPORTED_MODULE_0__/* .stripSelfReportedScope */ ._2)(f.message) : (f.message ?? '');
      parts.push(`<td><pre>${escHtml(message)}</pre></td>`);
      parts.push(`<td><pre>${escHtml(f.suggestion ?? '')}</pre></td>`);
      parts.push('</tr>');
    }
    parts.push('</table>');
  }

  // Risk section
  if (riskSummary) {
    parts.push('<h2>Risk Assessment</h2>');
    parts.push('<table>');
    parts.push(
      `<tr><th>Aggregate Action</th><td>${escHtml(riskSummary.aggregateAction ?? '')}</td></tr>`
    );
    if (riskSummary.escalatedFiles.length > 0) {
      parts.push(
        `<tr><th>Escalated Files</th><td>${riskSummary.escalatedFiles.map(escHtml).join('<br>')}</td></tr>`
      );
    }
    if (riskSummary.humanReviewFiles.length > 0) {
      parts.push(
        `<tr><th>Human Review Files</th><td>${riskSummary.humanReviewFiles.map(escHtml).join('<br>')}</td></tr>`
      );
    }
    parts.push('</table>');
  }

  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

/**
 * suggestedLoopSignal → banner styling (mirrors the loop-convergence contract).
 */
const SIGNAL_CONFIG = {
  CONVERGED: { bg: '#e8f5e9', border: '#2e7d32', icon: '✓', label: 'CONVERGED' },
  REVISE_REQUIRED: { bg: '#fff8e1', border: '#f9a825', icon: '↻', label: 'REVISE_REQUIRED' },
  ESCALATE_HUMAN: { bg: '#ffebee', border: '#c62828', icon: '×', label: 'ESCALATE_HUMAN' },
  STOP_OSCILLATED: { bg: '#ffebee', border: '#c62828', icon: '∿', label: 'STOP_OSCILLATED' },
  NO_SIGNAL: { bg: '#f5f5f5', border: '#9e9e9e', icon: '–', label: 'NO_SIGNAL' },
};

/**
 * Format a multi-run loop dashboard as a self-contained HTML report
 * (Epic #1191, #1158 Phase 2). Visualizes how findings evolve across a
 * generate → review → revise loop: the suggested signal, churn counts, and
 * an oscillation timeline. All user-derived strings are HTML-escaped.
 *
 * @param {object} diff - Output of diffRunHistory / diffReviews
 *   ({ new, resolved, persisting, scoreChanged?, oscillated?, summary? }).
 * @param {object} [meta]
 * @param {string[]} [meta.runIds] - Run ids in chronological order.
 * @param {string} [meta.suggestedLoopSignal] - Derived loop signal.
 * @returns {string} Complete HTML document.
 */
function formatLoopDashboardHtml(diff, meta = {}) {
  const runIds = Array.isArray(meta.runIds) ? meta.runIds : [];
  const signal = meta.suggestedLoopSignal;
  const newF = Array.isArray(diff?.new) ? diff.new : [];
  const resolvedF = Array.isArray(diff?.resolved) ? diff.resolved : [];
  const persistingF = Array.isArray(diff?.persisting) ? diff.persisting : [];
  const oscillated = Array.isArray(diff?.oscillated) ? diff.oscillated : [];

  const parts = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="ja">');
  parts.push('<head>');
  parts.push('<meta charset="UTF-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>River Review Loop Dashboard</title>');
  parts.push(`<style>${INLINE_STYLE}</style>`);
  parts.push('</head>');
  parts.push('<body>');

  parts.push('<h1>River Review Loop Dashboard</h1>');
  parts.push(
    `<p class="meta">Runs: <strong>${runIds.length}</strong>${
      runIds.length ? ' &nbsp;|&nbsp; ' + runIds.map(escHtml).join(' → ') : ''
    }</p>`
  );

  // Suggested loop signal banner
  const sc = signal ? SIGNAL_CONFIG[signal] : null;
  if (sc) {
    parts.push(`<div class="banner" style="background:${sc.bg};border-color:${sc.border}">`);
    parts.push(`${sc.icon} suggestedLoopSignal: ${escHtml(sc.label)}`);
    parts.push('</div>');
  } else if (signal) {
    parts.push('<div class="banner" style="background:#f5f5f5;border-color:#9e9e9e">');
    parts.push(`suggestedLoopSignal: ${escHtml(String(signal))}`);
    parts.push('</div>');
  }

  // Churn counts
  parts.push('<h2>Churn</h2>');
  parts.push('<div class="counts">');
  parts.push(`<span class="count-chip" style="background:#1565c0">new ${newF.length}</span>`);
  parts.push(
    `<span class="count-chip" style="background:#2e7d32">resolved ${resolvedF.length}</span>`
  );
  parts.push(
    `<span class="count-chip" style="background:#757575">persisting ${persistingF.length}</span>`
  );
  parts.push(
    `<span class="count-chip" style="background:#c62828">oscillated ${oscillated.length}</span>`
  );
  parts.push('</div>');

  // Oscillation timeline — the core loop signal
  parts.push('<h2>Oscillation timeline</h2>');
  if (oscillated.length === 0) {
    parts.push('<p>No oscillating findings detected.</p>');
  } else {
    parts.push('<table>');
    parts.push('<tr><th>Finding</th><th>File</th><th>Timeline</th></tr>');
    for (const o of oscillated) {
      const f = o.finding ?? {};
      const title = escHtml((f.title || f.message || o.fingerprint || '').slice(0, 80));
      const file = escHtml(f.file ?? '');
      const timeline = (Array.isArray(o.timeline) ? o.timeline : [])
        .map((t) => {
          const id = escHtml(String(t.runId ?? '').slice(0, 8));
          const mark = t.present ? '●' : '○';
          return `<span title="${id}">${mark}</span>`;
        })
        .join(' ');
      parts.push(`<tr><td>${title}</td><td>${file}</td><td>${timeline}</td></tr>`);
    }
    parts.push('</table>');
    parts.push(
      '<p class="meta">● present &nbsp; ○ absent — present→absent→present indicates a revise loop re-introducing a finding.</p>'
    );
  }

  // New / resolved lists. diff entries are ComparedFinding wrappers: the actual
  // finding lives under `.current` (new) or `.previous` (resolved). Fall back to
  // the entry itself for callers that pass raw findings.
  const findingList = (heading, list, isResolved) => {
    parts.push(`<h2>${escHtml(heading)} (${list.length})</h2>`);
    if (list.length === 0) {
      parts.push('<p>None.</p>');
      return;
    }
    parts.push('<table>');
    parts.push('<tr><th>Severity</th><th>File</th><th>Title</th></tr>');
    for (const item of list) {
      const f = (isResolved ? item?.previous : item?.current) ?? item ?? {};
      const sev = f.severity ?? 'info';
      const color = SEVERITY_COLOR[sev] ?? '#1565c0';
      parts.push(
        `<tr><td><span class="sev" style="background:${color}">${escHtml(sev)}</span></td>` +
          `<td>${escHtml(f.file ?? '')}</td>` +
          `<td>${escHtml((f.title || f.message || '').slice(0, 120))}</td></tr>`
      );
    }
    parts.push('</table>');
  };
  findingList('New findings', newF, false);
  findingList('Resolved findings', resolvedF, true);

  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}


/***/ })

};

//# sourceMappingURL=599.index.mjs.map