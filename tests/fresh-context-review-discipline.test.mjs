import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readRepoFile = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const skill = readRepoFile('.claude/skills/river-review-discipline/SKILL.md');
const loop = readRepoFile('.claude/skills/river-review-discipline/river-review-loop.md');
const template = readRepoFile(
  '.claude/skills/river-review-discipline/templates/fresh-context-plan-review-template.md'
);

// 文書の連携不変条件を固定する。LLMの検出性能や独立subagentの実行は証明しない。
test('fresh-context design review is optional and uses a real template', () => {
  assert.match(skill, /Fresh Context Plan Review/);
  assert.match(skill, /templates\/fresh-context-plan-review-template\.md/);
  assert.match(skill, /任意/);
  assert.match(skill, /単純な低リスク修正へ追加のAgent・レビューラウンドを強制しない/);
  assert.match(loop, /2-bis\. Fresh Context Plan Review/);
  assert.match(loop, /小さな低リスク変更は適用不要/);
});

test('independence requires Host evidence and is unknown without provenance', () => {
  assert.match(skill, /Host証跡がなければ `unknown`/);
  assert.match(loop, /独立性 `unknown`/);
  assert.match(template, /独立性: `verified` \/ `unknown`/);
  assert.match(template, /Role名や自己申告では不可/);
  assert.match(template, /秘密情報・生の会話履歴は除外/);
});

test('advisory review cannot promote absent findings into approval', () => {
  assert.match(loop, /production runtimeやGateには接続しない/);
  assert.match(template, /未実行時はincomplete/);
  assert.match(template, /Coverage完了・正しさ・承認・Gate PASSの証明ではない/);
  assert.match(template, /Review Coverage/);
  assert.match(template, /complete/);
  assert.match(template, /partial/);
  assert.match(template, /not_executed/);
});

test('review scope guards false positives and untrusted document instructions', () => {
  assert.match(template, /明示的なNon-goals・次フェーズ/);
  assert.match(template, /実装者に委ねられた局所詳細/);
  assert.match(template, /既存レビューと重複する指摘/);
  assert.match(template, /未信頼データ/);
  assert.match(loop, /Reviewerはread-only/);
});
