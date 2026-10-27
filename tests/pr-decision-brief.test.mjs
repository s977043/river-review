import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const templates = [
  '.github/PULL_REQUEST_TEMPLATE/feature.md',
  '.github/PULL_REQUEST_TEMPLATE/bugfix.md',
  '.github/pull_request_template.md',
];

function getBrief(markdown, label) {
  const marker = '## Reviewer Decision Brief\n';
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, label + ': decision brief heading missing');
  const next = markdown.indexOf('\n## ', start + marker.length);
  assert.notEqual(next, -1, label + ': following section missing');
  return markdown.slice(start + marker.length, next);
}

function verifyBrief(brief) {
  const questions = [...brief.matchAll(/^(\d+)\. \*\*([^*\n]+):\*\* ([^\n]+)$/gm)].map(
    ([, number, topic, prompt]) => ({ number: Number(number), topic, prompt })
  );
  assert.deepEqual(
    questions.map(({ number, topic }) => [number, topic]),
    [
      [1, 'Hard-to-reverse decisions'],
      [2, 'Assumptions and failure paths'],
      [3, "Reviewer's first challenge"],
    ]
  );
  assert.match(questions[0].prompt, /rollback|roll back|mitigat/i);
  assert.match(questions[1].prompt, /unknown/i);
  assert.match(questions[1].prompt, /test|evidence|observation/i);
  assert.match(questions[2].prompt, /link|diff|file|evidence/i);
  assert.match(brief, /N\/A[^\n]*reason/i);
  assert.match(brief, /does not prove|not [a-z ]*evidence/i);
}

for (const templatePath of templates) {
  test(templatePath + ': independently test all review decisions', () => {
    const markdown = readFileSync(new URL('../' + templatePath, import.meta.url), 'utf8');
    verifyBrief(getBrief(markdown, templatePath));
  });
}

test('invalid first question: rollback language cannot hide elsewhere', () => {
  const first = '1. **Hard-to-reverse decisions:** What will change?';
  const brief = validBrief().replace(/^1\. .*$/m, first);
  assert.throws(() => verifyBrief(brief), /rollback|roll back|mitigat/i);
});

test('invalid second question: unknown elsewhere cannot replace uncertainty', () => {
  const second = '2. **Assumptions and failure paths:** Which tests cover failure?';
  const brief = validBrief().replace(/^2\. .*$/m, second);
  assert.throws(() => verifyBrief(brief), /unknown/i);
});

test('invalid third question: links elsewhere cannot replace reviewer focus', () => {
  const third = "3. **Reviewer's first challenge:** What should we review?";
  const brief = validBrief().replace(/^3\. .*$/m, third);
  assert.throws(() => verifyBrief(brief), /link|diff|file|evidence/i);
});

test('invalid numbering: a duplicate question cannot masquerade as three', () => {
  const brief = validBrief().replace(/^3\./m, '2.');
  assert.throws(() => verifyBrief(brief));
});

function validBrief() {
  return [
    'Use N/A with a reason for small changes; unknowns must remain explicit.',
    '1. **Hard-to-reverse decisions:** What is the rollback or mitigation plan?',
    '2. **Assumptions and failure paths:** Which tests prove this? Mark missing data unknown.',
    "3. **Reviewer's first challenge:** Link a diff or file for scrutiny.",
    'This does not prove independent review.',
  ].join('\n');
}
