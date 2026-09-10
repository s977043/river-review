import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class GitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GitError';
  }
}

export class GitRepoNotFoundError extends GitError {
  constructor(cwd) {
    super(`Not a git repository: ${cwd}`);
    this.name = 'GitRepoNotFoundError';
  }
}

async function runGit(args, { cwd }) {
  try {
    // Use a large maxBuffer (200MB) to handle large diffs (e.g., pnpm-lock.yaml changes)
    const { stdout } = await exec('git', args, { cwd, maxBuffer: 200 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new GitError(detail);
  }
}

export async function ensureGitRepo(cwd) {
  const insideWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd }).catch(
    () => null
  );
  if (insideWorkTree !== 'true') {
    throw new GitRepoNotFoundError(cwd);
  }
  return runGit(['rev-parse', '--show-toplevel'], { cwd });
}

export async function detectDefaultBranch(cwd) {
  const candidates = [];
  const ref = await runGit(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd }).catch(
    () => null
  );
  if (ref) {
    const parts = ref.split('/');
    candidates.push(parts[parts.length - 1]);
  }
  candidates.push('main', 'master');

  for (const branch of candidates) {
    const exists = await runGit(['rev-parse', '--quiet', '--verify', branch], { cwd }).catch(
      () => null
    );
    if (exists) return branch;
    const remoteExists = await runGit(['rev-parse', '--quiet', '--verify', `origin/${branch}`], {
      cwd,
    }).catch(() => null);
    if (remoteExists) return branch;
  }
  return 'HEAD';
}

/**
 * Resolve `baseRef` to a commit SHA, or null when git cannot resolve it.
 *
 * Uses the SAME candidate order as {@link findMergeBase} (`origin/<ref>` then
 * `<ref>`), but NOT the same predicate: this asks `rev-parse` whether the ref
 * names a commit, while findMergeBase asks `merge-base HEAD <ref>` whether the
 * two share history. The implication holds in one direction only — a ref this
 * rejects is one findMergeBase cannot use either, but a ref this accepts can
 * still have no merge base (unrelated history, a shallow clone) and fall back
 * to HEAD. Callers that must not review an empty range therefore check the
 * resulting merge base as well (see resolveBaseRepoDiff in
 * src/cli/commands/review.mjs). Verified 2026-09-04: `--base <orphan branch>`
 * passes this check and still yields mergeBase === HEAD (#2046 review).
 *
 * Because the two predicates can disagree, the candidate ACTUALLY used is part
 * of the answer, not an implementation detail: see
 * {@link resolveRefToCommitCandidate} / {@link findMergeBaseCandidate}, which
 * report it so {@link resolveBaseMergeBase} can keep both sides talking about
 * the same commit (#2071).
 *
 * @param {string} cwd repository path
 * @param {string} baseRef branch / ref / SHA as typed by the user
 * @returns {Promise<string|null>} commit SHA, or null when unresolvable
 */
export async function resolveRefToCommit(cwd, baseRef) {
  return (await resolveRefToCommitCandidate(cwd, baseRef)).sha;
}

/**
 * The candidate order both `--base` resolvers walk: `origin/<ref>` then `<ref>`.
 *
 * SSoT for the order so the two resolvers cannot drift apart. Changing the
 * order is explicitly a non-goal of #2071 — what that issue fixes is the two
 * resolvers landing on DIFFERENT entries of this same list.
 *
 * @param {string} baseRef
 * @returns {string[]}
 */
function baseRefCandidates(baseRef) {
  return [`origin/${baseRef}`, baseRef];
}

/**
 * {@link resolveRefToCommit}, but also reporting WHICH candidate answered.
 *
 * @param {string} cwd repository path
 * @param {string} baseRef branch / ref / SHA as typed by the user
 * @returns {Promise<{sha: string|null, ref: string|null}>} `ref` is the
 *   candidate that resolved, or null when none did (then `sha` is null too).
 */
export async function resolveRefToCommitCandidate(cwd, baseRef) {
  for (const ref of baseRefCandidates(baseRef)) {
    const sha = await runGit(['rev-parse', '--quiet', '--verify', `${ref}^{commit}`], {
      cwd,
    }).catch(() => null);
    if (sha) return { sha, ref };
  }
  return { sha: null, ref: null };
}

export async function findMergeBase(cwd, baseRef) {
  return (await findMergeBaseCandidate(cwd, baseRef)).mergeBase;
}

/**
 * {@link findMergeBase}, but also reporting WHICH candidate produced the merge
 * base.
 *
 * `ref` is null when NO candidate had a merge base with HEAD and the result is
 * the deterministic HEAD fallback — a caller must not read that null as "the
 * ref the user typed", because no ref answered at all.
 *
 * @param {string} cwd repository path
 * @param {string} baseRef branch / ref / SHA as typed by the user
 * @returns {Promise<{mergeBase: string, ref: string|null}>}
 */
export async function findMergeBaseCandidate(cwd, baseRef) {
  for (const ref of baseRefCandidates(baseRef)) {
    const mergeBase = await runGit(['merge-base', 'HEAD', ref], { cwd }).catch(() => null);
    if (mergeBase) return { mergeBase, ref };
  }
  // fallback to current HEAD to keep diff calculations deterministic
  return { mergeBase: await runGit(['rev-parse', 'HEAD'], { cwd }), ref: null };
}

/**
 * Is `ancestorRef` an ancestor of `descendantRef`?
 *
 * `merge-base --is-ancestor` communicates the answer through the exit status
 * (0 = yes, 1 = no) and prints nothing, so the usual "did stdout come back
 * non-empty" test of {@link runGit} cannot be used — a successful call returns
 * the empty string. Resolve the promise state instead.
 *
 * Fail-soft on purpose: any other git failure (a bad ref, a broken repo)
 * resolves to `false`. The only caller is a diagnostic message refinement in
 * {@link resolveBaseMergeBase}, where `false` keeps the pre-existing wording;
 * a wrong guess must never be more than a less specific warning.
 *
 * @param {string} cwd repository path
 * @param {string} ancestorRef the ref that may be the ancestor
 * @param {string} descendantRef the ref that may be the descendant
 * @returns {Promise<boolean>}
 */
export async function isAncestorRef(cwd, ancestorRef, descendantRef) {
  return runGit(['merge-base', '--is-ancestor', ancestorRef, descendantRef], { cwd }).then(
    () => true,
    () => false
  );
}

/**
 * A `--base` value that cannot be turned into a usable diff range.
 *
 * Thrown by {@link resolveBaseMergeBase} so callers can render it as a usage
 * error rather than a git failure. Deliberately NOT a {@link GitError}: no git
 * command failed — the value the user typed is the problem, and src/cli.mjs
 * maps GitError to a "Git command failed" hint that would misdirect.
 */
export class BaseRefError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BaseRefError';
  }
}

/**
 * Normalize a raw `--base` value into `null` / `''` / a trimmed ref.
 *
 * `null` means "not given" (fall back to the auto-detected default branch),
 * `''` means "given but blank" (a usage error — `--base "   "` used to reach
 * findMergeBase as whitespace, resolve to nothing, and fall back to HEAD, i.e.
 * an empty range presented as "no changes", #2046 review).
 *
 * @param {unknown} rawBaseRef
 * @returns {string|null} trimmed ref, `''` when blank, `null` when absent
 */
export function normalizeBaseRef(rawBaseRef) {
  if (typeof rawBaseRef !== 'string') return null;
  const trimmed = rawBaseRef.trim();
  return trimmed === '' ? '' : trimmed;
}

/**
 * SSoT for how ANY subcommand turns a `--base` value into a merge base.
 *
 * Introduced by #2046 / PR #2049 inside `resolveBaseRepoDiff`
 * (src/cli/commands/review.mjs) and lifted here by #2051 / #2057 so the
 * `skills` and `run` surfaces share the exact same contract instead of
 * re-deriving it — `--base` used to mean three different things depending on
 * the subcommand (`review` validated it, `run` read it without validating,
 * `skills` ignored it entirely).
 *
 * Contract:
 *   - absent (`null`) → `fallbackRef` is used and NOT validated; it is not
 *     something the user typed, so its old HEAD fallback stays.
 *   - blank after trimming → {@link BaseRefError}.
 *   - unresolvable ref → {@link BaseRefError}. `findMergeBase` falls back to
 *     HEAD for an unknown ref, so without this a typo reviewed nothing and
 *     exited 0.
 *   - resolvable ref that still yields an EMPTY range → `warning` is returned
 *     (not thrown). The ref itself was valid, so this is not fatal; the caller
 *     decides where to print it. Two shapes reach here and they get different
 *     wording (#2067): no shared history (unrelated / shallow), and a base that
 *     is ahead of HEAD (HEAD is its ancestor, so the merge base IS HEAD).
 *
 * @param {string} repoRoot repository path
 * @param {unknown} rawBaseRef the raw `--base` value as typed (or null/undefined)
 * @param {string} fallbackRef ref to diff against when `--base` is absent
 * `baseRefSha` is the commit of the candidate the merge base actually came from
 * (#2071), which is not always the first candidate `rev-parse` accepts.
 *
 * @returns {Promise<{baseRef: string|null, baseRefSha: string|null, mergeBase: string, warning: string|null}>}
 * @throws {BaseRefError} when an explicitly typed `--base` is blank or unresolvable
 */
export async function resolveBaseMergeBase(repoRoot, rawBaseRef, fallbackRef) {
  const baseRef = normalizeBaseRef(rawBaseRef);
  if (baseRef === '') {
    throw new BaseRefError('--base requires a branch or ref (got a blank value).');
  }
  let baseRefSha = null;
  let resolvedRef = null;
  if (baseRef !== null) {
    ({ sha: baseRefSha, ref: resolvedRef } = await resolveRefToCommitCandidate(repoRoot, baseRef));
    if (!baseRefSha) {
      // #2085: enumerate from baseRefCandidates() so the wording cannot drift
      // from the order the resolvers actually walk.
      const tried = baseRefCandidates(baseRef)
        .map((ref) => `"${ref}"`)
        .join(' and ');
      throw new BaseRefError(
        `--base "${baseRef}" is not a ref this repository can resolve ` +
          `(tried ${tried}). ` +
          'Reviewing an empty range would look like "no changes".'
      );
    }
  }
  const { mergeBase, ref: mergeBaseRef } = await findMergeBaseCandidate(
    repoRoot,
    baseRef ?? fallbackRef
  );
  // #2071: the two resolvers walk the same candidate list with DIFFERENT
  // predicates (`rev-parse` vs `merge-base`), so they can land on different
  // entries — `origin/<ref>` resolving but sharing no history while `<ref>`
  // does. When that happens the merge base above came from `mergeBaseRef`, so
  // every downstream statement about "the base" must be about THAT commit;
  // keeping `baseRefSha` from the other candidate is how the empty-range
  // warning ended up describing a commit the merge base never came from.
  // Re-resolve with the same `rev-parse` predicate and adopt it — one extra
  // git call, and only on the rare disagreement.
  if (baseRef !== null && mergeBaseRef !== null && mergeBaseRef !== resolvedRef) {
    const mergeBaseRefSha = await runGit(
      ['rev-parse', '--quiet', '--verify', `${mergeBaseRef}^{commit}`],
      { cwd: repoRoot }
    ).catch(() => null);
    if (mergeBaseRefSha) baseRefSha = mergeBaseRefSha;
  }
  // `rev-parse` says the ref exists; `merge-base` says the two share history.
  // A ref that passes the first and fails the second (unrelated history, a
  // shallow clone) makes findMergeBase fall back to HEAD, which is an empty
  // range wearing the same clothes as "no changes" (#2046 review round 3).
  // Not fatal — the ref itself was valid — but it must not pass unannounced.
  //
  // `mergeBase === headSha` alone does NOT mean "no shared history" (#2067).
  // Two different situations land on HEAD, and only one of them is unrelated
  // history:
  //   - unrelated history / shallow clone → `merge-base` FAILS and
  //     findMergeBase falls back to HEAD.
  //   - the base is AHEAD of HEAD (HEAD is its ancestor) → `merge-base`
  //     SUCCEEDS and correctly answers HEAD.
  // Both also satisfy `baseRefSha !== mergeBase`, so the two are separated by
  // asking git the ancestry question directly. This costs one extra git call,
  // but only inside the already-narrow branch that is about to warn — the
  // no-warning path (every normal `--base`) makes no additional call.
  let warning = null;
  if (baseRefSha && baseRefSha !== mergeBase) {
    const headSha = await getHeadSha(repoRoot);
    if (headSha && mergeBase === headSha) {
      // Compare against the already-resolved sha, not `baseRef`: resolveRefToCommit
      // may have picked `origin/<baseRef>`, and re-resolving here could pick the
      // other candidate and answer about a different commit. Since #2071 that
      // sha is also reconciled with the candidate `findMergeBase` actually used,
      // so this answers about the commit `mergeBase` came from.
      const baseIsAheadOfHead = await isAncestorRef(repoRoot, headSha, baseRefSha);
      warning = baseIsAheadOfHead
        ? `Warning: --base "${baseRef}" is ahead of HEAD (HEAD is an ancestor of it), ` +
          'so the merge base is HEAD itself and the diff yields an empty range. ' +
          'Pass a ref HEAD is ahead of to review the change.'
        : `Warning: --base "${baseRef}" shares no history with HEAD, so no merge base exists. ` +
          'The diff falls back to HEAD, which yields an empty range.';
    }
  }
  return { baseRef, baseRefSha, mergeBase, warning };
}

/**
 * Resolve the HEAD commit sha of a repository.
 *
 * Same `rev-parse HEAD` call `findMergeBase` already falls back to, exported so
 * the run record can name the commit a review was taken AGAINST (#1715 / 契約1
 * provenance). `mergeBase` is the comparison base, so it cannot stand in for
 * this.
 *
 * IMPORTANT — this is NOT "the commit containing the reviewed code". The local
 * runner diffs the WORKING TREE against `mergeBase`, so on a dirty tree (the
 * normal case for `river run` during development) the reviewed lines exist only
 * in the working tree and are absent from HEAD's tree. The sha identifies the
 * baseline the reviewed change sat on top of; pair it with
 * `isWorkingTreeDirty` to know whether HEAD alone reproduces what was reviewed.
 *
 * Fail-soft on purpose: returns null instead of throwing when `cwd` is not a
 * git repository or HEAD is unborn (a fresh `git init` before the first
 * commit). The sha is optional provenance and a review must never fail because
 * the commit identity could not be resolved.
 *
 * @param {string} cwd
 * @returns {Promise<string|null>} 40-hex sha, or null when unavailable
 */
export async function getHeadSha(cwd) {
  return runGit(['rev-parse', 'HEAD'], { cwd }).catch(() => null);
}

/**
 * Report whether the working tree carries changes HEAD does not have.
 *
 * Without this, a record holding only `commitSha` cannot distinguish "the
 * review read exactly HEAD's tree" from "the review read HEAD plus uncommitted
 * edits" — and the second is the default case locally. A consumer that treats
 * `source_commit_sha` as reproducible needs to see the difference (#1715 W1).
 *
 * `--porcelain` covers staged, unstaged, and untracked changes, which is
 * exactly the set `collectRepoDiff` can pick up beyond HEAD.
 *
 * Fail-soft, and tri-state on purpose: null means "could not determine" (not a
 * git repo, git unavailable). Collapsing that to `false` would report a clean
 * tree that was never observed.
 *
 * @param {string} cwd
 * @returns {Promise<boolean|null>} true when dirty, false when clean, null when unknown
 */
export async function isWorkingTreeDirty(cwd) {
  const status = await runGit(['status', '--porcelain'], { cwd }).catch(() => null);
  if (status === null) return null;
  return status.length > 0;
}

export async function listChangedFiles(cwd, baseRef) {
  const stdout = await runGit(['diff', '--name-only', baseRef], { cwd });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function diffWithContext(cwd, baseRef, { unified = 3 } = {}) {
  return runGit(['diff', `--unified=${unified}`, '--no-color', baseRef], { cwd });
}

export function collectAddedLineHints(diffText) {
  const hints = new Map();
  let currentFile = null;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      // We record the first hunk per file; this keeps output stable for the placeholder comments.
      currentFile = line.replace('+++ b/', '').trim();
      continue;
    }
    if (!line.startsWith('@@')) continue;
    const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match && currentFile && !hints.has(currentFile)) {
      const startLine = Number.parseInt(match[1], 10);
      hints.set(currentFile, startLine);
    }
  }
  return hints;
}
