import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const workflow = fs.readFileSync(
  path.join(REPO_ROOT, '.github', 'workflows', 'river-review.yml'),
  'utf8'
);

function actionStepWith() {
  const block =
    /- name: Run River Review \(midstream\)\n\s+uses: \.\/runners\/github-action\n\s+with:\n((?:          .*\n)+)/.exec(
      workflow
    )?.[1];
  assert.ok(block, 'River Review action step with: block not found');
  return block;
}

test('self-review workflow stays label opt-in (#2396)', () => {
  assert.match(
    workflow,
    /contains\(github\.event\.pull_request\.labels\.\*\.name, 'river-review'\)/
  );
});

test('self-review workflow passes reviewers: auto to the Action (#2396)', () => {
  assert.match(actionStepWith(), /^ {10}reviewers: auto$/m);
});

test('self-review workflow keeps the gate advisory and coverage gate unset (#2396)', () => {
  assert.match(actionStepWith(), /^ {10}gate: false\b/m);
  assert.doesNotMatch(workflow, /RIVER_GATE_COVERAGE/);
});

test('self-review workflow keeps uploading the run record artifact (#2396)', () => {
  const upload =
    /- name: Upload review run debug JSON\n((?:        .*\n?)+)/.exec(workflow)?.[1] ?? '';
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /uses: actions\/upload-artifact@/);
  assert.match(upload, /path: \.river\/runs\/\*\.json/);
});

test('self-review checkout never persists git credentials (#2806)', () => {
  const checkout =
    /- name: Checkout\n\s+uses: actions\/checkout@[^\n]+\n\s+with:\n((?: {10}[^\n]*\n)+)/.exec(
      workflow
    )?.[1];
  assert.ok(checkout, 'Checkout with: block not found');
  assert.match(checkout, /^ {10}fetch-depth: 0$/m);
  assert.match(checkout, /^ {10}persist-credentials: false$/m);
});

test('self-review workflow grants only required token permissions (#2806)', () => {
  const permissions = /^permissions:\n((?: {2}[^\n]+\n)+)/m.exec(workflow)?.[1];
  assert.equal(
    permissions,
    '  contents: read\n  pull-requests: write\n',
    'Checkout needs contents: read; PR comments need pull-requests: write'
  );
});
