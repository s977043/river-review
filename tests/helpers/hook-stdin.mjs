// A hook script is allowed to exit before it reads its stdin -- that early exit
// is the behaviour under test for every hook that is inert by default
// (`after-change-observe.sh:33`, `plugin-task-checkpoint-hook.sh:21`). When it
// does, the pipe closes while the parent is still writing and the write lands
// on a closed descriptor: Node raises `EPIPE` on the stdin stream, and a stream
// with no `error` listener turns that into an uncaught exception that fails the
// whole test file.
//
// That is a race between the child exiting and the parent finishing its write,
// so it is intermittent and platform-dependent: #2341 saw it twice on the Linux
// runner on 2026-09-20 (PRs #2333 and #2340) while macOS stayed green in the
// same runs. It is made deterministic by a payload larger than the pipe buffer
// (see `tests/helpers/__tests__/hook-stdin.test.mjs`).
//
// The writer has to tolerate it. `EPIPE` and `ERR_STREAM_DESTROYED` mean "the
// reader is already gone", which is not a test failure -- the verdict is the
// child's exit code and its output, both of which are still delivered. Any
// OTHER stdin error is re-raised, so a genuine write fault is not swallowed.

const TOLERATED = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

/**
 * Write `payload` to a spawned hook's stdin and close it, tolerating a reader
 * that has already exited.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} payload
 */
export function endHookStdin(child, payload) {
  child.stdin.on('error', (error) => {
    if (!TOLERATED.has(error?.code)) throw error;
  });
  child.stdin.end(payload);
}
