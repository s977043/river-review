import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import {
  ensureGitRepo,
  detectDefaultBranch,
  findMergeBase,
  findMergeBaseCandidate,
  resolveRefToCommit,
  resolveRefToCommitCandidate,
  resolveBaseMergeBase,
  BaseRefError,
  getHeadSha,
  isWorkingTreeDirty,
  listChangedFiles,
  diffWithContext,
  collectAddedLineHints,
  GitError,
  GitRepoNotFoundError,
} from '../src/lib/git.mjs';
import { createTempGitRepo, runGit, writeFileRelative } from './helpers/temp-repo.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';

// ---------------------------------------------------------------------------
// ensureGitRepo
// ---------------------------------------------------------------------------

describe('ensureGitRepo', () => {
  test('returns repo root for valid git repo', async (t) => {
    const { dir, cleanup } = await createTempGitRepo();
    t.after(cleanup);
    const root = await ensureGitRepo(dir);
    // macOS realpath: /tmp -> /private/tmp
    assert.ok(
      root.endsWith(dir.replace(/^\/private/, '')) || dir.endsWith(root.replace(/^\/private/, ''))
    );
  });

  test('throws GitRepoNotFoundError for non-repo directory', async (t) => {
    const dir = createTempDir({ prefix: 'git-no-repo-' });
    t.after(() => cleanupTempDir(dir));
    await assert.rejects(ensureGitRepo(dir), (err) => {
      assert.ok(err instanceof GitRepoNotFoundError);
      assert.match(err.message, /Not a git repository/);
      return true;
    });
  });

  test('throws for non-existent path', async () => {
    await assert.rejects(
      ensureGitRepo(join(tmpdir(), 'nonexistent-path-xyz-' + Date.now())),
      (err) => {
        assert.ok(err instanceof GitError);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// detectDefaultBranch
// ---------------------------------------------------------------------------

describe('detectDefaultBranch', () => {
  test('returns main for repo with main branch', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ branch: 'main' });
    t.after(cleanup);
    const branch = await detectDefaultBranch(dir);
    assert.equal(branch, 'main');
  });

  test('returns master for repo with master branch', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ branch: 'master' });
    t.after(cleanup);
    const branch = await detectDefaultBranch(dir);
    assert.equal(branch, 'master');
  });

  test('returns HEAD as fallback when no main/master branch', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({ branch: 'develop' });
    t.after(cleanup);
    const branch = await detectDefaultBranch(dir);
    assert.equal(branch, 'HEAD');
  });
});

// ---------------------------------------------------------------------------
// findMergeBase
// ---------------------------------------------------------------------------

describe('findMergeBase', () => {
  test('returns merge base commit', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    // create a second commit on main
    writeFileRelative(dir, 'b.txt', 'second\n');
    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'second'], dir);

    const base = await findMergeBase(dir, 'main');
    assert.ok(base);
    assert.match(base, /^[0-9a-f]{40}$/);
  });

  test('falls back to HEAD when baseRef does not exist', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    const base = await findMergeBase(dir, 'nonexistent-branch');
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    assert.equal(base, head);
  });
});

// ---------------------------------------------------------------------------
// resolveRefToCommit / resolveBaseMergeBase (#2085)
// ---------------------------------------------------------------------------

describe('resolveRefToCommit (#2085 wrapper pin)', () => {
  test('returns exactly the sha resolveRefToCommitCandidate reports', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();

    const candidate = await resolveRefToCommitCandidate(dir, 'main');
    assert.equal(candidate.sha, head);
    assert.equal(candidate.ref, 'main');
    assert.equal(await resolveRefToCommit(dir, 'main'), candidate.sha);

    const missing = await resolveRefToCommitCandidate(dir, 'nonexistent-branch');
    assert.deepEqual(missing, { sha: null, ref: null });
    assert.equal(await resolveRefToCommit(dir, 'nonexistent-branch'), null);
  });

  test('findMergeBase keeps the same wrapper shape', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    const candidate = await findMergeBaseCandidate(dir, 'main');
    assert.equal(await findMergeBase(dir, 'main'), candidate.mergeBase);
  });
});

describe('resolveBaseMergeBase unresolvable --base (#2085 candidate-order pin)', () => {
  test('lists the tried candidates in resolver order: origin/<ref> then <ref>', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    await assert.rejects(
      () => resolveBaseMergeBase(dir, 'nonexistent-branch', 'HEAD'),
      (err) => {
        assert.ok(err instanceof BaseRefError);
        // Order is part of the contract: the first candidate the resolvers walk
        // is `origin/<ref>`. Reversing baseRefCandidates() must fail this line.
        assert.ok(
          err.message.includes('(tried "origin/nonexistent-branch" and "nonexistent-branch")'),
          err.message
        );
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// getHeadSha (#1715)
// ---------------------------------------------------------------------------

describe('getHeadSha', () => {
  test('returns the HEAD commit sha', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);

    const sha = await getHeadSha(dir);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    assert.equal(sha, head);
    // 40 hex for SHA-1, 64 for a SHA-256 repository. The producer does not
    // constrain the length, so neither does this (#1715 N3).
    assert.match(sha, /^[0-9a-f]{40}$|^[0-9a-f]{64}$/);
  });

  test('returns null for a non-repo directory instead of throwing', async (t) => {
    const dir = createTempDir({ prefix: 'git-head-no-repo-' });
    t.after(() => cleanupTempDir(dir));
    assert.equal(await getHeadSha(dir), null);
  });

  test('returns null when HEAD is unborn (git init before the first commit)', async (t) => {
    const dir = createTempDir({ prefix: 'git-head-unborn-' });
    t.after(() => cleanupTempDir(dir));
    await runGit(['init', '-b', 'main'], dir);
    assert.equal(await getHeadSha(dir), null);
  });
});

// ---------------------------------------------------------------------------
// isWorkingTreeDirty (#1715 W1)
// ---------------------------------------------------------------------------

describe('isWorkingTreeDirty', () => {
  test('returns false when the worktree matches HEAD', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    assert.equal(await isWorkingTreeDirty(dir), false);
  });

  test('returns true for an unstaged modification', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
      changedFiles: { 'a.txt': 'modified\n' },
    });
    t.after(cleanup);
    assert.equal(await isWorkingTreeDirty(dir), true);
  });

  test('returns true for a staged-but-uncommitted change', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
      changedFiles: { 'a.txt': 'modified\n' },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);
    assert.equal(await isWorkingTreeDirty(dir), true);
  });

  test('returns true for an untracked file', async (t) => {
    // Untracked files reach the review through collectRepoDiff once staged, and
    // `--porcelain` is what makes them visible here; `diff-index` would not.
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    writeFileSync(join(dir, 'new.txt'), 'brand new\n');
    assert.equal(await isWorkingTreeDirty(dir), true);
  });

  test('returns null (not false) for a non-repo directory', async (t) => {
    // Reporting "clean" for a tree that was never inspected would be the one
    // wrong answer — a consumer would read the sha as reproducible.
    const dir = createTempDir({ prefix: 'git-dirty-no-repo-' });
    t.after(() => cleanupTempDir(dir));
    assert.equal(await isWorkingTreeDirty(dir), null);
  });
});

// ---------------------------------------------------------------------------
// listChangedFiles
// ---------------------------------------------------------------------------

describe('listChangedFiles', () => {
  test('lists added files', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
      changedFiles: { 'b.txt': 'new file\n' },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const files = await listChangedFiles(dir, head);
    assert.ok(files.includes('b.txt'));
  });

  test('lists modified files', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
      changedFiles: { 'a.txt': 'modified\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const files = await listChangedFiles(dir, head);
    assert.ok(files.includes('a.txt'));
  });

  test('returns empty array when no changes', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'initial\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const files = await listChangedFiles(dir, head);
    assert.deepEqual(files, []);
  });
});

// ---------------------------------------------------------------------------
// diffWithContext
// ---------------------------------------------------------------------------

describe('diffWithContext', () => {
  test('returns unified diff text', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/app.js': 'const a = 1;\n' },
      changedFiles: { 'src/app.js': 'const a = 2;\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const diff = await diffWithContext(dir, head);
    assert.match(diff, /--- a\/src\/app\.js/);
    assert.match(diff, /\+\+\+ b\/src\/app\.js/);
    assert.match(diff, /const a = 2/);
  });

  test('respects unified context lines option', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'x.txt': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\n' },
      changedFiles: { 'x.txt': 'line1\nline2\nline3\nCHANGED\nline5\nline6\nline7\nline8\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();

    const diff0 = await diffWithContext(dir, head, { unified: 0 });
    const diff5 = await diffWithContext(dir, head, { unified: 5 });
    // With 0 context, diff is shorter
    assert.ok(diff0.length < diff5.length);
  });

  test('returns empty string when no changes', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'stable\n' },
    });
    t.after(cleanup);
    const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
    const diff = await diffWithContext(dir, head);
    assert.equal(diff, '');
  });
});

// ---------------------------------------------------------------------------
// collectAddedLineHints
// ---------------------------------------------------------------------------

describe('collectAddedLineHints', () => {
  test('extracts first hunk start line per file', () => {
    const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
diff --git a/src/utils.js b/src/utils.js
--- a/src/utils.js
+++ b/src/utils.js
@@ -10,2 +10,5 @@
 function helper() {}
+function newHelper() {}
`;
    const hints = collectAddedLineHints(diff);
    assert.equal(hints.get('src/app.js'), 1);
    assert.equal(hints.get('src/utils.js'), 10);
    assert.equal(hints.size, 2);
  });

  test('returns empty map for empty diff', () => {
    assert.equal(collectAddedLineHints('').size, 0);
  });

  test('only records first hunk per file', () => {
    const diff = `diff --git a/f.js b/f.js
--- a/f.js
+++ b/f.js
@@ -5,3 +5,4 @@
 line5
+added1
@@ -20,3 +21,4 @@
 line20
+added2
`;
    const hints = collectAddedLineHints(diff);
    assert.equal(hints.get('f.js'), 5);
    assert.equal(hints.size, 1);
  });

  test('handles new file diff (no --- a/ header)', () => {
    const diff = `diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;
`;
    const hints = collectAddedLineHints(diff);
    assert.equal(hints.get('new.js'), 1);
  });
});
