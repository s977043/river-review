import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { resolvePullRequestBody } from '../src/lib/pr-context.mjs';

describe('resolvePullRequestBody', () => {
  let tmpDir;
  let saved;

  beforeEach(async () => {
    saved = {
      RIVER_PR_BODY: process.env.RIVER_PR_BODY,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    };
    delete process.env.RIVER_PR_BODY;
    delete process.env.GITHUB_EVENT_PATH;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-pr-context-'));
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeEvent(content) {
    const eventPath = path.join(tmpDir, 'event.json');
    await fs.writeFile(eventPath, content, 'utf8');
    process.env.GITHUB_EVENT_PATH = eventPath;
  }

  it('prefers a non-blank RIVER_PR_BODY over the event file', async () => {
    await writeEvent(JSON.stringify({ pull_request: { body: 'from event' } }));
    process.env.RIVER_PR_BODY = 'from env';
    assert.equal(await resolvePullRequestBody(), 'from env');
  });

  it('ignores a whitespace-only RIVER_PR_BODY and falls back to the event file', async () => {
    await writeEvent(JSON.stringify({ pull_request: { body: 'from event' } }));
    process.env.RIVER_PR_BODY = '  \n\t ';
    assert.equal(await resolvePullRequestBody(), 'from event');
  });

  it('reads pull_request.body from the event file', async () => {
    await writeEvent(JSON.stringify({ pull_request: { body: '## Why\nbecause' } }));
    assert.equal(await resolvePullRequestBody(), '## Why\nbecause');
  });

  it('returns null when the event file is missing', async () => {
    process.env.GITHUB_EVENT_PATH = path.join(tmpDir, 'missing.json');
    assert.equal(await resolvePullRequestBody(), null);
  });

  it('returns null when the event file is malformed JSON', async () => {
    await writeEvent('{ not json');
    assert.equal(await resolvePullRequestBody(), null);
  });
});
