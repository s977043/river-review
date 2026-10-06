import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkSkillVersionBump,
  isVersionBumped,
  packageDirsFromPaths,
} from '../scripts/check-skill-version-bump.mjs';
import { listSkillPackageDirs } from '../runners/core/skill-loader.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'skills/midstream/sample-skill';
const AGENT = 'skills/agent-skills/sample-router';

function skillMd({ version = '0.1.0', severity = 'major', body }) {
  return `---\nid: sample-skill\nname: Sample\ndescription: d\nversion: ${version}\ncategory: midstream\nphase: midstream\napplyTo: ['src/**']\nseverity: ${severity}\n---\n\n${body}`;
}

const BASE_BODY = [
  '## Origin / 由来',
  '',
  'inspired by an article.',
  '',
  '## Rule / ルール',
  '',
  '- Flag `foo()` calls without a timeout.',
  '',
  '外部実証: an external report.',
  '',
  '```ts',
  'const x = { a: 1 };',
  '```',
  '',
].join('\n');

const tmpDirs = [];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function write(cwd, files) {
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(cwd, rel), { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), content);
  }
}

/** Temp repo with a `base` commit and a `head` commit applying `changes`. */
function fixture(changes, baseFiles = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'rr-skill-ver-'));
  tmpDirs.push(cwd);
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 't@example.com');
  git(cwd, 'config', 'user.name', 't');
  write(cwd, {
    [`${SKILL}/SKILL.md`]: skillMd({ body: BASE_BODY }),
    [`${SKILL}/prompt/system.md`]: 'You review timeouts.\n',
    [`${SKILL}/fixtures/case.md`]: 'fixture\n',
    [`${AGENT}/SKILL.md`]: skillMd({ body: '## Routing\n\nRoute to sample-skill.\n' }),
    ...baseFiles,
  });
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  git(cwd, 'branch', 'base');
  write(cwd, changes);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'head');
  return cwd;
}

async function run(changes, baseFiles) {
  return checkSkillVersionBump({ base: 'base', head: 'HEAD', cwd: fixture(changes, baseFiles) });
}

describe('check-skill-version-bump', () => {
  after(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  test('criteria change with a version bump passes', async () => {
    const r = await run({
      [`${SKILL}/SKILL.md`]: skillMd({
        version: '0.2.0',
        body: BASE_BODY.replace('without a timeout', 'without a timeout or retry cap'),
      }),
    });
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.checked, [SKILL]);
  });

  test('criteria change without a bump fails and names the section', async () => {
    const r = await run({
      [`${SKILL}/SKILL.md`]: skillMd({
        body: BASE_BODY.replace('without a timeout', 'without a timeout or retry cap'),
      }),
    });
    assert.equal(r.violations.length, 1);
    assert.equal(r.violations[0].id, 'sample-skill');
    assert.deepEqual(r.violations[0].changed, ['instruction § Rule / ルール']);
  });

  test('prompt file, severity, and version decrease count as unbumped criteria changes', async () => {
    const r = await run({
      [`${SKILL}/SKILL.md`]: skillMd({ version: '0.0.9', severity: 'minor', body: BASE_BODY }),
      [`${SKILL}/prompt/system.md`]: 'You review timeouts and retries.\n',
    });
    assert.equal(r.violations.length, 1);
    assert.deepEqual(r.violations[0].changed, ['frontmatter severity', 'prompt/system.md']);
  });

  test('formatting-only rewrite passes', async () => {
    const reformatted = BASE_BODY.replace('- Flag', '* Flag')
      .replace('const x = { a: 1 };', 'const x = {a:1}')
      .replace('inspired by an article.', 'inspired by an article.   ');
    const r = await run({ [`${SKILL}/SKILL.md`]: skillMd({ body: `${reformatted}\n\n\n` }) });
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.checked, [SKILL]);
  });

  test('edits confined to excluded sections and paragraphs pass', async () => {
    const body = BASE_BODY.replace('inspired by an article.', 'inspired by two articles.')
      .replace('外部実証: an external report.', '外部実証: an updated external report.')
      .concat('\n## References\n\n- https://example.com\n');
    const r = await run({ [`${SKILL}/SKILL.md`]: skillMd({ body }) });
    assert.deepEqual(r.violations, []);
  });

  test('excluded headings match exactly, not by prefix', async () => {
    const r = await run({
      [`${SKILL}/SKILL.md`]: skillMd({
        body: `${BASE_BODY}\n## References and scoring\n\n- Score 3 when foo() lacks a timeout.\n`,
      }),
    });
    assert.equal(r.violations.length, 1);
    assert.deepEqual(r.violations[0].changed, ['instruction § References and scoring']);
  });

  const VIEWPOINTS = 'viewpoints:\n  - id: timeout\n    obligation: Check foo() timeouts.\n';
  const VIEWPOINTS_CHANGED =
    'viewpoints:\n  - id: timeout\n    obligation: Check foo() timeouts and retries.\n';

  test('references/viewpoints.yaml change without a bump fails', async () => {
    const r = await run(
      { [`${SKILL}/references/viewpoints.yaml`]: VIEWPOINTS_CHANGED },
      { [`${SKILL}/references/viewpoints.yaml`]: VIEWPOINTS }
    );
    assert.equal(r.violations.length, 1);
    assert.deepEqual(r.violations[0].changed, ['references/viewpoints.yaml']);
  });

  test('references/viewpoints.yaml change with a bump passes', async () => {
    const r = await run(
      {
        [`${SKILL}/references/viewpoints.yaml`]: VIEWPOINTS_CHANGED,
        [`${SKILL}/SKILL.md`]: skillMd({ version: '0.1.1', body: BASE_BODY }),
      },
      { [`${SKILL}/references/viewpoints.yaml`]: VIEWPOINTS }
    );
    assert.deepEqual(r.violations, []);
  });

  test('references/viewpoints.yaml layout or comment change passes', async () => {
    const r = await run(
      {
        [`${SKILL}/references/viewpoints.yaml`]: `# catalog\nviewpoints:\n  -   id: timeout\n      obligation: 'Check foo() timeouts.'\n`,
      },
      { [`${SKILL}/references/viewpoints.yaml`]: VIEWPOINTS }
    );
    assert.deepEqual(r.violations, []);
  });

  test('non-criteria files (fixtures) pass', async () => {
    const r = await run({ [`${SKILL}/fixtures/case.md`]: 'fixture v2\n' });
    assert.deepEqual(r.violations, []);
  });

  test('routing agent-skill change passes without a bump', async () => {
    const r = await run({
      [`${AGENT}/SKILL.md`]: skillMd({ body: '## Routing\n\nRoute to other-skill.\n' }),
    });
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.checked, []);
  });

  test('added and removed skills pass', async () => {
    const r = await run(
      {
        'skills/midstream/new-skill/SKILL.md': skillMd({ body: '## Rule\n\nnew\n' }),
        'skills/midstream/old-skill': null,
      },
      { 'skills/midstream/old-skill/SKILL.md': skillMd({ body: '## Rule\n\nold\n' }) }
    );
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.checked, []);
  });

  test('isVersionBumped requires a valid, strictly greater x.y.z', () => {
    assert.equal(isVersionBumped('0.1.0', '0.1.1'), true);
    assert.equal(isVersionBumped('0.9.0', '0.10.0'), true);
    assert.equal(isVersionBumped('0.1.0', '0.1.0'), false);
    assert.equal(isVersionBumped('0.2.0', '0.1.9'), false);
    assert.equal(isVersionBumped(null, '0.1.0'), true);
    assert.equal(isVersionBumped('0.1.0', null), false);
  });

  // packageDirsFromPaths re-states listSkillPackageDirs over a git ref; pin the
  // two to the same answer on the real skills/ tree.
  test('package discovery matches listSkillPackageDirs on the repository', async () => {
    const tracked = git(REPO_ROOT, 'ls-files', 'skills').split('\n');
    const fromGit = packageDirsFromPaths(tracked);
    const fromFs = (await listSkillPackageDirs(join(REPO_ROOT, 'skills')))
      .map((d) => d.slice(REPO_ROOT.length + 1).replaceAll('\\', '/'))
      .sort();
    assert.deepEqual(fromGit, fromFs);
  });
});
