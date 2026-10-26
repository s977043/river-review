#!/usr/bin/env node
import process from 'node:process';
import { resolveSkillId, SkillIdResolutionError } from '../src/lib/skill-id-resolver.mjs';

const [root, skillId] = process.argv.slice(2);

if (!root || !skillId) {
  console.error('Usage: resolve-skill-id <root> <skill-id>');
  process.exitCode = 1;
} else {
  try {
    const resolved = await resolveSkillId(root, skillId);
    if (!resolved) {
      console.error(`Unresolved skill ID: ${skillId}`);
      process.exitCode = 2;
    } else {
      console.log(resolved.path);
    }
  } catch (err) {
    const message = err instanceof SkillIdResolutionError ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}
