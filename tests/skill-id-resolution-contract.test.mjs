import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveSkillId,
  SkillIdResolutionError,
} from '../src/lib/skill-id-resolver.mjs';

async function makeRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rr-skill-id-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeSkill(root, relativePath, frontmatter) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `---\n${frontmatter}\n---\n\n# Skill\n`, 'utf8');
  return target;
}

test('resolves exact IDs across agent and native Review Skill roots', async (t) => {
  const root = await makeRoot(t);
  const agent = await writeSkill(
    root,
    'skills/agent-skills/river-review-code/SKILL.md',
    'id: river-review-code\nname: river-review-code\ndescription: entry'
  );
  const review = await writeSkill(
    root,
    'skills/midstream/nullability-contract/SKILL.md',
    'id: nullability-contract\nname: nullability-contract\ndescription: owner'
  );

  assert.deepEqual(await resolveSkillId(root, 'river-review-code'), {
    id: 'river-review-code',
    path: agent,
    source: 'agent',
  });
  assert.deepEqual(await resolveSkillId(root, 'nullability-contract'), {
    id: 'nullability-contract',
    path: review,
    source: 'review',
  });
});

test('rejects path-like IDs instead of sanitizing them', async (t) => {
  const root = await makeRoot(t);
  for (const id of ['../nullability-contract', 'midstream/nullability-contract', 'skill id']) {
    await assert.rejects(
      () => resolveSkillId(root, id),
      (err) => err instanceof SkillIdResolutionError && /Unsafe skill ID/.test(err.message)
    );
  }
});

test('fails closed when the same exact ID is declared by multiple source packages', async (t) => {
  const root = await makeRoot(t);
  await writeSkill(
    root,
    'skills/agent-skills/shared/SKILL.md',
    'id: shared\nname: shared\ndescription: agent'
  );
  await writeSkill(
    root,
    'skills/midstream/shared/SKILL.md',
    'id: shared\nname: shared\ndescription: review'
  );

  await assert.rejects(
    () => resolveSkillId(root, 'shared'),
    (err) => err instanceof SkillIdResolutionError && /Ambiguous skill ID/.test(err.message)
  );
});

test('resolves exported sibling package by metadata.rr.id', async (t) => {
  const root = await makeRoot(t);
  const exported = await writeSkill(
    root,
    'nullability-contract/SKILL.md',
    [
      'name: nullability-contract',
      'description: exported owner',
      'metadata:',
      '  rr:',
      '    id: nullability-contract',
    ].join('\n')
  );

  assert.deepEqual(await resolveSkillId(root, 'nullability-contract'), {
    id: 'nullability-contract',
    path: exported,
    source: 'exported',
  });
});

test('rejects an exported package whose declared ID does not match its directory key', async (t) => {
  const root = await makeRoot(t);
  await writeSkill(
    root,
    'nullability-contract/SKILL.md',
    [
      'name: nullability-contract',
      'description: exported owner',
      'metadata:',
      '  rr:',
      '    id: another-skill',
    ].join('\n')
  );

  await assert.rejects(
    () => resolveSkillId(root, 'nullability-contract'),
    (err) => err instanceof SkillIdResolutionError && /declares a different skill ID/.test(err.message)
  );
});
