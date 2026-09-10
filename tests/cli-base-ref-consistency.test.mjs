// tests/cli-base-ref-consistency.test.mjs
//
// #2051 / #2057: `--base` の意味が subcommand ごとに割れていた問題の pin。
//
//   - `review plan|exec|route`: PR #2049 で trim + 解決可否検査 + 共有履歴なしの
//     警告まで入った（`resolveBaseRepoDiff`）
//   - `skills`: `--base` を受理するが**値を読まない**。基準は常に自動検出の
//     デフォルトブランチだった（#2051）
//   - `run`: 値は読むが**解決可否を検証しない**。typo が無警告で HEAD へ
//     フォールバックしていた（#2057）
//
// 3 面は同じ `resolveBaseMergeBase`（src/lib/git.mjs）を通す。ここで固定するのは
// 次の 4 点。
//   1. 解決できない ref / 空白のみの値は 3 面すべて exit 1（同一メッセージ本文）
//   2. 前後空白のある有効な ref は 3 面すべて trim され、同じ merge base を指す
//   3. `skills --base <ref>` が実際にその range のファイルを見る（#2051 本体）。
//      判定は **既存の production 経路**（`review plan --base <同じ ref>` が
//      artifact.context.changedFiles に載せる集合）との突合で行う。自前で
//      merge-base を計算し直して比べると自己整合になり違反を注入しても緑になる。
//   4. 共有履歴のない ref は 3 面すべて stderr で警告する（fatal ではない）
//   5. #2067: 空 range の警告は 2 分岐する。HEAD の子孫（base が HEAD より先へ
//      進んでいる）と、共有履歴のない orphan とで文言が違い、通常の祖先 ref では
//      どちらも出ない。3 面とも同じ文言であることを固定する。
//   6. #2071: `origin/<ref>` と `<ref>` が別 commit を指すとき、`rev-parse` と
//      `merge-base` が別候補を採りうる。警告文は **mergeBase の出所** について
//      語らなければならない。両向きを固定する。
//
// 判定は CLI 面（runCliInProcess）で行う。`resolveBaseMergeBase` を直接呼ぶと
// 配線層（skills.mjs / local-runner.mjs が実際にその戻り値を使っているか）が
// 無検査のまま緑になるため。

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, describe } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit, writeFileRelative } from './helpers/temp-repo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_SKILL = join(HERE, 'fixtures', 'sample-skills', 'rr-midstream-sample-001.md');

/** `--base` の値だけを差し替えて 3 面を同じ条件で叩くための引数組み立て。 */
const outDir = mkdtempSync(join(tmpdir(), 'river-base-consistency-'));
let planCounter = 0;

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function runPlan(dir, baseArgs) {
  const outFile = join(outDir, `plan-${planCounter++}.json`);
  const res = await runCliInProcess(
    ['review', 'plan', '.', ...baseArgs, '--plan-only', '--output-file', outFile],
    { cwd: dir }
  );
  const artifact = res.code === 0 ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  return { ...res, artifact };
}

function runSkills(dir, baseArgs) {
  return runCliInProcess(['skills', '.', ...baseArgs, '--dry-run', '--output', 'json'], {
    cwd: dir,
  });
}

function runRun(dir, baseArgs) {
  return runCliInProcess(['run', '.', ...baseArgs, '--dry-run', '--planner', 'off'], { cwd: dir });
}

async function revParse(dir, ref) {
  const { stdout } = await runGit(['rev-parse', ref], dir);
  return stdout.trim();
}

/** `skills --output json` の結果から、レビュー対象になったファイル集合を取り出す。 */
function skillsFileSet(stdout) {
  const results = JSON.parse(stdout);
  return [...new Set(results.map((r) => r.file))].sort();
}

/** `run` のテキストヘッダから `Base branch:` / `Merge base:` を読む。 */
function runHeaderField(stdout, label) {
  const line = stdout.split('\n').find((l) => l.startsWith(`${label}:`));
  return line ? line.slice(label.length + 1).trim() : null;
}

describe('--base contract parity across review / skills / run (#2051 / #2057)', () => {
  let dir;
  let cleanup;
  /** 初期コミット（b.ts / c.ts より前）。 */
  let base0;

  before(async () => {
    ({ dir, cleanup } = await createTempGitRepo({
      prefix: 'river-base-consistency-',
      initialFiles: { 'a.ts': 'export const a = 1;\n' },
    }));
    // skills 面が読むのは <repoRoot>/skills（SkillDispatcher のフォールバック）。
    // applyTo が `**/*.ts` のサンプルスキルを置いて、.ts の変更が結果に現れる
    // ようにする。
    mkdirSync(join(dir, 'skills'), { recursive: true });
    copyFileSync(SAMPLE_SKILL, join(dir, 'skills', 'rr-midstream-sample-001.md'));
    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'add skills'], dir);
    base0 = await revParse(dir, 'HEAD');

    writeFileRelative(dir, 'b.ts', 'export const b = 2;\n');
    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'add b'], dir);

    writeFileRelative(dir, 'c.ts', 'export const c = 3;\n');
    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'add c'], dir);
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  // ---------------------------------------------------------------------------
  // 1. 解決できない ref / 空白のみの値
  // ---------------------------------------------------------------------------
  for (const [label, value] of [
    ['unresolvable ref', 'no-such-ref-xyz'],
    ['blank value', '   '],
  ]) {
    test(`${label}: review / skills / run が 3 面とも exit 1 になる`, async () => {
      const plan = await runPlan(dir, ['--base', value]);
      const skills = await runSkills(dir, ['--base', value]);
      const run = await runRun(dir, ['--base', value]);

      assert.equal(plan.code, 1, `review plan: ${plan.stderr}`);
      assert.equal(skills.code, 1, `skills: ${skills.stderr}`);
      assert.equal(run.code, 1, `run: ${run.stderr}`);
    });

    test(`${label}: 3 面のエラー本文が一致する`, async () => {
      // 接頭辞は面ごとに違う（review / skills は `Error: `、run は cli.mjs の
      // 汎用ハンドラ経由で `CLI error: `）。固定するのは本文であり、そこが
      // 割れると「同じフラグに別の意味」へ戻る。
      const body =
        value === '   '
          ? '--base requires a branch or ref (got a blank value).'
          : `--base "${value}" is not a ref this repository can resolve`;
      const plan = await runPlan(dir, ['--base', value]);
      const skills = await runSkills(dir, ['--base', value]);
      const run = await runRun(dir, ['--base', value]);
      for (const [surface, res] of [
        ['review plan', plan],
        ['skills', skills],
        ['run', run],
      ]) {
        assert.ok(res.stderr.includes(body), `${surface} の stderr に本文が無い: ${res.stderr}`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 2. 前後空白のある有効な ref
  // ---------------------------------------------------------------------------
  test('前後に空白のある有効な ref は 3 面とも trim されて受理される', async () => {
    const padded = `  ${base0}  `;
    const plan = await runPlan(dir, ['--base', padded]);
    const skills = await runSkills(dir, ['--base', padded]);
    const run = await runRun(dir, ['--base', padded]);

    assert.equal(plan.code, 0, `review plan: ${plan.stderr}`);
    assert.equal(skills.code, 0, `skills: ${skills.stderr}`);
    assert.equal(run.code, 0, `run: ${run.stderr}`);

    // run のヘッダは trim 後の値を表示する（trim 前は空白込みの ref がそのまま
    // findMergeBase へ渡り、解決できずに HEAD へ落ちていた）。
    assert.equal(runHeaderField(run.stdout, 'Base branch'), base0);
    assert.equal(runHeaderField(run.stdout, 'Merge base'), base0);
    assert.equal(plan.artifact.context.mergeBase, base0);
  });

  // ---------------------------------------------------------------------------
  // 3. #2051 本体: skills が --base の range を実際に見る
  // ---------------------------------------------------------------------------
  test('skills --base <ref> が review plan --base <同じ ref> と同じ変更ファイルを見る', async () => {
    const plan = await runPlan(dir, ['--base', base0]);
    assert.equal(plan.code, 0, plan.stderr);
    const planFiles = [...plan.artifact.context.changedFiles]
      .filter((f) => f.endsWith('.ts'))
      .sort();

    const skills = await runSkills(dir, ['--base', base0]);
    assert.equal(skills.code, 0, skills.stderr);

    // 既存 production 経路（review plan）の答えとの突合。ここを自前の
    // merge-base 計算と比べると自己整合になる。
    assert.deepEqual(skillsFileSet(skills.stdout), planFiles);
    assert.deepEqual(planFiles, ['b.ts', 'c.ts']);
  });

  test('skills は --base 無指定ならデフォルトブランチ（= HEAD）基準のままで差分ゼロ', async () => {
    // #2051 以前は --base の有無にかかわらずこの結果になっていた。この行が
    // 「--base を読むようになった」ことの対照群にあたる。
    const skills = await runSkills(dir, []);
    assert.equal(skills.code, 0, skills.stderr);
    assert.deepEqual(skillsFileSet(skills.stdout), []);
  });

  test('run --base <ref> が review plan と同じ merge base を使う', async () => {
    const plan = await runPlan(dir, ['--base', base0]);
    const run = await runRun(dir, ['--base', base0]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(runHeaderField(run.stdout, 'Merge base'), plan.artifact.context.mergeBase);
    assert.equal(runHeaderField(run.stdout, 'Merge base'), base0);
  });

  // ---------------------------------------------------------------------------
  // 4. 共有履歴のない ref
  // ---------------------------------------------------------------------------
  test('共有履歴のない ref は 3 面とも警告を出し、exit 0 のまま', async () => {
    // 作業ツリーを触らずに親を持たない commit を作る（`checkout --orphan` は
    // 作業ツリーを巻き込み、以降のテストの前提を壊すため使わない）。
    // 親が無い = HEAD と共有履歴が無いので、rev-parse は通るが merge-base は
    // 無く、findMergeBase が HEAD へ落ちる形になる。
    const treeSha = await revParse(dir, 'HEAD^{tree}');
    const { stdout: orphanOut } = await runGit(['commit-tree', treeSha, '-m', 'orphan'], dir);
    const orphanSha = orphanOut.trim();

    const plan = await runPlan(dir, ['--base', orphanSha]);
    const skills = await runSkills(dir, ['--base', orphanSha]);
    const run = await runRun(dir, ['--base', orphanSha]);

    for (const [surface, res] of [
      ['review plan', plan],
      ['skills', skills],
      ['run', run],
    ]) {
      assert.equal(res.code, 0, `${surface}: ${res.stderr}`);
      assert.ok(
        res.stderr.includes('shares no history with HEAD'),
        `${surface} が共有履歴なしを警告していない: ${res.stderr}`
      );
      // #2067 negative: orphan 側に子孫用の文言が混ざらないこと。
      assert.ok(
        !res.stderr.includes('is ahead of HEAD'),
        `${surface} が orphan を「HEAD より先」と誤診断している: ${res.stderr}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 5. #2067: HEAD の子孫を --base に渡した場合
  // ---------------------------------------------------------------------------
  test('HEAD の子孫を --base に渡すと 3 面とも「HEAD より先」と警告し、共有履歴なしとは断定しない', async () => {
    // HEAD を親に持つ commit を作る。作業ツリーと現在のブランチは動かさない
    // （`commit-tree` は ref を更新しない）ので、以降のテストの前提を壊さない。
    // 履歴は共有している（HEAD がその祖先）が、`merge-base HEAD <ref>` は
    // 正しく HEAD を返すため range は空になる。
    const headSha = await revParse(dir, 'HEAD');
    const treeSha = await revParse(dir, 'HEAD^{tree}');
    const { stdout: descendantOut } = await runGit(
      ['commit-tree', treeSha, '-p', headSha, '-m', 'descendant'],
      dir
    );
    const descendantSha = descendantOut.trim();

    const plan = await runPlan(dir, ['--base', descendantSha]);
    const skills = await runSkills(dir, ['--base', descendantSha]);
    const run = await runRun(dir, ['--base', descendantSha]);

    for (const [surface, res] of [
      ['review plan', plan],
      ['skills', skills],
      ['run', run],
    ]) {
      // 空 range の告知自体は正しいので、非 fatal のまま維持する（Non-goal）。
      assert.equal(res.code, 0, `${surface}: ${res.stderr}`);
      assert.ok(
        res.stderr.includes('is ahead of HEAD (HEAD is an ancestor of it)'),
        `${surface} が「HEAD より先」と説明していない: ${res.stderr}`
      );
      // 本 Issue の本体: 履歴は共有しているので、この断定は誤りである。
      assert.ok(
        !res.stderr.includes('shares no history with HEAD'),
        `${surface} が子孫を「共有履歴なし」と誤って断定した: ${res.stderr}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 6. #2071: `origin/<ref>` と `<ref>` が別 commit を指す場合
  // ---------------------------------------------------------------------------
  //
  // `resolveRefToCommit`（rev-parse）と `findMergeBase`（merge-base）は同じ候補
  // 順（`origin/<ref>` → `<ref>`）を独立に歩くが、述語が違うため別候補を採り
  // うる。その場合 #2067 の向き判定が **mergeBase の出所とは別の commit** に
  // ついて答え、子孫を「共有履歴なし」と誤断定していた。
  //
  // `update-ref` は作業ツリーも現在のブランチも動かさないので、以降のテストの
  // 前提を壊さずに「remote 側と local 側が食い違う ref」を作れる。
  /**
   * `origin/<name>` と `<name>` に別 commit を割り当てる。
   *
   * @param {string} name ref 名
   * @param {string} originSha `refs/remotes/origin/<name>` に置く commit
   * @param {string} localSha `refs/heads/<name>` に置く commit
   */
  async function makeSplitRef(name, originSha, localSha) {
    await runGit(['update-ref', `refs/remotes/origin/${name}`, originSha], dir);
    await runGit(['update-ref', `refs/heads/${name}`, localSha], dir);
  }

  /** 親を持たない commit（HEAD と共有履歴なし）を message 違いで作る。 */
  async function makeOrphan(message) {
    const treeSha = await revParse(dir, 'HEAD^{tree}');
    const { stdout } = await runGit(['commit-tree', treeSha, '-m', message], dir);
    return stdout.trim();
  }

  /** HEAD を親に持つ commit（HEAD の子孫）を作る。 */
  async function makeDescendant(message) {
    const headSha = await revParse(dir, 'HEAD');
    const treeSha = await revParse(dir, 'HEAD^{tree}');
    const { stdout } = await runGit(['commit-tree', treeSha, '-p', headSha, '-m', message], dir);
    return stdout.trim();
  }

  for (const [label, name, originIsOrphan] of [
    ['origin/<ref> が orphan・<ref> が HEAD の子孫', 'split-origin-orphan', true],
    ['origin/<ref> が HEAD の子孫・<ref> が orphan', 'split-origin-descendant', false],
  ]) {
    test(`#2071: ${label} でも 3 面とも「HEAD より先」と警告する`, async () => {
      const orphanSha = await makeOrphan(`orphan-${name}`);
      const descendantSha = await makeDescendant(`descendant-${name}`);
      await makeSplitRef(
        name,
        originIsOrphan ? orphanSha : descendantSha,
        originIsOrphan ? descendantSha : orphanSha
      );

      const plan = await runPlan(dir, ['--base', name]);
      const skills = await runSkills(dir, ['--base', name]);
      const run = await runRun(dir, ['--base', name]);

      for (const [surface, res] of [
        ['review plan', plan],
        ['skills', skills],
        ['run', run],
      ]) {
        assert.equal(res.code, 0, `${surface}: ${res.stderr}`);
        // mergeBase は「HEAD の子孫」側の候補から来ている。警告文もその出所に
        // ついて語らなければならない。
        assert.ok(
          res.stderr.includes('is ahead of HEAD (HEAD is an ancestor of it)'),
          `${surface} が mergeBase の出所と整合していない: ${res.stderr}`
        );
        assert.ok(
          !res.stderr.includes('shares no history with HEAD'),
          `${surface} が別候補について「共有履歴なし」と誤断定した: ${res.stderr}`
        );
      }
    });
  }

  test('#2071 negative: 両候補とも orphan なら「共有履歴なし」のまま', async () => {
    // 対照群。上の 2 件だけだと「分岐したら常に子孫扱い」でも緑になる。
    const name = 'split-both-orphan';
    await makeSplitRef(name, await makeOrphan('orphan-a'), await makeOrphan('orphan-b'));

    const plan = await runPlan(dir, ['--base', name]);
    const skills = await runSkills(dir, ['--base', name]);
    const run = await runRun(dir, ['--base', name]);

    for (const [surface, res] of [
      ['review plan', plan],
      ['skills', skills],
      ['run', run],
    ]) {
      assert.equal(res.code, 0, `${surface}: ${res.stderr}`);
      assert.ok(
        res.stderr.includes('shares no history with HEAD'),
        `${surface} が共有履歴なしを警告していない: ${res.stderr}`
      );
      assert.ok(
        !res.stderr.includes('is ahead of HEAD'),
        `${surface} が orphan を「HEAD より先」と誤診断している: ${res.stderr}`
      );
    }
  });

  test('HEAD の祖先を --base に渡した通常形では空 range の警告が 3 面とも出ない', async () => {
    // 対照群。この行が無いと「常に警告を出す」実装でも上の 2 テストが緑になる。
    const plan = await runPlan(dir, ['--base', base0]);
    const skills = await runSkills(dir, ['--base', base0]);
    const run = await runRun(dir, ['--base', base0]);

    for (const [surface, res] of [
      ['review plan', plan],
      ['skills', skills],
      ['run', run],
    ]) {
      assert.equal(res.code, 0, `${surface}: ${res.stderr}`);
      assert.ok(
        !res.stderr.includes('is ahead of HEAD'),
        `${surface} が通常の base で子孫警告を出した: ${res.stderr}`
      );
      assert.ok(
        !res.stderr.includes('shares no history with HEAD'),
        `${surface} が通常の base で共有履歴なし警告を出した: ${res.stderr}`
      );
    }
  });
});
