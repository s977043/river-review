import fs from 'node:fs/promises';
import { parseList } from './utils.mjs';

export async function resolvePullRequestLabels() {
  const envLabels = parseList(process.env.RIVER_PR_LABELS);
  if (envLabels.length) return envLabels;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];

  try {
    const raw = await fs.readFile(eventPath, 'utf8');
    const event = JSON.parse(raw);
    const pullRequestLabels = event?.pull_request?.labels ?? event?.labels ?? [];
    return pullRequestLabels.map((label) => label?.name).filter(Boolean);
  } catch {
    return [];
  }
}

export async function resolvePullRequestBody() {
  // Explicit env wins (works for any runner / non-Action use).
  const envBody = process.env.RIVER_PR_BODY;
  if (envBody && envBody.trim()) return envBody;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;

  try {
    const raw = await fs.readFile(eventPath, 'utf8');
    const event = JSON.parse(raw);
    const body = event?.pull_request?.body;
    return body && String(body).trim() ? String(body) : null;
  } catch {
    return null;
  }
}
