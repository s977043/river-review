import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// .claude/hooks/denied-read-guard.sh (PreToolUse hook) を実プロセス実行で検証する。
// exit 0 = 通過 / exit 2 = ブロック。
const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.claude',
  'hooks',
  'denied-read-guard.sh'
);

function runHook(command) {
  const res = spawnSyncGuarded('bash', [HOOK], {
    input: JSON.stringify({
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    env: { ...process.env, HARNESS_EVENTS_PATH: '/dev/null' },
  });
  return { status: res.status, stderr: res.stderr };
}

const F = 'src/lib/secret-redactor.mjs';

const BLOCKED = [
  `cat ${F}`,
  `/bin/cat ${F}`,
  `cat "${F}"`,
  `head -n 20 ${F}`,
  `tail -5 ${F}`,
  `less ${F}`,
  `more ${F}`,
  `sed -n 1,50p ${F}`,
  `sed -e 's/a/b/' ${F}`,
  `awk 'NR<10' ${F}`,
  `grep -n redact ${F}`,
  `grep -rn -e redact ${F}`,
  `rg redact ${F}`,
  `git show HEAD:${F}`,
  `git show origin/main:${F}`,
  `git -C /repo show abc123:${F}`,
  `git cat-file -p HEAD:${F}`,
  `git diff origin/main -- ${F}`,
  'cat secrets/token.txt',
  `wc -l < ${F}`,
  `cat ${F} | head`,
  `git status && cat ${F}`,
  `echo $(cat ${F})`,
  // 免除語（--stat / 注釈 / 別セグメントの許可コマンド）を混ぜても止まり続けること
  `git diff --stat; cat ${F}`,
  `cat ${F} # --stat`,
  `ls ${F} && sed -n 1,9p ${F}`,
  `git diff --stat -- ${F} | cat ${F}`,
  // 再帰検索はパターン・対象のどちらに含まれても止める（除外指定が無い限り）
  'grep -rn secret src/',
  'grep -R secret .',
  'grep --recursive secret src/',
  'rg -l secret .',
  'git grep secret',
  `git grep -n redact -- ${F}`,
  // stat 系の免除は -p / --patch / -u と併用されたら無効
  `git diff --stat -p origin/main -- ${F}`,
  `git diff --name-only --patch -- ${F}`,
  `git show --stat -u HEAD -- ${F}`,
  // 先頭のラッパー・制御構文を剥がしてから動詞を判定する
  `if true; then cat ${F}; fi`,
  `{ cat ${F}; }`,
  `! cat ${F}`,
  `nice cat ${F}`,
  `nice -n 5 cat ${F}`,
  `timeout 5 cat ${F}`,
  `for f in a; do cat ${F}; done`,
  'echo p | xargs cat src/x-secret',
  // 追加の読み取り動詞
  `jq . ${F}`,
  `perl -ne print ${F}`,
  `paste ${F}`,
  `fold ${F}`,
  `tr a b ${F}`,
  `git blame ${F}`,
];

const ALLOWED = [
  `git diff --stat origin/main -- ${F}`,
  `git diff --name-only origin/main -- ${F}`,
  `git log --oneline -- ${F}`,
  `ls src/lib/ ${F}`,
  'gh pr diff 2691 --name-only',
  'node --test tests/secret-redactor.test.mjs',
  `git add ${F}`,
  'git commit -m "fix: harden secret redactor"',
  `echo "cat ${F}"`,
  `cat README.md > ${F}.bak`,
  'cat package.json',
  'git show HEAD --stat',
  `git show --name-only abc123 -- ${F}`,
  `git show --stat abc123 -- ${F}`,
  'grep -rn --exclude=*secret* redact src/',
  "rg -g '!*secret*' secret .",
  'git commit -m "fix secret redaction"',
  'git diff --stat origin/main..HEAD',
  'cat README.md | grep secret',
  `if true; then ls ${F}; fi`,
  `timeout 5 node --test tests/secret-redactor.test.mjs`,
];

for (const command of BLOCKED) {
  test(`blocks: ${command}`, () => {
    const { status, stderr } = runHook(command);
    assert.equal(status, 2, stderr);
    assert.match(stderr, /denied by settings/);
    assert.match(stderr, /organizer/);
  });
}

for (const command of ALLOWED) {
  test(`allows: ${command}`, () => {
    const { status, stderr } = runHook(command);
    assert.equal(status, 0, stderr);
  });
}

test('allows a payload without a command', () => {
  const res = spawnSyncGuarded('bash', [HOOK], { input: '{}', encoding: 'utf8' });
  assert.equal(res.status, 0);
});
