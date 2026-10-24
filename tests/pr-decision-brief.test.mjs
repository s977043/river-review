import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const templates = ['feature.md', 'bugfix.md'];

function readDecisionBrief(templateName) {
  const template = readFileSync(
    new URL(`../.github/PULL_REQUEST_TEMPLATE/${templateName}`, import.meta.url),
    'utf8'
  );
  const start = template.indexOf('## Reviewer Decision Brief\n');
  assert.notEqual(start, -1, `${templateName}: decision brief heading missing`);
  const nextSection = template.indexOf('\n## ', start + 1);
  assert.notEqual(nextSection, -1, `${templateName}: original sections missing`);
  return template.slice(start, nextSection);
}

for (const templateName of templates) {
  test(`${templateName} asks three evidence-aware, risk-proportionate questions`, () => {
    const brief = readDecisionBrief(templateName);
    const numberedQuestions = brief.match(/^\d\. \*\*/gm) ?? [];
    assert.equal(numberedQuestions.length, 3);
    assert.match(brief, /Hard-to-reverse decisions/i);
    assert.match(brief, /Assumptions and failure paths/i);
    assert.match(brief, /Reviewer's first challenge/i);
    assert.match(brief, /N\/A/);
    assert.match(brief, /unknown/);
    assert.match(brief, /rollback|mitigation/i);
    assert.match(brief, /does not prove independent/i);
  });
}
