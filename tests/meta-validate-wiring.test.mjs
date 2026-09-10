import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `npm run meta:validate` の**配線**を pin する（#2055 のレビュー指摘 major 2）。
//
// 背景: meta:validate は `&&` で連ねた 1 本の文字列で、そこから
// `&& node scripts/check-<なにか>.mjs` を 1 トークン削除すると、その gate は
// 完全に無効化されるのに **テストも CI も全部緑のまま**になる。実測（2026-09-04）:
// 配線を外したうえで生 NUL を index に置いた状態で `meta:validate` が exit 0、
// 当該 gate の単体テスト 11 件も全部 pass した。
// memory `feedback_tests_one_layer_inside_miss_wiring`（テストが 1 層内側を直接呼ぶと
// 配線層が無検査になる）そのものの形なので、配線そのものを検査する。
//
// なぜ「scripts/check-*.mjs を全部含む」という不変条件にしないか:
//   実測すると scripts/check-*.mjs は 9 本あり、そのうち meta:validate に入るのは
//   check-doc-enumerations / check-sidebar-reachability / check-vocabulary-literals /
//   check-control-characters の 4 本だけ。残りは lint:code や別の npm script に属する
//   （check-code-hygiene は lint:code、check-bilingual-pairs / check-comment-disposition /
//   check-doc-placement / check-skill-id-references はそれぞれ別 script）。
//   つまり「どの検査が meta:validate に属するか」は測れる実体ではなく方針判断なので、
//   期待値をここに明示列挙して pin する。
//
// 更新手順: meta:validate の連鎖を変えたら、この配列を同じ PR で更新する。
// 配列を減らすだけでテストが通ってしまわないよう、順序と件数もあわせて検査している。
const EXPECTED_META_VALIDATE_STEPS = Object.freeze([
  'node scripts/validate-meta-consistency.mjs',
  'node scripts/check-doc-enumerations.mjs',
  'node scripts/check-sidebar-reachability.mjs',
  'node scripts/check-vocabulary-literals.mjs',
  'node scripts/check-control-characters.mjs',
  'node scripts/generate-skill-catalog.mjs --check',
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function metaValidateSteps() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts?.['meta:validate'];
  assert.equal(typeof script, 'string', 'package.json に meta:validate が無い');
  return script.split('&&').map((step) => step.trim());
}

test('meta:validate の連鎖が期待どおり（gate の配線が外れていない）', () => {
  assert.deepEqual(
    metaValidateSteps(),
    [...EXPECTED_META_VALIDATE_STEPS],
    'meta:validate の連鎖が変わっている — 意図した変更なら ' +
      'tests/meta-validate-wiring.test.mjs の EXPECTED_META_VALIDATE_STEPS を同じ PR で更新すること'
  );
});

test('meta:validate が参照する script が実在する', () => {
  for (const step of metaValidateSteps()) {
    const match = /^node\s+(\S+)/.exec(step);
    assert.ok(match, `解析できない step: ${step}`);
    assert.ok(existsSync(join(ROOT, match[1])), `${match[1]} が存在しない`);
  }
});
