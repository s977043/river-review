// Paired adapter conformance for the review Flow entry (#2054 PR-5, Epic #2011
// AC5 / AC7; Promotion Gate "deterministic conformance").
//
// Two host adapters now hand an entry name to `river review plan --entry`:
//
//   - Claude Code: hooks/hooks.json `Stop` -> scripts/plugin-task-checkpoint-hook.sh,
//     which names the entry in ONE shell assignment (`ENTRY="review-task"`);
//   - GitHub Action: runners/github-action/action.yml `entry` input, forwarded
//     verbatim through `INPUT_ENTRY`.
//
// The fixture under tests/fixtures/adapter-entry/ is one paired observation:
// the entry each adapter carries is read from the adapter's real surface (not
// from the fixture), resolved through the single Flow reader, and the two pins
// must be identical to each other and to what the trigger resolver derives for
// the neutral trigger. `expected` is hand-authored from flows/ so the test is
// not self-consistent with the loader (#1656).
//
// This is a resolver / loader comparison, not a live-runtime capture: the
// cross-runtime kit (tests/cross-runtime-conformance.test.mjs) keeps the
// `claude` / `codex` runtime vocabulary closed, so the Action pairing lives
// here rather than in that schema.
//
// ADR-009 D3 (RA-1..RA-4): both adapter surfaces are also scanned for review
// judgment vocabulary — an adapter may carry an entry name and nothing else.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFlowRegistry, resolveFlowEntry } from '../src/lib/flow-loader.mjs';
import { resolveTrigger } from '../src/lib/trigger-resolver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURES_DIR = path.join(HERE, 'fixtures', 'adapter-entry');

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const fixtures = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((file) => ({
    file,
    record: JSON.parse(read(path.join('tests/fixtures/adapter-entry', file))),
  }));

/** The entry name the Claude Code Stop hook carries, read from the script itself. */
function entryCarriedByHookScript(scriptSource) {
  const matches = [...scriptSource.matchAll(/^ENTRY="([^"]+)"$/gm)].map((m) => m[1]);
  assert.equal(matches.length, 1, 'the hook script must assign ENTRY exactly once');
  return matches[0];
}

/** Judgment vocabulary an adapter must not carry (ADR-009 D3). */
const JUDGMENT_TOKENS = [
  /\bNO_GO\b/,
  /\bGO_WITH_OBSERVATION\b/,
  /\bESCALATE\b/,
  /\bblocker\b/i,
  /\bcritical\b/i,
  /\bseverity\b/i,
  /\bthreshold\b/i,
];

/** The composite step's `run:` block of action.yml, verbatim (with indentation). */
function runBlockOf(actionYml) {
  const block = /      run: \|\n((?:        .*\n|\n)+?)\n    # Both comment steps/.exec(
    actionYml
  )?.[1];
  assert.ok(block, 'run block not found');
  return block;
}

/**
 * Known legacy lines of the run block that mention the `gate` input's exit
 * semantics (Epic #1347 S4, before the entry path existed). Exact text: any
 * edit to these lines drops them out of the allowlist and back into the scan.
 */
const RUN_BLOCK_ALLOWLIST = new Set([
  '# Epic #1347 S4: opt-in gate enforcement. --gate makes NO_GO/ESCALATE a',
  '# end, so a --gate NO_GO/ESCALATE still fails the job.',
]);

/** Lines of a run block that carry judgment vocabulary, minus the allowlist. */
function judgmentHits(runBlock) {
  const hits = [];
  for (const raw of runBlock.split('\n')) {
    const line = raw.trim();
    if (RUN_BLOCK_ALLOWLIST.has(line)) continue;
    const tokens = JUDGMENT_TOKENS.filter((t) => t.test(line)).map(String);
    if (tokens.length > 0) hits.push({ line, tokens });
  }
  return hits;
}

describe('paired adapter conformance for --entry (#2054 PR-5)', () => {
  test('the paired fixture set is not empty', () => {
    assert.ok(fixtures.length > 0);
  });

  for (const { file, record } of fixtures) {
    describe(file, () => {
      const hooks = JSON.parse(read(record.adapters.claude.hooksFile));
      const hookScriptRel = record.adapters.claude.surface;
      const hookScript = read(hookScriptRel);
      const actionYml = read(record.adapters['github-action'].surface);

      test('Claude Code: hooks.json wires the event to the checkpoint script', () => {
        const event = hooks.hooks[record.adapters.claude.event];
        assert.ok(Array.isArray(event), `hooks.json has no ${record.adapters.claude.event} hooks`);
        const commands = event.flatMap((m) => m.hooks ?? []).map((h) => h.command ?? '');
        assert.ok(
          commands.some((c) => c.includes(path.basename(hookScriptRel))),
          `no ${record.adapters.claude.event} hook runs ${hookScriptRel}: ${JSON.stringify(commands)}`
        );
      });

      test('GitHub Action: the entry input is forwarded verbatim, never rewritten', () => {
        const input = record.adapters['github-action'].input;
        assert.match(
          actionYml,
          new RegExp(`^  ${input}:\\n`, 'm'),
          `action.yml declares no ${input} input`
        );
        assert.match(actionYml, /INPUT_ENTRY: \$\{\{ inputs\.entry \}\}/);
        assert.match(actionYml, /--entry "\$\{INPUT_ENTRY\}"/);
        // The default keeps the `run` path: an empty entry never reaches --entry.
        assert.match(actionYml, /if \[ -n "\$\{INPUT_ENTRY\}" \]; then/);
      });

      test('both adapters resolve to the same Flow pin, and to what the trigger resolver derives', () => {
        const claudeEntry = entryCarriedByHookScript(hookScript);
        // The Action forwards its input verbatim, so the entry it carries is the
        // one the workflow author names — the fixture's, for this pairing.
        const actionEntry = record.entry;
        assert.equal(
          claudeEntry,
          record.entry,
          'the hook script names a different entry than the fixture'
        );

        const claudePin = resolveFlowEntry(claudeEntry).flow;
        const actionPin = resolveFlowEntry(actionEntry).flow;
        assert.deepEqual(claudePin, actionPin);

        const { registry, flowDocuments } = loadFlowRegistry();
        const resolution = resolveTrigger({ event: record.trigger }, { registry, flowDocuments });
        assert.deepEqual(resolution.flowPins, [claudePin]);
        assert.deepEqual(resolution.evidenceRequirements, record.expected.evidenceRequirements);

        // Hand-authored expectation from flows/ (not from the loader).
        assert.equal(claudePin.entry, record.entry);
        assert.equal(claudePin.id, record.expected.flow);
        assert.equal(claudePin.version, record.expected.flowVersion);
        assert.match(claudePin.sha256, /^[0-9a-f]{64}$/);
        assert.deepEqual(
          resolveFlowEntry(claudeEntry).evidenceRequirements,
          record.expected.evidenceRequirements
        );
      });

      test('GitHub Action: with entry set, --gate / --dry-run / --estimate / --max-cost are not assembled; without it the run line is unchanged', () => {
        // Render the composite step's `run:` block with every input at its
        // "most forwarding" value (gate=true, dry_run=true, estimate=true,
        // max_cost set) and execute it up to the `Running:` echo only.
        const body = /      run: \|\n((?:        .*\n|\n)+?)\n    # Both comment steps/.exec(
          actionYml
        )?.[1];
        assert.ok(body, 'run block not found');
        const inputs = {
          phase: 'midstream',
          planner: 'off',
          target: '.',
          comment: 'true',
          inline_comments: 'false',
          dry_run: 'true',
          debug: 'false',
          estimate: 'true',
          max_cost: '1.00',
          gate: 'true',
        };
        const script = body
          .split('\n')
          .map((l) => l.slice(8))
          .join('\n')
          .replace(/\$\{\{ inputs\.(\w+) \}\}/g, (_, k) => inputs[k])
          .replace(/echo "Running: \$\{cmd\[\*\]\}"[\s\S]*$/, 'echo "Running: ${cmd[*]}"\n');
        const render = (entry, outputFormat = 'markdown') => {
          const out = execFileSync('bash', ['-c', script], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            env: {
              ...process.env,
              RIVER_REPO_ROOT: REPO_ROOT,
              RIVER_OUTPUT_FORMAT: outputFormat,
              INPUT_DETERMINISTIC_EXEC: 'false',
              INPUT_TRUSTED_TREE: '',
              INPUT_ENTRY: entry,
              GITHUB_ACTION_PATH: path.join(REPO_ROOT, 'runners', 'github-action'),
            },
          });
          return out;
        };
        const runLine = (entry, outputFormat) =>
          /^Running: (.*)$/m.exec(render(entry, outputFormat))?.[1] ?? '';
        const withEntry = runLine('review-task');
        assert.match(
          withEntry,
          / review plan \S+ --plan-only --entry review-task --phase midstream --output markdown$/
        );
        for (const flag of ['--gate', '--dry-run', '--estimate', '--max-cost']) {
          assert.ok(!withEntry.includes(flag), `${flag} forwarded on the entry path: ${withEntry}`);
        }
        // F2: with the default output_format (text) the entry path emits json,
        // so `comment_path` is never set — the comment steps must therefore be
        // skipped on `inputs.entry` (pinned in the next test), not on the format.
        assert.match(runLine('review-task', 'text'), / --output json$/);
        const withoutEntry = runLine('');
        assert.match(
          withoutEntry,
          / run \S+ --phase midstream --planner off --output markdown --dry-run --estimate --max-cost 1\.00 --gate$/
        );
        // #2119: the dropped inputs are named in ONE ::notice line on the entry
        // path (same shape as the deterministic_exec ::warning), never on the
        // run path — and the notice itself carries no judgment vocabulary.
        const noticeLines = (out) => out.split('\n').filter((l) => l.startsWith('::notice::'));
        const entryNotices = noticeLines(render('review-task'));
        assert.equal(entryNotices.length, 1, entryNotices.join('\n'));
        for (const name of ['gate', 'dry_run', 'estimate', 'max_cost', 'comment']) {
          assert.match(
            entryNotices[0],
            new RegExp(`\\b${name}\\b`),
            `notice does not name ${name}`
          );
        }
        assert.doesNotMatch(
          entryNotices[0],
          /\binline_comments\b/,
          'inline_comments=false must not be listed'
        );
        for (const token of JUDGMENT_TOKENS) assert.doesNotMatch(entryNotices[0], token);
        assert.deepEqual(noticeLines(render('')), [], 'the run path must stay silent');
      });

      test('GitHub Action: both comment steps are skipped when entry is set', () => {
        const conditions = [
          ...actionYml.matchAll(
            /^    - name: Post (?:PR comment|inline review comments)\n      if: (.*)$/gm
          ),
        ].map((m) => m[1]);
        assert.equal(conditions.length, 2);
        for (const condition of conditions) assert.match(condition, /inputs\.entry == ''/);
      });

      test('neither adapter surface carries review judgment vocabulary (ADR-009 D3)', () => {
        for (const token of JUDGMENT_TOKENS) {
          assert.doesNotMatch(hookScript, token, `${hookScriptRel} carries ${token}`);
        }
        const entryInput = /^  entry:\n(?:    .*\n)+/m.exec(actionYml)?.[0] ?? '';
        assert.ok(entryInput.length > 0, 'entry input block not found');
        for (const token of JUDGMENT_TOKENS) {
          assert.doesNotMatch(entryInput, token, `entry input description carries ${token}`);
        }
        // #2119: the whole `run:` block is scanned (not only the entry branch),
        // so a token added to a shared line — exit-code capture, the
        // comment-step wiring — is caught too. The `gate` input predates the
        // entry path and is documented in two comment lines; those are the
        // explicit allowlist, matched by exact text so a rewrite re-enters the scan.
        assert.deepEqual(judgmentHits(runBlockOf(actionYml)), []);
      });

      test('the run-block scan itself works: an injected fake line is reported', () => {
        const injected = runBlockOf(actionYml).replace(
          'echo "Running: ${cmd[*]}"',
          'echo "Running: ${cmd[*]}"\n        if [ "${rc}" -eq 1 ]; then echo "NO_GO: blocker above threshold"; fi'
        );
        assert.notEqual(injected, runBlockOf(actionYml), 'injection point not found');
        assert.deepEqual(judgmentHits(injected), [
          {
            line: 'if [ "${rc}" -eq 1 ]; then echo "NO_GO: blocker above threshold"; fi',
            tokens: ['/\\bNO_GO\\b/', '/\\bblocker\\b/i', '/\\bthreshold\\b/i'],
          },
        ]);
      });
    });
  }

  test('every trigger that resolves to entries pins the same Flow through the Action input as through the resolver', () => {
    const { registry, flowDocuments } = loadFlowRegistry();
    let compared = 0;
    for (const [event, trigger] of Object.entries(registry.triggers)) {
      if (trigger.selectBy === 'artifactKind' || (trigger.entries ?? []).length === 0) continue;
      const resolution = resolveTrigger({ event }, { registry, flowDocuments });
      const viaAction = resolution.selectedEntries.map((entry) => resolveFlowEntry(entry).flow);
      assert.deepEqual(viaAction, resolution.flowPins, event);
      compared += 1;
    }
    assert.ok(
      compared >= 3,
      `expected task-checkpoint / before-publish / before-merge, compared ${compared}`
    );
  });
});
