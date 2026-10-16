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
  'grep -rn secret src/',
  'rg -l secret .',
  `echo "cat ${F}"`,
  `cat README.md > ${F}.bak`,
  'cat package.json',
  'git show HEAD --stat',
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
