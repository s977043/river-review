import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  validatePluginManifest,
  checkBundleFieldAllowlist,
  checkCrossManifestParity,
  checkAssetRegistration,
  checkManifestHostIndependentRefs,
  checkPluginHooksScripts,
  checkReviewJudgmentDuplication,
  detectReviewJudgmentDefinitions,
  findSsotReferences,
  isContainedSsotPath,
  loadSsotContents,
  RA1_ENFORCEMENT,
  RA1_MAX_TARGET_BYTES,
  RA1_TARGET_PATHSPECS,
  SSOT_REFERENCE_PATTERN,
  ra1Sink,
} from '../scripts/validate-plugin-manifest.mjs';

test('validatePluginManifest passes on current repo state', async () => {
  const errors = await validatePluginManifest();
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

function makeCcManifest() {
  return {
    name: 'river-review',
    displayName: 'River Review',
    homepage: 'https://example.com/',
    repository: 'https://github.com/s977043/river-review',
    author: { name: 'river-review maintainers', url: 'https://example.com/' },
    skills: './skills/agent-skills/',
    composerIcon: './assets/icon.svg',
  };
}

function makeCodexManifest() {
  return {
    name: 'river-review',
    version: '1.0.0',
    description: 'desc',
    author: { name: 'river-review maintainers', url: 'https://example.com/' },
    homepage: 'https://example.com/',
    repository: 'https://github.com/s977043/river-review',
    license: 'MIT',
    keywords: ['code-review'],
    skills: './skills/agent-skills/',
    interface: {
      displayName: 'River Review',
      shortDescription: 'short',
      longDescription: 'long',
      developerName: 'river-review maintainers',
      category: 'Developer Tools',
      capabilities: ['Read'],
      websiteURL: 'https://example.com/',
      composerIcon: './assets/icon.svg',
    },
  };
}

test('checkCrossManifestParity passes when shared fields match', () => {
  const errors = checkCrossManifestParity(makeCcManifest(), makeCodexManifest());
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkCrossManifestParity detects repository drift', () => {
  const codex = makeCodexManifest();
  codex.repository = 'https://github.com/other/fork';
  const errors = checkCrossManifestParity(makeCcManifest(), codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"repository"/);
});

test('checkCrossManifestParity detects composerIcon drift (regression #1250)', () => {
  const codex = makeCodexManifest();
  delete codex.interface.composerIcon;
  const errors = checkCrossManifestParity(makeCcManifest(), codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /interface\.composerIcon/);
});

test('checkCrossManifestParity detects displayName and websiteURL drift', () => {
  const codex = makeCodexManifest();
  codex.interface.displayName = 'Other Name';
  codex.interface.websiteURL = 'https://elsewhere.example/';
  const errors = checkCrossManifestParity(makeCcManifest(), codex);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /interface\.displayName/);
  assert.match(errors[1], /interface\.websiteURL/);
});

test('checkCrossManifestParity detects developerName drift against author.name', () => {
  const codex = makeCodexManifest();
  codex.interface.developerName = 'someone else';
  const errors = checkCrossManifestParity(makeCcManifest(), codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /interface\.developerName/);
});

test('checkBundleFieldAllowlist passes on a conforming manifest', () => {
  const errors = checkBundleFieldAllowlist(makeCodexManifest());
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkBundleFieldAllowlist rejects unknown top-level field', () => {
  const codex = makeCodexManifest();
  codex.marketplaceBadge = 'gold';
  const errors = checkBundleFieldAllowlist(codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"marketplaceBadge" is not in the bundle allowlist/);
});

test('checkBundleFieldAllowlist rejects unknown interface field', () => {
  const codex = makeCodexManifest();
  codex.interface.heroImage = './assets/hero.png';
  const errors = checkBundleFieldAllowlist(codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /interface field "heroImage" is not in the bundle allowlist/);
});

test('checkBundleFieldAllowlist reports missing listing-required fields', () => {
  const codex = makeCodexManifest();
  delete codex.repository;
  codex.license = '';
  const errors = checkBundleFieldAllowlist(codex);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /required bundle field "repository"/);
  assert.match(errors[1], /required bundle field "license"/);
});

test('checkBundleFieldAllowlist reports null listing-required field', () => {
  const codex = makeCodexManifest();
  codex.license = null;
  const errors = checkBundleFieldAllowlist(codex);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /required bundle field "license"/);
});

test('checkAssetRegistration passes when every command/agent file is registered', () => {
  const cc = {
    commands: ['./commands/pr.md', './commands/check.md'],
    agents: './agents/river-review.md',
  };
  const errors = checkAssetRegistration(cc, {
    commandFiles: ['pr.md', 'check.md', 'README.md'],
    agentFiles: ['river-review.md'],
  });
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkAssetRegistration detects an unregistered command file', () => {
  const cc = { commands: ['./commands/pr.md'], agents: './agents/river-review.md' };
  const errors = checkAssetRegistration(cc, {
    commandFiles: ['pr.md', 'new-cmd.md'],
    agentFiles: ['river-review.md'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /commands\/new-cmd\.md exists but is not registered/);
});

test('checkAssetRegistration never flags README.md', () => {
  const cc = { commands: [], agents: [] };
  const errors = checkAssetRegistration(cc, {
    commandFiles: ['README.md'],
    agentFiles: ['README.md'],
  });
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkAssetRegistration detects an unregistered agent file', () => {
  const cc = { commands: [], agents: './agents/river-review.md' };
  const errors = checkAssetRegistration(cc, {
    commandFiles: [],
    agentFiles: ['river-review.md', 'extra-agent.md'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /agents\/extra-agent\.md exists but is not referenced/);
});

test('checkAssetRegistration accepts agents declared as an array', () => {
  const cc = {
    commands: [],
    agents: ['./agents/river-review.md', './agents/extra-agent.md'],
  };
  const errors = checkAssetRegistration(cc, {
    commandFiles: [],
    agentFiles: ['river-review.md', 'extra-agent.md'],
  });
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkAssetRegistration tolerates unexpected field/manifest types without throwing (gemini #1443)', () => {
  // commands/agents of unexpected types → treated as "nothing registered".
  assert.doesNotThrow(() => {
    const errors = checkAssetRegistration(
      { commands: { not: 'an array' }, agents: 42 },
      { commandFiles: ['new-cmd.md'], agentFiles: ['new-agent.md'] }
    );
    assert.equal(errors.length, 2);
  });
  // null manifest → no throw, no registrations.
  assert.doesNotThrow(() => {
    const errors = checkAssetRegistration(null, { commandFiles: ['x.md'], agentFiles: [] });
    assert.equal(errors.length, 1);
  });
  // Non-string array elements are skipped, not passed to normalizeRef (no throw).
  assert.doesNotThrow(() => {
    const errors = checkAssetRegistration(
      { commands: [123, null, './commands/pr.md'], agents: [{}, './agents/river-review.md'] },
      { commandFiles: ['pr.md', 'other.md'], agentFiles: ['river-review.md'] }
    );
    // pr.md / river-review.md registered (valid string refs); only other.md flagged.
    assert.equal(errors.length, 1);
    assert.match(errors[0], /commands\/other\.md/);
  });
});

// ---------------------------------------------------------------------------
// Runtime Adapter Invariants RA-1 / RA-2 (ADR-009 D3, #2027)
// ---------------------------------------------------------------------------

const RA_FIXTURES = path.join(import.meta.dirname, 'fixtures', 'runtime-adapter-invariants');

const readFixture = (name) => fs.readFileSync(path.join(RA_FIXTURES, `${name}.md`), 'utf8');

test('RA-1 positive fixture: a pointer-only host-local file has no judgment definition', () => {
  const hits = detectReviewJudgmentDefinitions(readFixture('compliant-pointer-only'));
  assert.deepEqual(hits, [], `Expected no detections but got: ${JSON.stringify(hits)}`);
});

test('RA-1 negative fixture: a duplicated severity mapping table is detected', () => {
  const hits = detectReviewJudgmentDefinitions(readFixture('violating-severity-map'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, 'severity-vocabulary-map');
  assert.match(hits[0].term, /blocker→critical/);
});

test('RA-1 negative fixture: gate, completion and evidence definitions are detected', () => {
  const hits = detectReviewJudgmentDefinitions(readFixture('violating-gate-condition'));
  assert.deepEqual(
    hits.map((h) => [h.rule, h.term]),
    [
      ['gate-decision-condition', 'GO'],
      ['gate-decision-condition', 'NO_GO'],
      ['completion-condition', '完了条件'],
      ['finding-evidence-requirement', 'finding evidence'],
      ['finding-evidence-requirement', 'finding evidence'],
    ]
  );
});

test('RA-1 evidence rule matches Japanese 指摘 lines (#2050 re-review major 1)', () => {
  // `\b` creates no boundary between CJK characters, so a `\b指摘\b` branch
  // never fired on Japanese prose — the rule was silently English-only.
  for (const line of [
    '指摘には必ず証跡を添える。',
    '指摘には証跡が必須です',
    'すべての指摘に証跡を必ず添えること',
  ]) {
    const hits = detectReviewJudgmentDefinitions(line);
    assert.equal(hits.length, 1, `no detection for: ${line}`);
    assert.equal(hits[0].rule, 'finding-evidence-requirement');
  }
  // The English branch keeps its word boundary: no match inside a longer word.
  assert.deepEqual(
    detectReviewJudgmentDefinitions('The refindings evidence must be required.'),
    []
  );
});

test('RA-1 severity rule does not fire on a single fail-safe `major` row', () => {
  // normalizeSeverity() maps anything unknown to `major`, so one such row is
  // not evidence of a duplicated mapping table.
  const content = ['| term | output |', '| ---- | ------ |', '| whatever | major |'].join('\n');
  assert.deepEqual(detectReviewJudgmentDefinitions(content), []);
});

test('RA-1 severity rule does not fire on a one-row glossary entry (#2050 minor 2)', () => {
  // A single `| nit | minor |` line is a glossary entry, not a duplicated map.
  assert.deepEqual(detectReviewJudgmentDefinitions('| nit | minor |'), []);
  assert.deepEqual(detectReviewJudgmentDefinitions('| blocker | critical |'), []);
});

test('RA-1 severity rule survives a third column and backticked cells (#2050 major 2)', () => {
  const content = [
    '| 内部語彙 | 出力スキーマ | 備考 |',
    '| -------- | ------------ | ---- |',
    '| `blocker` | `critical` | 最重要 |',
    '| `nit` | `minor` | 軽微 |',
  ].join('\n');
  const hits = detectReviewJudgmentDefinitions(content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, 'severity-vocabulary-map');
  assert.match(hits[0].term, /blocker→critical/);
});

test('RA-1 severity rule survives full-width pipes (#2050 major 2)', () => {
  const content = ['｜ warning ｜ major ｜', '｜ nit ｜ minor ｜'].join('\n');
  const hits = detectReviewJudgmentDefinitions(content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, 'severity-vocabulary-map');
});

test('RA-1 gate rule accepts list-marker and alternative condition lead-ins (#2050 major 2)', () => {
  for (const condition of ['- 条件: すべて pass。', '**成立要件**: すべて pass。']) {
    const hits = detectReviewJudgmentDefinitions(`### A. NO_GO\n\n${condition}`);
    assert.equal(hits.length, 1, `no detection for: ${condition}`);
    assert.equal(hits[0].term, 'NO_GO');
  }
});

test('RA-1 gate rule scans bold labels, list items and table rows (#2050 major 2)', () => {
  const cases = [
    ['**GO_WITH_OBSERVATION**\n\n- 条件: minor だけが残る。', 'GO_WITH_OBSERVATION'],
    ['- GO — マージ可\n  条件: blocking が残らない。', 'GO'],
    ['| 判定 | 条件 |\n| - | - |\n| NO_GO | blocking が残る |', 'NO_GO'],
  ];
  for (const [content, term] of cases) {
    const hits = detectReviewJudgmentDefinitions(content);
    assert.equal(hits.length, 1, `no detection for: ${content}`);
    assert.equal(hits[0].rule, 'gate-decision-condition');
    assert.equal(hits[0].term, term);
  }
});

test('RA-1 gate rule does not fire on acronym or identifier headings (#2050 major 3)', () => {
  const hits = detectReviewJudgmentDefinitions(readFixture('compliant-screaming-headings'));
  assert.deepEqual(hits, [], `Expected no detections but got: ${JSON.stringify(hits)}`);
});

test('RA-1 negative fixture: every previously evaded form is detected (#2050 major 2)', () => {
  const hits = detectReviewJudgmentDefinitions(readFixture('violating-evaded-forms'));
  assert.deepEqual(
    hits.map((h) => [h.rule, h.term]),
    [
      ['severity-vocabulary-map', 'blocker→critical, nit→minor'],
      ['severity-vocabulary-map', 'warning→major, nit→minor'],
      ['gate-decision-condition', 'GO_WITH_OBSERVATION'],
      ['gate-decision-condition', 'GO'],
      ['gate-decision-condition', 'NO_GO'],
    ]
  );
});

test('RA-1 exclusion needs the condition text, not the bare verdict word (#2050 major 1)', () => {
  // Naming any src/lib file that merely contains the verdict word must not
  // excuse a gate condition. `NO_GO` occurs inside `PROMPT_NO_GOAL_HINT`.
  const content = [
    '判定語彙の実装: `src/lib/prompt-compiler-paired.mjs`',
    '',
    '### B. NO_GO',
    '',
    '条件: blocking な finding が 1 件以上残る。',
  ].join('\n');
  const ssot = new Map([
    ['src/lib/prompt-compiler-paired.mjs', 'export const PROMPT_NO_GOAL_HINT = 1;\n'],
  ]);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/commands/merge-check.md', content }],
    ssot
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /condition text of "NO_GO" is not present verbatim/);
});

test('RA-1 exclusion excuses a condition sentence present verbatim in the SSoT (#2050 major 1)', () => {
  const content = [
    '出典: `skills/upstream/merge-gate/SKILL.md`',
    '',
    '### B. NO_GO',
    '',
    '条件: blocking な finding が 1 件以上残る。',
  ].join('\n');
  const ssot = new Map([
    [
      'skills/upstream/merge-gate/SKILL.md',
      '# gate\n\n条件: blocking な finding が 1 件以上残る。\n',
    ],
  ]);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/commands/merge-check.md', content }],
    ssot
  );
  assert.deepEqual(violations, [], `Expected no violations but got: ${violations.join(', ')}`);
});

test('RA-1 severity exclusion matches whole words only (#2050 major 1)', () => {
  const content = [
    '出典: `src/lib/finding-factory.mjs`',
    '',
    '| blocker | critical |',
    '| nit | minor |',
  ].join('\n');
  // `blocker` only as a substring of `nonblocker` → not a whole-word match.
  const substringOnly = new Map([
    ['src/lib/finding-factory.mjs', 'nonblocker critical nit minor\n'],
  ]);
  assert.equal(
    checkReviewJudgmentDuplication([{ path: '.claude/rules/x.md', content }], substringOnly).length,
    1
  );
  const wholeWords = new Map([
    ['src/lib/finding-factory.mjs', "['blocker', 'critical', 'nit', 'minor']\n"],
  ]);
  assert.deepEqual(
    checkReviewJudgmentDuplication([{ path: '.claude/rules/x.md', content }], wholeWords),
    []
  );
});

test('checkManifestHostIndependentRefs rejects `..` traversal out of the top level (#2050 minor 4)', () => {
  const errors = checkManifestHostIndependentRefs(
    { skills: './skills/../../etc/passwd' },
    { skills: './skills/agent-skills/' }
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /escapes the repository root once normalized/);
});

test('RA-1 severity rule does not fire on a table of only fail-safe `major` rows', () => {
  // Two rows, both explainable by the `major` fail-safe: still not a mapping.
  const content = [
    '| term | output |',
    '| ---- | ------ |',
    '| whatever | major |',
    '| something | major |',
  ].join('\n');
  assert.deepEqual(detectReviewJudgmentDefinitions(content), []);
});

test('findSsotReferences keeps only D3-3 SSoT paths', () => {
  const content = [
    'See `docs/governance.md` and `docs/review/viewpoints.md`.',
    'Canonical: `pages/reference/review-policy.md`, `src/lib/finding-factory.mjs`.',
  ].join('\n');
  assert.deepEqual(findSsotReferences(content), [
    'pages/reference/review-policy.md',
    'src/lib/finding-factory.mjs',
  ]);
});

test('checkReviewJudgmentDuplication flags a definition with no SSoT reference', () => {
  const files = [{ path: '.claude/rules/x.md', content: readFixture('violating-severity-map') }];
  const violations = checkReviewJudgmentDuplication(files, new Map());
  assert.equal(violations.length, 1);
  assert.match(violations[0], /RA-1 \.claude\/rules\/x\.md:\d+: severity-vocabulary-map/);
  assert.match(violations[0], /declares no ADR-009 D3-3 SSoT reference/);
});

test('checkReviewJudgmentDuplication flags a reference whose SSoT lacks the wording verbatim', () => {
  // This is the `.claude/rules/review-core.md` shape ADR-009 D7-2 records: the
  // file points at an SSoT, but the SSoT never spells the internal vocabulary.
  const content = `See docs/review/output-format.md.\n\n${readFixture('violating-severity-map')}`;
  const ssot = new Map([
    ['docs/review/output-format.md', '# Output format\n\ncritical / major / minor\n'],
  ]);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/rules/review-core.md', content }],
    ssot
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /not present verbatim in the referenced SSoT/);
});

test('checkReviewJudgmentDuplication excuses a derived table present verbatim in the SSoT', () => {
  const content = `See docs/review/output-format.md.\n\n${readFixture('violating-severity-map')}`;
  const ssot = new Map([
    [
      'docs/review/output-format.md',
      '# Output format\n\nblocker → critical, warning → major, nit → minor\n',
    ],
  ]);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/rules/review-core.md', content }],
    ssot
  );
  assert.deepEqual(violations, [], `Expected no violations but got: ${violations.join(', ')}`);
});

// ---------------------------------------------------------------------------
// #2058: the D3-3 exclusion checks the DIRECTION of the severity mapping, not
// only the presence of its vocabulary. Three fixtures share the same six
// tokens and the same SSoT reference; only the one that agrees with
// normalizeSeverity is excused.
// ---------------------------------------------------------------------------

/** The real severity SSoT, so the fixtures are checked against production. */
const severitySsot = () =>
  new Map([
    [
      'src/lib/finding-factory.mjs',
      fs.readFileSync(
        path.join(path.resolve(import.meta.dirname, '..'), 'src/lib/finding-factory.mjs'),
        'utf8'
      ),
    ],
  ]);

test('RA-1 #2058 fixture (forward): a mapping that agrees with the SSoT is excused', () => {
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/rules/x.md', content: readFixture('compliant-severity-map-derived') }],
    severitySsot()
  );
  assert.deepEqual(violations, [], `Expected no violations but got: ${violations.join(', ')}`);
});

test('RA-1 #2058 fixture (reversed): a reversed mapping is a violation', () => {
  const content = readFixture('violating-severity-map-reversed');
  // The detection itself must fire: candidacy is a shape test now, so a
  // reversed row is no longer invisible to detectReviewJudgmentDefinitions.
  const hits = detectReviewJudgmentDefinitions(content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, 'severity-vocabulary-map');
  assert.match(hits[0].term, /blocker→minor/);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/rules/x.md', content }],
    severitySsot()
  );
  assert.equal(violations.length, 1, `Expected 1 violation but got: ${violations.join(', ')}`);
  assert.match(violations[0], /disagrees with normalizeSeverity\(\)/);
  assert.match(violations[0], /blocker→minor \(SSoT: blocker→critical\)/);
  assert.match(violations[0], /nit→critical \(SSoT: nit→minor\)/);
});

test('RA-1 #2058 fixture (mis-mapped): the same six tokens, wrong pairing, is a violation', () => {
  const content = readFixture('violating-severity-map-mismapped');
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/rules/x.md', content }],
    severitySsot()
  );
  assert.equal(violations.length, 1, `Expected 1 violation but got: ${violations.join(', ')}`);
  assert.match(violations[0], /blocker→major \(SSoT: blocker→critical\)/);
});

test('RA-1 #2058: flipping the real review-core.md table is caught (#2058 root case)', () => {
  // Cross-check on the production path: the same file that passes today must
  // fail the moment its table stops agreeing with normalizeSeverity. The file
  // on disk is not modified — only the string read from it.
  const root = path.resolve(import.meta.dirname, '..');
  const rel = '.claude/rules/review-core.md';
  const content = fs.readFileSync(path.join(root, rel), 'utf8');
  const drifted = content
    .replace('| blocker  | critical     |', '| blocker  | minor        |')
    .replace('| nit      | minor        |', '| nit      | critical     |');
  assert.notEqual(drifted, content, 'the severity table shape changed; update this mutation');
  const refs = findSsotReferences(content);
  const ssot = new Map(refs.map((ref) => [ref, fs.readFileSync(path.join(root, ref), 'utf8')]));
  const violations = checkReviewJudgmentDuplication([{ path: rel, content: drifted }], ssot);
  assert.equal(violations.length, 1, `Expected 1 violation but got: ${violations.join(', ')}`);
  assert.match(violations[0], /disagrees with normalizeSeverity\(\)/);
});

test('RA-1 #2059: `.claude/commands/**` is still scanned — only the vocabulary narrowed', () => {
  // The ADR-009 D7 postscript states that #2027 narrowed the verdict
  // VOCABULARY, not the target path set. Pin both halves.
  assert.ok(RA1_TARGET_PATHSPECS.includes('.claude/**'));
  const productGate = ['## 判定', '', '### NO_GO', '', '条件: 重大な違反が 1 件以上ある'].join(
    '\n'
  );
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/commands/foo.md', content: productGate }],
    new Map()
  );
  assert.equal(violations.length, 1, `Expected 1 violation but got: ${violations.join(', ')}`);
  assert.match(violations[0], /RA-1 \.claude\/commands\/foo\.md:\d+: gate-decision-condition/);
  // A repository-procedure verdict in the same position is out of vocabulary.
  const procedure = ['## 判定', '', '### MERGE_OK', '', '条件: CI が green である'].join('\n');
  assert.deepEqual(
    checkReviewJudgmentDuplication(
      [{ path: '.claude/commands/bar.md', content: procedure }],
      new Map()
    ),
    []
  );
});

test('RA-1 canary: tables that share severity vocabulary are not the mapping (#2063 major 3)', () => {
  // The candidate test was relaxed for #2058. These three tables are the
  // boundary that relaxation must not cross: an incident-grade table and a log
  // level table (left cell is an OUTPUT token) and a semver table (right cell
  // is not an output token). All three anchored + failed the direction check
  // while the anchor test accepted any token the SSoT knows.
  assert.deepEqual(
    detectReviewJudgmentDefinitions(readFixture('compliant-non-severity-tables')),
    []
  );
  const cases = [
    ['incident grades', ['| minor | info |', '| major | critical |']],
    ['log levels', ['| critical | major |', '| trace | info |']],
    ['semver bumps', ['| major | breaking |', '| minor | feature |']],
  ];
  for (const [label, rows] of cases) {
    const hits = detectReviewJudgmentDefinitions(rows.join('\n'));
    assert.deepEqual(
      hits,
      [],
      `${label} must not be read as the severity map: ${JSON.stringify(hits)}`
    );
  }
  // The real mapping still anchors: `blocker` and `nit` are internal tokens.
  const real = ['| blocker | critical |', '| nit | minor |'].join('\n');
  assert.equal(detectReviewJudgmentDefinitions(real).length, 1);
});

test('RA-1 #2058: the `(なし) | info` row is not a mapping row', () => {
  // `(なし)` states that no internal token maps to `info`. It is prose, not a
  // vocabulary token, so it must not be probed against normalizeSeverity —
  // doing so would return the fail-safe value and manufacture a mismatch.
  const content = [
    '| 内部語彙 | 出力スキーマ |',
    '| -------- | ------------ |',
    '| blocker  | critical     |',
    '| nit      | minor        |',
    '| (なし)   | info         |',
  ].join('\n');
  const hits = detectReviewJudgmentDefinitions(content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].term, 'blocker→critical, nit→minor');
});

test('checkManifestHostIndependentRefs passes on the current manifests (RA-2)', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const cc = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const errors = checkManifestHostIndependentRefs(cc, codex);
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

test('checkManifestHostIndependentRefs rejects a host-local reference (RA-2)', () => {
  const errors = checkManifestHostIndependentRefs(
    { commands: ['./.claude/commands/merge-check.md'], skills: './skills/agent-skills/' },
    { skills: './skills/agent-skills/' }
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /points into a host-local directory/);
});

test('checkManifestHostIndependentRefs rejects a reference outside the top-level set (RA-2)', () => {
  const errors = checkManifestHostIndependentRefs(
    { skills: './src/lib/skills/' },
    { skills: './skills/agent-skills/', interface: { composerIcon: './assets/icon.svg' } }
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /outside the host-neutral top-level set/);
});

test('ra1Sink routes each enforcement stage (#2027 off → observe → active)', () => {
  assert.equal(ra1Sink('off'), null);
  assert.equal(ra1Sink('observe'), 'observations');
  assert.equal(ra1Sink('active'), 'errors');
});

test('RA-1 stage routing, pinned on an injected violation (#2050 re-review B-1)', () => {
  // Pinned on an injected file, NOT on how many violations the repository
  // happens to hold: the previous version asserted "exactly one real
  // violation" and broke the moment that violation was fixed.
  const violation = {
    path: '.claude/rules/injected.md',
    content: readFixture('violating-severity-map'),
  };
  const violations = checkReviewJudgmentDuplication([violation], new Map());
  assert.equal(violations.length, 1);

  const route = (stage) => {
    const errors = [];
    const observations = [];
    const sink = ra1Sink(stage);
    if (sink !== null) (sink === 'errors' ? errors : observations).push(...violations);
    return { errors, observations };
  };

  assert.deepEqual(route('off'), { errors: [], observations: [] });
  assert.deepEqual(route('observe'), { errors: [], observations: violations });
  assert.deepEqual(route('active'), { errors: violations, observations: [] });
});

test('RA-1 is active and the repository has no RA-1 finding', async () => {
  const warnings = [];
  const errors = await validatePluginManifest({ warnings });
  assert.equal(RA1_ENFORCEMENT, 'active');
  assert.equal(ra1Sink(RA1_ENFORCEMENT), 'errors');
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
  // Nothing may be routed to observations while active, and nothing is left to
  // report anyway: both violations were dispositioned (#2050 decisions 1 / 2).
  assert.deepEqual(
    warnings.filter((w) => w.startsWith('RA-1 ')),
    []
  );
});

test('RA-1 exclusion holds for .claude/rules/review-core.md via src/lib (#2050 decision 2)', async () => {
  // Cross-check against the production path: the file still carries the
  // severity table, so it is the exclusion — not the absence of a detection —
  // that keeps it out of the violation list.
  const root = path.resolve(import.meta.dirname, '..');
  const rel = '.claude/rules/review-core.md';
  const content = fs.readFileSync(path.join(root, rel), 'utf8');
  const hits = detectReviewJudgmentDefinitions(content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, 'severity-vocabulary-map');
  const refs = findSsotReferences(content);
  assert.ok(
    refs.includes('src/lib/finding-factory.mjs'),
    `severity SSoT reference missing from ${rel}: ${refs.join(', ')}`
  );
  const ssot = new Map(refs.map((ref) => [ref, fs.readFileSync(path.join(root, ref), 'utf8')]));
  assert.deepEqual(checkReviewJudgmentDuplication([{ path: rel, content }], ssot), []);
});

// ---------------------------------------------------------------------------
// #2050 review follow-ups: SSoT path traversal (major 1) and the
// finding-evidence catastrophic backtracking (major 2).
// ---------------------------------------------------------------------------

test('findSsotReferences drops `..` traversal references (#2050 review major 1)', () => {
  // The PoC input verbatim: `path.join(ROOT, 'skills/../../../../../../etc/passwd')`
  // resolves outside the repository, and loadSsotContents used to read it.
  assert.deepEqual(findSsotReferences('参照: skills/../../../../../../etc/passwd'), []);
  assert.deepEqual(findSsotReferences('参照: src/lib/../../../../../../etc/passwd'), []);
  assert.deepEqual(findSsotReferences('参照: skills/../.env'), []);

  // Fixture form: only the two contained references survive.
  assert.deepEqual(findSsotReferences(readFixture('attack-ssot-path-traversal')), [
    'skills/upstream/merge-gate/SKILL.md',
    'src/lib/finding-factory.mjs',
  ]);
});

test('the SSoT reference pattern itself refuses `..` segments (#2050 review major 1)', () => {
  // Pinned separately from isContainedSsotPath: with only the containment
  // predicate under test, the pattern could regress to `[\w./-]+` unnoticed.
  const re = new RegExp(SSOT_REFERENCE_PATTERN, 'g');
  for (const input of [
    'skills/../../../../../../etc/passwd',
    'src/lib/../../../etc/passwd',
    'skills/..',
    'src/lib/..',
  ]) {
    const hits = String(input).match(re) || [];
    for (const hit of hits) {
      assert.ok(
        !hit.split('/').includes('..'),
        `pattern produced a traversal reference: ${hit} (from ${input})`
      );
    }
  }
  // A legitimate nested path still matches in full.
  assert.deepEqual('出典: skills/upstream/merge-gate/SKILL.md'.match(re), [
    'skills/upstream/merge-gate/SKILL.md',
  ]);
});

test('isContainedSsotPath gates every SSoT read (#2050 review major 1)', () => {
  // Escapes — refused even though they start with an allowed prefix.
  for (const ref of [
    'skills/../../../../../../etc/passwd',
    'src/lib/../../../etc/passwd',
    'skills/..',
    '/etc/passwd',
    '',
  ]) {
    assert.equal(isContainedSsotPath(ref), false, `expected refusal for: ${ref}`);
  }
  // Contained — still accepted, including a `.` segment and a `./` prefix.
  for (const ref of [
    'skills/upstream/merge-gate/SKILL.md',
    'src/lib/finding-factory.mjs',
    './src/lib/finding-factory.mjs',
    'skills/./upstream/merge-gate/SKILL.md',
    'pages/reference/review-policy.md',
    'docs/review/output-format.md',
  ]) {
    assert.equal(isContainedSsotPath(ref), true, `expected acceptance for: ${ref}`);
  }
  // Outside the SSoT set entirely.
  assert.equal(isContainedSsotPath('docs/governance.md'), false);
});

test('a traversal reference cannot excuse a detected definition (#2050 major 1)', () => {
  // End-to-end through the production path: the attacker names the traversal
  // target as the SSoT and supplies its content; the hit must stay a violation
  // because the reference is never collected in the first place.
  const content = [
    '参照: skills/../../../../../../etc/passwd',
    '',
    '### B. NO_GO',
    '',
    '条件: blocking な finding が 1 件以上残る。',
  ].join('\n');
  const ssot = new Map([
    ['skills/../../../../../../etc/passwd', '条件: blocking な finding が 1 件以上残る。\n'],
  ]);
  const violations = checkReviewJudgmentDuplication(
    [{ path: '.claude/commands/evil.md', content }],
    ssot
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /declares no ADR-009 D3-3 SSoT reference/);
});

test('finding-evidence detection is linear on the ReDoS input (#2050 review major 2)', () => {
  const fixture = readFixture('attack-evidence-redos');
  const unit = fixture.split('<!-- redos-unit -->')[1].split('<!-- /redos-unit -->')[0].trim();
  assert.equal(unit, 'finding evidence');

  const timings = [];
  for (const kb of [10, 40, 100]) {
    const line = `${unit} `.repeat(Math.ceil((kb * 1024) / (unit.length + 1)));
    const started = process.hrtime.bigint();
    const hits = detectReviewJudgmentDefinitions(line);
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
    assert.deepEqual(hits, [], `unexpected detection at ${kb}KB`);
  }
  // Before the fix these were 137 / 2068 / 12958 ms. A generous ceiling that
  // still fails hard on a quadratic regression; the assertion is on the shape,
  // not on machine speed.
  assert.ok(
    timings[2] < 1000,
    `100KB non-matching line took ${timings[2].toFixed(0)}ms — quadratic backtracking is back`
  );

  // The rule still fires on a line that carries all three ideas.
  const matching = detectReviewJudgmentDefinitions('finding evidence required');
  assert.equal(matching.length, 1);
  assert.equal(matching[0].rule, 'finding-evidence-requirement');
});

test('the finding-evidence split keeps the ASCII boundary and the CJK non-boundary', () => {
  // `指摘` must have no `\b` (CJK has no word boundary); ASCII must keep one.
  assert.deepEqual(
    detectReviewJudgmentDefinitions('The refindings evidence must be required.'),
    []
  );
  assert.deepEqual(detectReviewJudgmentDefinitions('finding_s evidence required'), []);
  for (const line of ['指摘には必ず証跡を添える。', 'findings MUST carry evidence']) {
    const hits = detectReviewJudgmentDefinitions(line);
    assert.equal(hits.length, 1, `no detection for: ${line}`);
    assert.equal(hits[0].rule, 'finding-evidence-requirement');
  }
});

test('the RA-1 scan size cap is above every current target (#2050 review minor)', () => {
  // The cap exists to bound attacker-controlled per-line work; it must not be
  // reachable by any real target, or `Meta consistency` would fail on content
  // rather than on a violation. Measured against the production target set.
  const root = path.resolve(import.meta.dirname, '..');
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...RA1_TARGET_PATHSPECS], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const targets = listed.split('\0').filter(Boolean);
  assert.ok(targets.length > 0, 'RA-1 target enumeration returned nothing');
  for (const rel of targets) {
    const st = fs.lstatSync(path.join(root, rel));
    if (!st.isFile()) continue;
    assert.ok(
      st.size <= RA1_MAX_TARGET_BYTES,
      `${rel} is ${st.size} bytes, over the ${RA1_MAX_TARGET_BYTES}-byte RA-1 scan cap`
    );
  }
});

test('the RA-1 severity exclusion is case-sensitive, and that is load-bearing (#2050 doc 4)', () => {
  // The inventory's evidence is `grep -c blocker` = 0 on the prose SSoT, but
  // `grep -ic blocker` returns 1 for two of those files: they spell the
  // display form `Blocker`. A case-insensitive containsWord would let that
  // capitalized prose excuse a lowercase mapping table the SSoT never defines.
  const content = [
    '出典: `src/lib/finding-factory.mjs`',
    '',
    '| blocker | critical |',
    '| nit | minor |',
  ].join('\n');
  const capitalizedOnly = new Map([
    ['src/lib/finding-factory.mjs', 'Blocker → Critical / Nit → Minor\n'],
  ]);
  assert.equal(
    checkReviewJudgmentDuplication([{ path: '.claude/rules/x.md', content }], capitalizedOnly)
      .length,
    1
  );
});

// ---- loadSsotContents の読み取り前ガード（#2055 追補） ----
//
// `isContainedSsotPath` は path traversal を止めるが、`readFile` は symlink を辿る。
// 参照テキストは `.claude/**`（RA-1 の対象で fork PR から編集できる）に置け、参照先の
// symlink も同じ PR で commit できるため、両側とも攻撃者が決められる。
// ガード前の実測では `/dev/zero` への symlink 1 本あたり約 4.4 秒・RSS 250 MB 超を要し、
// `readFile(…, 'utf8')` の `Invalid string length` は空の catch に飲まれていた。
// 約 137 本で `Meta consistency` の `timeout-minutes: 10` を超える。
// 対策は `loadRuntimeAdapterFiles` と同じ `classifyTrackedTarget` を通すこと。

test('loadSsotContents: symlink の SSoT 参照は辿らない（#2055 追補）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ssot-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ssot-outside-'));
  try {
    fs.mkdirSync(path.join(dir, 'skills', 'adir'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'real.md'), 'REAL_SSOT_BODY\n');
    fs.writeFileSync(path.join(outside, 'secret.md'), 'OUTSIDE_SECRET_BODY\n');
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(dir, 'skills', 'outside.md'));
    fs.symlinkSync(path.join(dir, 'skills', 'adir'), path.join(dir, 'skills', 'dirlink.md'));

    const content = [
      '出典: `skills/real.md`',
      '出典: `skills/outside.md`',
      '出典: `skills/dirlink.md`',
    ].join('\n');
    const files = [{ path: '.claude/rules/x.md', content }];

    // 3 本とも containment は通る。違いは path ではなくファイルの種類にある。
    assert.deepEqual(findSsotReferences(content), [
      'skills/real.md',
      'skills/outside.md',
      'skills/dirlink.md',
    ]);

    const map = await loadSsotContents(files, dir);
    assert.deepEqual([...map.keys()], ['skills/real.md']);
    assert.match(map.get('skills/real.md'), /REAL_SSOT_BODY/);
    // repo 外の内容が 1 バイトでも入っていれば symlink を辿っている。
    for (const body of map.values()) {
      assert.doesNotMatch(body, /OUTSIDE_SECRET_BODY/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('loadSsotContents: RA1_MAX_TARGET_BYTES を超える SSoT 参照は読まない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ssot-big-'));
  try {
    fs.mkdirSync(path.join(dir, 'skills'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'big.md'), 'x'.repeat(RA1_MAX_TARGET_BYTES + 1));
    fs.writeFileSync(path.join(dir, 'skills', 'ok.md'), 'OK_BODY\n');
    const content = ['出典: `skills/big.md`', '出典: `skills/ok.md`'].join('\n');
    const map = await loadSsotContents([{ path: '.claude/rules/x.md', content }], dir);
    // 対照群（ok.md）は読まれ、上限超過だけが落ちる。
    assert.deepEqual([...map.keys()], ['skills/ok.md']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- checkPluginHooksScripts: convention-path hooks/hooks.json (#2117 minor) ---
// The Claude Code loader reads hooks/hooks.json without a manifest `hooks`
// field (and reports a manifest entry pointing at it as a duplicate), so the
// script-existence check must follow the convention path, not the declaration.
// Fixtures are built in a temp root so nothing here pins the real repository.

function makeHooksFixture({ hooksJson, scripts = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hooks-'));
  if (hooksJson !== undefined) {
    fs.mkdirSync(path.join(root, 'hooks'));
    fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), hooksJson);
  }
  for (const rel of scripts) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), '#!/bin/sh\n');
  }
  return root;
}

const HOOKS_JSON_TWO_SCRIPTS = JSON.stringify({
  hooks: {
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/a.sh"' }],
      },
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/b.sh"' }] }],
  },
});

test('checkPluginHooksScripts: convention path present, scripts exist → pass (no manifest hooks field)', async () => {
  const root = makeHooksFixture({
    hooksJson: HOOKS_JSON_TWO_SCRIPTS,
    scripts: ['scripts/a.sh', 'scripts/b.sh'],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, []);
});

test('checkPluginHooksScripts: convention path present, script missing → fail without a manifest hooks field', async () => {
  const root = makeHooksFixture({ hooksJson: HOOKS_JSON_TWO_SCRIPTS, scripts: ['scripts/a.sh'] });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, ['hooks/hooks.json: hook command target does not exist: scripts/b.sh']);
});

test('checkPluginHooksScripts: parses quoted paths and ignores line-end comments', async () => {
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  'bash "${CLAUDE_PLUGIN_ROOT}/scripts/a b.sh" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/日本語.sh" # ${CLAUDE_PLUGIN_ROOT}/../commented.sh',
              },
              { type: 'command', command: "bash '${CLAUDE_PLUGIN_ROOT}/scripts/single quoted.sh'" },
              { type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/has#hash.sh"' },
            ],
          },
        ],
      },
    }),
    scripts: [
      'scripts/a b.sh',
      'scripts/日本語.sh',
      'scripts/single quoted.sh',
      'scripts/has#hash.sh',
    ],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, []);
});

test('checkPluginHooksScripts: root references in arguments still undergo containment checks', async () => {
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  'bash "${CLAUDE_PLUGIN_ROOT}/scripts/a.sh" --reference "${CLAUDE_PLUGIN_ROOT}/../shared.sh"',
              },
            ],
          },
        ],
      },
    }),
    scripts: ['scripts/a.sh'],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, [
    'hooks/hooks.json: hook command target escapes plugin root: ../shared.sh',
  ]);
});

test('checkPluginHooksScripts: nonexistent root → no error, no throw', async () => {
  // The containment check resolves the real path of `root`; a root that was
  // never created must stay a no-op rather than throwing ENOENT (#2132).
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hooks-noroot-'));
  try {
    const errors = await checkPluginHooksScripts(makeCcManifest(), {
      root: path.join(parent, 'never-created'),
    });
    assert.deepEqual(errors, []);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('checkPluginHooksScripts: `#` inside a word does not end the scan', async () => {
  // `x#y` is a single shell word, not a comment. Treating every unquoted `#` as a
  // comment hid the rest of the command -- escapes included -- from the check.
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [{ type: 'command', command: 'echo x#y "${CLAUDE_PLUGIN_ROOT}/../outside.sh"' }],
          },
        ],
      },
    }),
    scripts: [],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, [
    'hooks/hooks.json: hook command target escapes plugin root: ../outside.sh',
  ]);
});

test('checkPluginHooksScripts: a comment ends at the newline, not at the command', async () => {
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo ok\n# note\nbash "${CLAUDE_PLUGIN_ROOT}/../outside.sh"',
              },
            ],
          },
        ],
      },
    }),
    scripts: [],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, [
    'hooks/hooks.json: hook command target escapes plugin root: ../outside.sh',
  ]);
});

test('checkPluginHooksScripts: a backslash-escaped space stays part of the path', async () => {
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/scripts/a\\ b.sh' }],
          },
        ],
      },
    }),
    scripts: ['scripts/a b.sh'],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, []);
});

test('checkPluginHooksScripts: an escaped quote outside a string does not open one', async () => {
  // `\\"` is a literal quote, so the command stays unquoted and the target ends at
  // the space. Without escape handling the parser would think a string had opened
  // and swallow the space, resolving a different -- existing -- path.
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [{ type: 'command', command: 'bash \\" ${CLAUDE_PLUGIN_ROOT}/scripts/a b.sh' }],
          },
        ],
      },
    }),
    scripts: ['scripts/a b.sh'],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, ['hooks/hooks.json: hook command target does not exist: scripts/a']);
});

test('checkPluginHooksScripts: `#` inside the path is part of the path', async () => {
  // `a.sh#suffix` is one shell token. Ending the path at the `#` resolved a
  // different -- existing -- file and let the real, missing target through.
  const root = makeHooksFixture({
    hooksJson: JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/scripts/a.sh#suffix' }],
          },
        ],
      },
    }),
    scripts: ['scripts/a.sh'],
  });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, [
    'hooks/hooks.json: hook command target does not exist: scripts/a.sh#suffix',
  ]);
});

test('checkPluginHooksScripts: command target outside plugin root → fail', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hooks-parent-'));
  const root = path.join(parent, 'plugin');
  try {
    fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'outside.sh'), '#!/bin/sh\n');
    fs.writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/../outside.sh"' }] },
          ],
        },
      })
    );
    const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
    assert.deepEqual(errors, [
      'hooks/hooks.json: hook command target escapes plugin root: ../outside.sh',
    ]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('checkPluginHooksScripts: nonexistent target outside plugin root → escape, not missing', async () => {
  // Pins the lexical containment check on its own. `realpath` cannot speak for a
  // target that does not exist, so only the `path.resolve` branch can classify
  // this as an escape; without it the message degrades to "does not exist".
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hooks-ghost-'));
  const root = path.join(parent, 'plugin');
  try {
    fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/../ghost.sh"' }] },
          ],
        },
      })
    );
    const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
    assert.deepEqual(errors, [
      'hooks/hooks.json: hook command target escapes plugin root: ../ghost.sh',
    ]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('checkPluginHooksScripts: symlinked command target outside plugin root → fail', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hooks-symlink-'));
  const root = path.join(parent, 'plugin');
  try {
    fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'outside.sh'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.symlinkSync(path.join(parent, 'outside.sh'), path.join(root, 'scripts', 'outside.sh'));
    fs.writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/outside.sh"' },
              ],
            },
          ],
        },
      })
    );
    const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
    assert.deepEqual(errors, [
      'hooks/hooks.json: hook command target escapes plugin root: scripts/outside.sh',
    ]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('checkPluginHooksScripts: no hooks/hooks.json → no-op', async () => {
  const root = makeHooksFixture({ scripts: ['scripts/a.sh'] });
  const errors = await checkPluginHooksScripts(makeCcManifest(), { root });
  assert.deepEqual(errors, []);
});

test('checkPluginHooksScripts: a declared path is checked in addition to the convention path, each file once', async () => {
  const root = makeHooksFixture({ hooksJson: HOOKS_JSON_TWO_SCRIPTS, scripts: ['scripts/a.sh'] });
  fs.mkdirSync(path.join(root, 'extra'));
  fs.writeFileSync(
    path.join(root, 'extra', 'more.json'),
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/scripts/c.sh"' }] }],
      },
    })
  );
  // Declaring the convention file itself must not double-report b.sh.
  const dup = await checkPluginHooksScripts(
    { ...makeCcManifest(), hooks: './hooks/hooks.json' },
    { root }
  );
  assert.deepEqual(dup, ['hooks/hooks.json: hook command target does not exist: scripts/b.sh']);
  const both = await checkPluginHooksScripts(
    { ...makeCcManifest(), hooks: ['./extra/more.json', './extra/more.json'] },
    { root }
  );
  assert.deepEqual(both, [
    'hooks/hooks.json: hook command target does not exist: scripts/b.sh',
    './extra/more.json: hook command target does not exist: scripts/c.sh',
  ]);
});
