export function makeFinding(overrides = {}) {
  const finding = {
    id: 'rr-1',
    ruleId: 'logging-observability',
    file: 'src/app.js',
    lineStart: 5,
    lineEnd: 5,
    title: 'catch で例外が握りつぶされる',
    severity: 'major',
    confidence: 'high',
    status: 'open',
    evidence: ['catch 内で return'],
    ...overrides,
  };

  finding.message =
    overrides.message ??
    `Finding: ${finding.title} Evidence: catch 内で return Impact: 障害調査が困難 Fix: ログ+再throw Severity: warning Confidence: high`;

  return finding;
}

export function commentFor(finding) {
  return {
    skillId: finding.ruleId,
    file: finding.file,
    line: finding.lineStart,
    message: finding.message,
  };
}

export function makeResult({
  findings = [],
  comments,
  suppressed = [],
  overflow = [],
  plan,
  teamLeadReport = null,
  reviewCoverage,
} = {}) {
  return {
    findings,
    comments: comments ?? findings.map(commentFor),
    classified: suppressed.length || overflow.length ? { suppressed, overflow } : undefined,
    plan: plan ?? { selected: [], skipped: [] },
    changedFiles: ['src/app.js'],
    tokenEstimate: 42,
    teamLeadReport,
    ...(reviewCoverage === undefined ? {} : { reviewCoverage }),
  };
}
