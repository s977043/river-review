export const id = 980;
export const ids = [980,448];
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
/* harmony import */ var _plan_feedback_projection_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(5448);
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
function formatHtmlOutput(result, phase, { planFeedback = null } = {}) {
  if (planFeedback !== null && !(0,_plan_feedback_projection_mjs__WEBPACK_IMPORTED_MODULE_3__/* .isSourceMatchedPlanFeedback */ .y)(planFeedback)) {
    throw new TypeError('planFeedback requires a source-matched read-only model');
  }
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

  // PlanGate feedback is a separate, opt-in review-only projection.
  // It never feeds the canonical scorer, verdict or coverage model.
  if (planFeedback !== null) {
    parts.push('<section aria-labelledby="plan-feedback-heading">');
    parts.push('<h2 id="plan-feedback-heading">Planning questions (review-only)</h2>');
    parts.push(
      '<p class="meta">Source-matched feedback, not reviewer authentication, C-3 approval, a River verdict, or permission to merge.</p>'
    );
    parts.push('<p class="meta">Task: <code>' + escHtml(planFeedback.taskId) + '</code></p>');
    parts.push(
      '<p class="meta">Plan SHA-256: <code>' + escHtml(planFeedback.planSha256) + '</code></p>'
    );
    parts.push(
      '<p class="meta">Questions SHA-256: <code>' +
        escHtml(planFeedback.questionsSha256) +
        '</code></p>'
    );
    parts.push(
      '<table><tr><th>Question</th><th>Status</th><th>Response / reason</th><th>Declared references</th></tr>'
    );
    for (const q of planFeedback.items) {
      const details = [q.response, q.note].filter(Boolean).join('\n');
      const status =
        q.status === 'unanswered'
          ? 'UNANSWERED'
          : q.status === 'deferred'
            ? 'DEFERRED'
            : 'ANSWERED';
      parts.push(
        '<tr><td><strong>' +
          escHtml(q.id) +
          '</strong> ' +
          escHtml(q.prompt) +
          '</td>' +
          '<td>' +
          escHtml(status) +
          '</td>' +
          '<td><pre>' +
          escHtml(details) +
          '</pre></td>' +
          '<td>' +
          q.artifactRefs.map((ref) => '<code>' + escHtml(ref) + '</code>').join(', ') +
          '</td></tr>'
      );
    }
    parts.push('</table></section>');
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
  // #2325: the chip IS the claim. When the current run did not complete every
  // required review unit, some of these absences are unexecuted reviewers
  // rather than fixes, so the chip must not read as a verified win at a
  // glance. Three signals, because each reaches a different reader: the colour
  // drops from green to amber (the glance), an asterisk marks the number (copy
  // -paste, plain text, screen readers), and a neighbouring chip names the
  // coverage status in words.
  const coverageStatus = diff?.summary?.currentCoverageStatus;
  const absenceMayBeUnexecuted = diff?.summary?.absenceMayBeUnexecuted === true;
  const degradeResolvedChip = absenceMayBeUnexecuted && resolvedF.length > 0;
  parts.push(
    `<span class="count-chip" style="background:${degradeResolvedChip ? '#ef6c00' : '#2e7d32'}"` +
      ` title="${escHtml(
        degradeResolvedChip
          ? 'Absent from the current run. Coverage was not complete, so some of these may be review work that did not complete rather than fixes.'
          : 'Absent from the current run. Absence is not by itself evidence of a fix.'
      )}">resolved ${resolvedF.length}${degradeResolvedChip ? '*' : ''}</span>`
  );
  if (typeof coverageStatus === 'string' && coverageStatus.length > 0) {
    parts.push(
      `<span class="count-chip" style="background:${
        coverageStatus === 'complete' ? '#2e7d32' : '#ef6c00'
      }">coverage: ${escHtml(coverageStatus)}</span>`
    );
  }
  parts.push(
    `<span class="count-chip" style="background:#757575">persisting ${persistingF.length}</span>`
  );
  parts.push(
    `<span class="count-chip" style="background:#c62828">oscillated ${oscillated.length}</span>`
  );
  parts.push('</div>');
  if (degradeResolvedChip) {
    parts.push(
      '<p class="meta">* <strong>resolved</strong> counts fingerprints absent from the current run. Coverage was not complete, so some of them may be review work that did not complete rather than problems that were fixed.</p>'
    );
  }

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
  if (resolvedF.length) {
    // #2325: the green "resolved" chip and this table are presence data, not
    // proof of a fix. Say so next to the table, and say it louder when the
    // current run did not complete every required review unit.
    parts.push(
      '<p class="meta">Measured as: the fingerprint was present in the previous run and is absent from the current one. Absence is not by itself evidence of a fix.</p>'
    );
    if (diff?.summary?.absenceMayBeUnexecuted) {
      parts.push(
        `<p class="meta"><strong>Current run coverage: ${escHtml(
          diff.summary.currentCoverageStatus ?? 'unknown'
        )}</strong> — some of these may be review work that did not complete rather than problems that were fixed.</p>`
      );
    }
  }

  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}


/***/ }),

/***/ 5448:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   loadPlanFeedbackProjection: () => (/* binding */ loadPlanFeedbackProjection),
/* harmony export */   y: () => (/* binding */ isSourceMatchedPlanFeedback)
/* harmony export */ });
/* harmony import */ var node_crypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(7598);
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(3024);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(6760);
/**
 * Source-matched, non-authoritative PlanGate question projection.
 *
 * This validates local PlanGate input bytes independently. It never grants
 * approval, authenticates a reviewer, writes a file, or changes a River verdict.
 */




const BRAND = Symbol('river-review/source-matched-plan-feedback');
const STATES = new Set(['answered', 'deferred', 'unanswered']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SHA = /^[0-9a-f]{64}$/;
const TASK = /^TASK-[0-9]{4}$/;

function exact(obj, fields, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('invalid ' + label + ' object');
  }
  const keys = Object.keys(obj).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...fields].sort())) {
    throw new Error('invalid ' + label + ' fields');
  }
  return obj;
}

function readRegular(file, maximum) {
  const stat = (0,node_fs__WEBPACK_IMPORTED_MODULE_1__.lstatSync)(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) {
    throw new Error('invalid, symlinked or oversized local file: ' + node_path__WEBPACK_IMPORTED_MODULE_2__.basename(file));
  }
  const bytes = (0,node_fs__WEBPACK_IMPORTED_MODULE_1__.readFileSync)(file);
  if (bytes.length > maximum) throw new Error('oversized input');
  return bytes;
}

function parseStrict(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // JSON.parse alone accepts duplicate keys. Reject them at every nesting level.
  const stack = [];
  let start = -1;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (start >= 0) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c !== '"') continue;
      const token = JSON.parse(source.slice(start, i + 1));
      let next = i + 1;
      while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      const frame = stack[stack.length - 1];
      if (source[next] === ':' && frame?.type === 'object') {
        if (frame.keys.has(token)) throw new Error('duplicate JSON property');
        frame.keys.add(token);
      }
      start = -1;
    } else if (c === '"') start = i;
    else if (c === '{') stack.push({ type: 'object', keys: new Set() });
    else if (c === '[') stack.push({ type: 'array' });
    else if (c === '}' || c === ']') stack.pop();
  }
  return JSON.parse(source);
}

function validText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function sourceDigest(source, name, filename, bytes) {
  const item = exact(source, ['path', 'sha256'], 'source ' + name);
  if (item.path !== filename || typeof item.sha256 !== 'string' || !SHA.test(item.sha256)) {
    throw new Error('invalid source reference: ' + name);
  }
  if ((0,node_crypto__WEBPACK_IMPORTED_MODULE_0__.createHash)('sha256').update(bytes).digest('hex') !== item.sha256) {
    throw new Error('STALE plan feedback source: ' + name);
  }
}

/** Return an opaque, source-checked display-only model. */
function loadPlanFeedbackProjection({ workDir, feedbackPath, taskId }) {
  if (
    !validText(workDir, 2048) ||
    !validText(feedbackPath, 2048) ||
    typeof taskId !== 'string' ||
    !TASK.test(taskId)
  ) {
    throw new Error('explicit task ID, workDir and feedbackPath required');
  }
  const work = node_path__WEBPACK_IMPORTED_MODULE_2__.resolve(workDir);
  if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_1__.lstatSync)(work).isDirectory() || (0,node_fs__WEBPACK_IMPORTED_MODULE_1__.lstatSync)(work).isSymbolicLink()) {
    throw new Error('workDir must be a real directory');
  }
  const plan = readRegular(node_path__WEBPACK_IMPORTED_MODULE_2__.join(work, 'plan.md'), 10 * 1024 * 1024);
  const rawQuestions = readRegular(node_path__WEBPACK_IMPORTED_MODULE_2__.join(work, 'review-questions.json'), 128 * 1024);
  const rawFeedback = readRegular(node_path__WEBPACK_IMPORTED_MODULE_2__.resolve(feedbackPath), 512 * 1024);
  const questionsDoc = exact(parseStrict(rawQuestions), ['version', 'questions'], 'questions');
  if (
    questionsDoc.version !== 1 ||
    !Number.isInteger(questionsDoc.version) ||
    !Array.isArray(questionsDoc.questions) ||
    questionsDoc.questions.length === 0 ||
    questionsDoc.questions.length > 50
  )
    throw new Error('unsupported questions schema');
  const definitions = new Map();
  for (const q of questionsDoc.questions) {
    if (
      !q ||
      typeof q !== 'object' ||
      Array.isArray(q) ||
      Object.keys(q).some((key) => !['id', 'prompt', 'choices', 'artifactRefs'].includes(key)) ||
      typeof q.id !== 'string' ||
      !ID.test(q.id) ||
      !validText(q.prompt, 1200) ||
      definitions.has(q.id)
    ) {
      throw new Error('invalid or duplicate question definition');
    }
    for (const [field, maxCount, maxLength] of [
      ['choices', 12, 300],
      ['artifactRefs', 10, 250],
    ]) {
      const list = q[field] ?? [];
      if (
        !Array.isArray(list) ||
        list.length > maxCount ||
        list.some((x) => !validText(x, maxLength)) ||
        new Set(list).size !== list.length
      ) {
        throw new Error('invalid question ' + field);
      }
    }
    definitions.set(q.id, q);
  }
  const feedback = exact(
    parseStrict(rawFeedback),
    [
      'schemaVersion',
      'kind',
      'taskId',
      'source',
      'feedback_only',
      'approval_granted',
      'generatedAt',
      'answers',
    ],
    'feedback'
  );
  if (
    feedback.schemaVersion !== 1 ||
    !Number.isInteger(feedback.schemaVersion) ||
    feedback.kind !== 'plan-review-feedback' ||
    feedback.taskId !== taskId ||
    feedback.feedback_only !== true ||
    feedback.approval_granted !== false ||
    typeof feedback.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(feedback.generatedAt) ||
    !feedback.generatedAt.endsWith('Z') ||
    !Number.isFinite(Date.parse(feedback.generatedAt))
  ) {
    throw new Error('unsupported or authoritative feedback envelope');
  }
  const sources = exact(feedback.source, ['plan', 'questions'], 'source');
  sourceDigest(sources.plan, 'plan', 'plan.md', plan);
  sourceDigest(sources.questions, 'questions', 'review-questions.json', rawQuestions);
  if (!Array.isArray(feedback.answers) || feedback.answers.length !== definitions.size) {
    throw new Error('mismatched answer count');
  }
  const answerById = new Map();
  for (const a of feedback.answers) {
    exact(a, ['questionId', 'status', 'response', 'note'], 'answer');
    if (
      !definitions.has(a.questionId) ||
      answerById.has(a.questionId) ||
      !STATES.has(a.status) ||
      typeof a.response !== 'string' ||
      a.response.length > 4000 ||
      typeof a.note !== 'string' ||
      a.note.length > 4000
    ) {
      throw new Error('invalid answer / unknown or duplicate question');
    }
    const choices = definitions.get(a.questionId).choices ?? [];
    if (
      a.status === 'answered' &&
      (!a.response.trim() || (choices.length && !choices.includes(a.response)))
    ) {
      throw new Error('invalid answered state');
    }
    if (a.status === 'deferred' && (a.response || !a.note.trim())) {
      throw new Error('invalid deferred state');
    }
    if (a.status === 'unanswered' && (a.response || a.note)) {
      throw new Error('invalid unanswered state');
    }
    answerById.set(a.questionId, a);
  }
  const items = [...definitions.values()].map((q) => {
    const answer = answerById.get(q.id);
    return Object.freeze({
      id: q.id,
      prompt: q.prompt,
      status: answer.status,
      response: answer.response,
      note: answer.note,
      artifactRefs: Object.freeze([...(q.artifactRefs ?? [])]),
    });
  });
  return Object.freeze({
    [BRAND]: true,
    kind: 'SOURCE_MATCHED_REVIEW_FEEDBACK',
    taskId,
    planSha256: sources.plan.sha256,
    questionsSha256: sources.questions.sha256,
    items: Object.freeze(items),
    // A digest cannot establish reviewer identity or grant authorization.
    approvalGranted: false,
  });
}

function isSourceMatchedPlanFeedback(value) {
  return value?.[BRAND] === true && value.kind === 'SOURCE_MATCHED_REVIEW_FEEDBACK';
}


/***/ })

};

//# sourceMappingURL=980.index.mjs.map