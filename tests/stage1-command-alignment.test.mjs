// TC-13: ADR-016 段階 1（エージェントはマージしない）とコマンド記述の整合
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const releaseKick = read('.claude/commands/release-kick.md');
const mergeCheck = read('.claude/commands/merge-check.md');

const allowedTools = (md) => {
  const line = md.split('\n').find((l) => l.startsWith('allowed-tools:'));
  assert.ok(line, 'allowed-tools がない');
  return line;
};

const bashBlocks = (md) => [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

test('release-kick: allowed-tools に gh pr merge が無い', () => {
  assert.doesNotMatch(allowedTools(releaseKick), /gh pr merge/);
});

test('release-kick: bash ブロックで gh pr merge を実行しない', () => {
  for (const block of bashBlocks(releaseKick)) {
    assert.doesNotMatch(block, /^\s*gh pr merge\b/m);
  }
});

test('release-kick: マージは人間に依頼して止まると書いてある', () => {
  assert.match(releaseKick, /ADR-016/);
  assert.match(releaseKick, /人間に依頼/);
});

test('merge-check: allowed-tools に gh pr merge が無い', () => {
  assert.doesNotMatch(allowedTools(mergeCheck), /gh pr merge/);
});

test('merge-check: リスク階層を確認する Step がある', () => {
  assert.match(mergeCheck, /^### Step \d+\. リスク階層の確認/m);
  assert.match(mergeCheck, /016-repo-operation-risk-tiers\.md/);
});

test('merge-check: MERGE_OK でエージェントにマージへ進ませない', () => {
  assert.doesNotMatch(mergeCheck, /`gh pr merge` に進んでよい/);
  const mergeOk = mergeCheck.split('### A. MERGE_OK')[1].split('### B.')[0];
  assert.match(mergeOk, /人間/);
});
