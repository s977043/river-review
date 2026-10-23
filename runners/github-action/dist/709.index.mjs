export const id = 709;
export const ids = [709];
export const modules = {

/***/ 6709:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PromptComparisonError: () => (/* binding */ PromptComparisonError),
/* harmony export */   buildPromptAbComparison: () => (/* binding */ buildPromptAbComparison),
/* harmony export */   buildPromptComparison: () => (/* binding */ buildPromptComparison),
/* harmony export */   formatPromptAbMarkdown: () => (/* binding */ formatPromptAbMarkdown),
/* harmony export */   formatPromptComparisonMarkdown: () => (/* binding */ formatPromptComparisonMarkdown)
/* harmony export */ });
/* unused harmony exports PROMPT_COMPARISON_SCHEMA_VERSION, PROMPT_AB_SCHEMA_VERSION, PROMPT_COMPARE_ROUTE, PROMPT_AB_ROUTE, PROMPT_AB_UNBLOCKED_BY, LATENCY_COST_UNBLOCKED_BY, LEGACY_CONFIG_ID, compiledConfigId, ACCEPTANCE_COVERAGE, extractPromptCompilerObservation, buildPromptComparisonSpec, PROMPT_AB_ACCEPTANCE_COVERAGE, PROMPT_AB_UNPINNED_CONDITIONS, resolveAbAcceptanceCoverage, buildPromptAbSpec */
/* harmony import */ var _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3077);
/* harmony import */ var _paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(3080);
/* harmony import */ var _shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(4029);
// legacy と compiled の paired 比較導線（ADR-006 / #1860、#1858 の子タスク 3）
//
// `review.promptCompiler.mode = 'observe'` で走った run が
// `debug.execution.promptCompiler` に残した観測を、legacy 側 / compiled 側の
// 2 系統として取り出し、既存の Experiment Manifest（`./paired-replay.mjs`、
// #1574 P2）へ流す。
//
// ── 比較機構は作らない ───────────────────────────────────────────────
// Experiment Manifest の生成と検証（契約3）、case ごとの findings 突合、
// profile 別受入基準の評価（契約6）は `./paired-replay.mjs` が実装済みである。
// ここはその executor 側であり、突合そのものは buildPairedReplay に委譲する。
// case key / run id / 正規化も同モジュールと SSoT から import する。
//
// ── 何を 2 系統として取り出すか（実測に基づく設計判断）────────────────
// observe は 1 回の run で legacy と compiled の **両方の指紋**
// （legacyPromptHash / compiledPromptHash と両者の推定長）を同時に記録する。
// したがってプロンプト水準の比較に 2 回の run は要らない。実測（node で
// generateReview → buildRunRecord を通した結果）でも、保存済み run レコード
// 1 件が両側の hash と推定長を持つことを確認している。
//
// 一方で compiled 側の **findings は存在しない**。observe は compiled prompt を
// provider へ送らないためである（ADR-006 の observe 不変条件、および
// `src/lib/review-engine.mjs` が observe で記録する `sentPrompt: 'legacy'`）。
// よって recall / precision / parse 成功率 / Evidence 充足のような
// 「LLM の応答」を要する受入基準は、この導線では観測できない。#1861 で配線した
// `active` の run は sentPrompt が `compiled` になり、下の受け入れ条件が弾く。
//
// この非対称を、測れたことにせず構造として表に出す:
//   - プロンプト水準（指紋・推定長・profile 来歴）は `promptMetrics` に出す
//   - findings 水準は `findingComparison.observable = false` と理由で出す
//   - ADR-006 の受入基準表は `acceptanceCoverage` に 1 行ずつ観測可否で出す
//   - spec は acceptance profile を宣言しない。宣言すると空集合に対する
//     vacuous pass を「基準を満たした」と読ませる余地が生まれる
//
// ── 2 系統の run を受け取る姉妹導線（#1880）────────────────────────────
// 上の非対称は observe の run にだけ当てはまる。`active` の run
// （`sentPrompt: 'compiled'`）が保存されている場合は、legacy を送った run と
// compiled を送った run を **別々のレコードとして** 2 系統に置けるため、
// findings 水準の突合が成立する。その入口が `buildPromptAbComparison` であり、
// CLI では `river evolve prompt-ab` として露出する。
//
// 上の `sentPrompt !== 'legacy'` 拒否は #1860 が意図して置いた安全弁であり、
// #1880 でも緩めない。observe の run は 1 レコードから両側を導出するため、
// そこへ compiled を送った run を混ぜると `legacyPromptHash` の指す対象が run
// ごとに変わり、paired diff の意味が壊れる。#1880 は拒否を回避するのではなく、
// **2 系統を明示的に受け取る別の入口**を足すことで成立させている。
// 取り違え防止は次の 3 点を構造として持つことで行う:
//   - `mode` / `route` / `sameRecordOnBothSides` を成果物に出す
//     （observe 経路は true、A/B 経路は false）
//   - A/B 経路は compiled 側の run が 0 件なら受理しない（observe の dataset を
//     A/B として報告しない）
//   - observe 経路は従来どおり compiled 側の run が 1 件でもあれば拒否する
//
// ── 非ゴール ─────────────────────────────────────────────────────────
// automatic canary / 自動 Keep-Rollback / 自動昇格。`./paired-replay.mjs`
// 冒頭が #1574 の採否コメントで確定した非ゴールとして記録しており、ADR-006 も
// これを踏襲する。`decision` は常に null、`applied` は常に false である。
// この導線は LLM も provider も呼ばない。副作用は戻り値だけである。




/**
 * observe 経路の成果物 schema 版。
 *
 * #1880 で 2 へ上げた。取り違え防止のための 3 フィールド（`route` /
 * `sameRecordOnBothSides` / `sides.<side>.sentPrompt`）を足したためである。
 * これらは「どちらの経路で測ったか」を判別させるための項目なので、版で
 * 区別できないと下流が古い形と新しい形を見分けられない。
 */
const PROMPT_COMPARISON_SCHEMA_VERSION = 2;

/** 2 系統（legacy 送信 / compiled 送信）を受け取る A/B 経路の schema 版（#1880）。 */
const PROMPT_AB_SCHEMA_VERSION = 1;

/** observe の run だけを扱う経路の識別子。成果物の `route` に出る。 */
const PROMPT_COMPARE_ROUTE = 'river evolve prompt-compare';

/** 2 系統の run を扱う経路の識別子。成果物の `route` に出る。 */
const PROMPT_AB_ROUTE = 'river evolve prompt-ab';

/**
 * observe 経路の `ACCEPTANCE_COVERAGE` が「いつ解けるか」の答え（#1880）。
 *
 * #1861 で active は配線済みである。したがって解消条件はもはや配線ではなく、
 * active の run を candidate 側へ置く 2 系統の比較経路そのものである。
 * この文字列は「observe 経路では測れない」という事実の解消先を指すだけであり、
 * A/B 経路で全指標が測れることを意味しない。A/B 経路側で何が測れて何が測れない
 * かは `PROMPT_AB_ACCEPTANCE_COVERAGE` が 1 行ずつ持つ。
 */
const PROMPT_AB_UNBLOCKED_BY = `${PROMPT_AB_ROUTE}（#1880 の 2 系統経路）`;

/**
 * `latency / cost` だけの解消条件。
 *
 * 他の 7 行は candidate 側の findings が存在しないことが理由なので A/B 経路が
 * 解消先になるが、この行は run レコードが所要時間も課金も持たないことが理由で
 * あり、2 系統を揃えても解けない。observe 側と A/B 側の両表で同じ値を使う。
 */
const LATENCY_COST_UNBLOCKED_BY = 'run レコードへの latency / cost の記録';

/** baseline 側（既存プロンプト）の構成識別子。 */
const LEGACY_CONFIG_ID = 'prompt:legacy';

/** candidate 側の構成識別子を profile 来歴から組む。 */
function compiledConfigId({ profileId, profileVersion }) {
  return `prompt:compiled/${profileId}@${profileVersion}`;
}

class PromptComparisonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptComparisonError';
  }
}

/**
 * ADR-006 の受入基準表を、この導線で観測できるか / できないかで 1 行ずつ持つ。
 *
 * 「埋められない項目を落とす」のではなく「なぜ今は測れないか」を残す。
 * 落とすと、測っていない基準が満たされたものとして読まれる。
 */
const ACCEPTANCE_COVERAGE = Object.freeze(
  [
    {
      metric: 'should-detect recall',
      observable: false,
      reason:
        'compiled prompt を送った run が存在しないため candidate 側の findings が無い（observe は compiled を provider へ送らない）',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'should-not-detect precision',
      observable: false,
      reason: 'recall と同じ理由で candidate 側の findings が無い',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'parse 成功率',
      observable: false,
      reason: 'compiled prompt に対する LLM 応答が無く、parse の対象が存在しない',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'Evidence / Fix の充足',
      observable: false,
      reason: 'candidate 側の findings が無いため充足度を数える対象が存在しない',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'invalid ArtifactRefs',
      observable: false,
      reason: 'candidate 側の findings が無いため ArtifactRef の検査対象が存在しない',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'duplicate findings',
      observable: false,
      reason: 'candidate 側の findings が無いため重複を数える対象が存在しない',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'critical 回帰',
      observable: false,
      reason:
        '両側の run が同一のため paired diff は構造上つねに差分 0 になる。この 0 は「回帰が無い」ではなく「観測していない」である',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
    },
    {
      metric: 'token（送信前のプロンプト推定長）',
      observable: true,
      reason: 'observe が legacy / compiled 双方の推定長を 1 run で記録するため観測できる',
      unblockedBy: null,
    },
    {
      metric: 'latency / cost',
      observable: false,
      reason: 'compiled prompt を送っていないため所要時間も課金も発生しておらず、計測対象が無い',
      // この 1 行だけは A/B 経路が解消先ではない。2 系統を揃えても run レコードは
      // 所要時間も課金も持たないため（`buildRunRecord`、`src/lib/result-store.mjs`）、
      // `PROMPT_AB_ACCEPTANCE_COVERAGE` の同じ行と同一の解消条件にしてある。
      unblockedBy: LATENCY_COST_UNBLOCKED_BY,
    },
  ].map((row) => Object.freeze(row))
);

/** observe の観測が必ず持つフィールド（src/lib/review-engine.mjs の記録）。 */
const REQUIRED_OBSERVATION_FIELDS = Object.freeze([
  'mode',
  'sentPrompt',
  'compilerVersion',
  'profileId',
  'profileVersion',
  'legacyPromptEstimate',
  'compiledPromptEstimate',
  'legacyPromptHash',
  'compiledPromptHash',
]);

function compareStrings(a, b) {
  const left = a ?? '';
  const right = b ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}

function runLabel(record) {
  return (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_2__/* .deriveReviewRunId */ .Kh)(record) ?? '(run id 未取得)';
}

/**
 * 保存済み run レコードから Prompt Compiler の観測を取り出す。
 *
 * 観測が無い run（mode=off で走った run、Prompt Compiler 導入前の run）は
 * `null` を返す。観測はあるが欠けたフィールドがある run は投げる — 黙って
 * 落とすと、比較対象から外れたことが誰にも見えないまま集計が縮む。
 *
 * @param {object|null|undefined} record 保存済み run レコード
 * @returns {object|null}
 */
function extractPromptCompilerObservation(record) {
  const observation = record?.debug?.execution?.promptCompiler;
  if (observation == null) return null;
  if (typeof observation !== 'object' || Array.isArray(observation)) {
    throw new PromptComparisonError(
      `run ${runLabel(record)} の debug.execution.promptCompiler がオブジェクトではない。`
    );
  }
  const missing = REQUIRED_OBSERVATION_FIELDS.filter((field) => observation[field] == null);
  if (missing.length) {
    throw new PromptComparisonError(
      `run ${runLabel(record)} の Prompt Compiler 観測に必須フィールドが無い: ${missing.join(', ')}。`
    );
  }
  return observation;
}

function requireSingleValue(values, label, hint) {
  const distinct = [...new Set(values.filter((value) => value != null))].sort(compareStrings);
  if (distinct.length > 1) {
    throw new PromptComparisonError(
      `${label} が run ごとに異なる（${distinct.join(' / ')}）。${hint}`
    );
  }
  return distinct[0] ?? null;
}

/**
 * 観測付きの run を entry 形へ揃えて集める（両経路の共通部分、#1880）。
 *
 * `sentPrompt` による選別も構成の単一性検査もここでは行わない。observe 経路と
 * A/B 経路で前提が違うためである。共通なのは「観測を取り出し、run id と
 * case key を SSoT から導出し、入力順に依存しない順序へ揃える」ところまでで、
 * case key は `deriveCaseKey`（`./paired-replay.mjs`）をそのまま使う。
 *
 * `llmUsed` / `llmSkipped` も同時に取り出す（#1880 B1）。`sentPrompt` は
 * `src/prompt/compiler-stage.mjs:57-62` のコメントが明示するとおり **mode から
 * 決まる値**であり、実際に送信が起きたかどうかは表さない。dryRun / offline /
 * provider 非対応 / API キー未設定では `src/lib/review-engine.mjs` の
 * `skipReason` が LLM 呼び出しを丸ごと飛ばし、`debug.llmUsed = false` と
 * `debug.llmSkipped = <理由>` だけが残る。応答の有無はこの 2 つが持つ。
 *
 * `llmUsed === true` は「findings が LLM 応答に由来する」ことを意味する。
 * 呼び出したが応答を parse できなかった場合も `llmUsed` は false になり、
 * findings は heuristics 由来へ落ちる（同ファイルの `llmError` 分岐）。
 * したがって「応答があったか」の判定はこの 1 値で足りる。
 *
 * @param {object[]} runRecords 保存済み run レコード
 * @param {{ emptyDatasetMessage?: string }} [options]
 * @returns {{ observed: object[], withoutObservation: string[] }}
 */
function collectObservationEntries(runRecords, { emptyDatasetMessage } = {}) {
  const records = Array.isArray(runRecords) ? runRecords : [];
  const observed = [];
  const withoutObservation = [];
  for (const record of records) {
    const observation = extractPromptCompilerObservation(record);
    if (!observation) {
      withoutObservation.push(runLabel(record));
      continue;
    }
    observed.push({
      record,
      observation,
      runId: (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_2__/* .deriveReviewRunId */ .Kh)(record),
      caseKey: (0,_paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__/* .deriveCaseKey */ .XZ)(record),
      // `true` / `false` / `null`（未取得）の 3 値。`llmUsed` を持たない古い
      // レコードを false と読むと「応答が無かった」と断定することになるので、
      // 未取得は別に数える（`provenance.dirtyUnknownRunCount` と同じ扱い）。
      llmUsed: typeof record?.debug?.llmUsed === 'boolean' ? record.debug.llmUsed : null,
      llmSkipped: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(record?.debug?.llmSkipped),
    });
  }
  // 入力順に依存しない。spec（両側の runs / declaredEvidence）まで含めて
  // 同じ入力集合なら常に同じ成果物になる。
  observed.sort((a, b) => compareStrings(a.runId, b.runId) || compareStrings(a.caseKey, b.caseKey));
  if (observed.length === 0) {
    throw new PromptComparisonError(
      emptyDatasetMessage ??
        'Prompt Compiler の観測を持つ run が 1 件も無い。`review.promptCompiler.mode` を `observe` にしてレビューを実行し、run を保存してから再実行すること（既定は off）。'
    );
  }
  // ソートは 1 回だけ行う。呼び出し側で再度ソートしない。
  return { observed, withoutObservation: withoutObservation.sort(compareStrings) };
}

/**
 * 観測付きの run を集め、構成が単一であることを確かめる。
 *
 * 同一 fixture・同一モデル・同一 context・同一 skills が本タスクの前提である。
 * provider / model / profile が混ざった集合をそのまま 1 実験として畳むと、
 * manifest が pin する構成と実際の run が食い違う。
 */
function collectObservedRuns(runRecords) {
  const { observed, withoutObservation } = collectObservationEntries(runRecords);

  // 送信物が legacy でない run は、この導線の前提（両側の findings が legacy 由来）を
  // 壊す。#1861 で active が配線された時点で静かに誤った比較を出すより、ここで
  // 止めて導線を見直させる。#1880 でもこの拒否は緩めない（安全弁の削除ではなく
  // 別入口の追加で 2 系統を扱う）。
  const nonLegacy = observed.filter((entry) => entry.observation.sentPrompt !== 'legacy');
  if (nonLegacy.length) {
    throw new PromptComparisonError(
      `sentPrompt が legacy でない run が ${nonLegacy.length} 件ある（${[
        ...new Set(nonLegacy.map((entry) => entry.observation.sentPrompt)),
      ]
        .sort(compareStrings)
        .join(
          ' / '
        )}）。compiled を実際に送った run は findings 水準で比較できるため、この導線ではなく #1861 で配線した active の run 用の経路（\`${PROMPT_AB_ROUTE}\`、#1880）で扱うこと。`
    );
  }

  const profileId = requireSingleValue(
    observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.observation.profileId)),
    'profileId',
    '同一 profile の run だけを渡すこと。'
  );
  const profileVersion = requireSingleValue(
    observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(String(entry.observation.profileVersion))),
    'profileVersion',
    '同一 profile version の run だけを渡すこと。'
  );
  const compilerVersion = requireSingleValue(
    observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(String(entry.observation.compilerVersion))),
    'compilerVersion',
    '同一 compiler version の run だけを渡すこと。'
  );
  const provider = requireSingleValue(
    observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.debug?.llmProvider)),
    'provider',
    '同一 provider の run だけを渡すこと。'
  );
  const model = requireSingleValue(
    observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.debug?.llmModel)),
    'model',
    '同一モデルの run だけを渡すこと。'
  );

  return {
    // m4: ソートは collectObservationEntries が済ませている。二度目は不要である。
    observed,
    withoutObservation,
    configuration: { profileId, profileVersion, compilerVersion, provider, model },
  };
}

/**
 * 既存の Experiment Manifest（契約3）へ渡す experiment spec を組む。
 *
 * 両側の `runs` は **同じ run レコード**である。observe では compiled prompt を
 * 送っていないため、compiled 側に固有の run は存在しない。findings が空の
 * ダミー run を candidate 側に置くと「compiled は何も検出しなかった」という
 * 観測していない主張になるので、それはしない。
 *
 * 構成の差は `configId` が担う。これにより `buildPairedReplay` の
 * activation check は `configurationDiffers = true` かつ
 * `observedDifference = false` となり、`verified = false` を理由付きで返す。
 * 「変更経路が発火した証跡を観測できない」という既存の判定が、この導線の
 * 状態そのものである。
 *
 * @param {{ runRecords: object[], hypothesis?: string|null }} input
 * @returns {object} buildPairedReplay に渡せる spec
 */
function buildPromptComparisonSpec({ runRecords, hypothesis = null } = {}) {
  const { observed, withoutObservation, configuration } = collectObservedRuns(runRecords);
  const records = observed.map((entry) => entry.record);
  const { profileId, profileVersion, compilerVersion, provider, model } = configuration;
  // 両側でレビュー実行コードは同一である（1 プロセスが両方のプロンプトを組む）。
  // 構成差は configId だけが持つ、というのがこの実験の実際の形である。
  const commitSha = `river-prompt-compiler@${compilerVersion}`;
  const side = (configId) => ({
    commitSha,
    configId,
    provider,
    model,
    temperature: null,
    runs: records,
  });
  return {
    hypothesis:
      hypothesis ??
      'compiled prompt は legacy prompt と同じ判断入力から生成される（ADR-006 の不変条件）。品質水準の比較は #1861 まで観測できない。',
    baseline: side(LEGACY_CONFIG_ID),
    candidate: side(compiledConfigId({ profileId, profileVersion })),
    metrics: { denominator: 'paired-case' },
    activation: {
      expectedSignal:
        'compiled prompt を送信した run の findings。observe では取得できないため、activation は verified にならない',
      declaredEvidence: observed.map((entry) => entry.runId).filter(Boolean),
    },
    environment: {
      promptCompilerModes: [...new Set(observed.map((entry) => entry.observation.mode))].sort(
        compareStrings
      ),
      compilerVersion,
      profileId,
      profileVersion,
      runsWithoutObservation: withoutObservation.length,
    },
    // profile を宣言しない。findings 水準を観測できない状態で基準を宣言すると、
    // 差分 0 の paired diff が「基準を満たした」と読まれる（vacuous pass）。
    acceptance: { profiles: [] },
    trials: { trialCount: 1 },
  };
}

/** run ごとのプロンプト水準の比較値。observe が記録した値をそのまま使う。 */
function promptRowOf(entry) {
  const o = entry.observation;
  return {
    runId: entry.runId,
    caseKey: entry.caseKey,
    profileId: o.profileId,
    profileVersion: o.profileVersion,
    mode: o.mode,
    legacyPromptHash: o.legacyPromptHash,
    compiledPromptHash: o.compiledPromptHash,
    // 指紋が一致する = その profile の描画が legacy とバイト単位で同じである。
    // generic profile は legacy と同一描画になるため、一致自体は異常ではない。
    promptsIdentical: o.legacyPromptHash === o.compiledPromptHash,
    legacyPromptEstimate: o.legacyPromptEstimate,
    compiledPromptEstimate: o.compiledPromptEstimate,
    // 推定長は src/lib/token-estimator.mjs の estimateTokens が run 時に出した
    // 値である。ここで数え直さない（単位が食い違う）。
    estimateDelta: o.compiledPromptEstimate - o.legacyPromptEstimate,
  };
}

function summarizePromptMetrics(observed, withoutObservation, configuration) {
  const rows = observed.map(promptRowOf).sort((a, b) => compareStrings(a.runId, b.runId));
  const legacyTotal = rows.reduce((acc, row) => acc + row.legacyPromptEstimate, 0);
  const compiledTotal = rows.reduce((acc, row) => acc + row.compiledPromptEstimate, 0);
  return {
    ...configuration,
    observedRunCount: rows.length,
    runsWithoutObservation: withoutObservation,
    identicalPromptRunCount: rows.filter((row) => row.promptsIdentical).length,
    divergentPromptRunCount: rows.filter((row) => !row.promptsIdentical).length,
    legacyPromptEstimateTotal: legacyTotal,
    compiledPromptEstimateTotal: compiledTotal,
    estimateDeltaTotal: compiledTotal - legacyTotal,
    runs: rows,
    note: 'プロンプト推定長は送信前の推定であり、品質の代理指標ではない。「prompt token が減ったから採用」という判定は ADR-006 が禁じている。',
  };
}

/**
 * legacy と compiled の paired 比較を組む。
 *
 * 純関数である。I/O を持たず、時計は注入する。LLM も provider も呼ばない。
 *
 * @param {{ runRecords: object[], now?: Date, hypothesis?: string|null }} input
 * @returns {object}
 */
function buildPromptComparison({ runRecords, now = new Date(), hypothesis = null } = {}) {
  const { observed, withoutObservation, configuration } = collectObservedRuns(runRecords);
  const spec = buildPromptComparisonSpec({ runRecords, hypothesis });
  // 突合・manifest・受入評価はすべて #1574 P2 の実装に委譲する。
  const replay = (0,_paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__.buildPairedReplay)(spec, { now });
  return {
    schemaVersion: PROMPT_COMPARISON_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    mode: 'prompt-compiler-paired',
    // どちらの経路で測ったかを成果物だけで判別できるようにする（#1880）。
    // A/B 経路（`prompt-compiler-ab`）の成果物と取り違えると、差分 0 の意味が
    // 「観測していない」から「回帰が無い」へ黙って読み替わる。
    route: PROMPT_COMPARE_ROUTE,
    // この経路は 1 レコードから両側を導出する。A/B 経路では false になる。
    sameRecordOnBothSides: true,
    readOnly: true,
    sides: {
      baseline: {
        configId: spec.baseline.configId,
        sentPrompt: 'legacy',
        label: 'legacy prompt（buildPrompt）',
      },
      candidate: {
        configId: spec.candidate.configId,
        // observe は compiled を送らないため、candidate 側の run が実際に送った
        // のも legacy である。`sentPrompt` は「そのレコードが何を送ったか」であり、
        // configId が指す比較対象とは別物である。
        sentPrompt: 'legacy',
        label: `compiled prompt（profile ${configuration.profileId}@${configuration.profileVersion}）`,
      },
    },
    promptMetrics: summarizePromptMetrics(observed, withoutObservation, configuration),
    findingComparison: {
      observable: false,
      reason:
        'observe は compiled prompt を provider へ送らないため、compiled 側の findings が存在しない。両側の run は同一であり、paired diff の差分 0 は「回帰が無い」ではなく「観測していない」である。',
      unblockedBy: PROMPT_AB_UNBLOCKED_BY,
      // 既存モジュール側の判定を再実装せず、その結論を指し示す。
      activationVerified: replay.activationCheck.verified,
      activationReasons: replay.activationCheck.reasons,
    },
    acceptanceCoverage: [...ACCEPTANCE_COVERAGE],
    spec,
    replay,
    // 非ゴールを成果物側でも明示する。
    decision: null,
    applied: false,
    autoPromotion: false,
    requiresHumanJudgment: true,
    writeEffects: [],
  };
}

/**
 * 人が読む Markdown。観測できない基準を先に出す。
 *
 * 順序に意味がある。paired replay の表を先に出すと、差分 0 の行が「回帰なし」と
 * 読まれる。
 */
function formatPromptComparisonMarkdown(result) {
  const p = result.promptMetrics;
  const lines = ['## Prompt Compiler paired comparison (read-only)', ''];
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Route | \`${result.route}\`（observe の run 専用） |`);
  lines.push(`| Baseline | \`${result.sides.baseline.configId}\`（sentPrompt legacy） |`);
  lines.push(`| Candidate | \`${result.sides.candidate.configId}\`（sentPrompt legacy） |`);
  lines.push('| 両側が同一レコードか | はい（1 run から両側の指紋を導出） |');
  lines.push(`| Provider / Model | ${p.provider ?? '(未取得)'} / ${p.model ?? '(未取得)'} |`);
  lines.push(`| Observed runs | ${p.observedRunCount} |`);
  lines.push(`| Runs without observation | ${p.runsWithoutObservation.length} |`);
  lines.push(`| Manifest | \`${result.replay.manifest.manifestId}\` |`);
  lines.push('');

  lines.push('### 観測できない受入基準（ADR-006）');
  lines.push('');
  lines.push('| Metric | 観測 | 理由 |');
  lines.push('|---|---|---|');
  for (const row of result.acceptanceCoverage) {
    lines.push(`| ${row.metric} | ${row.observable ? '可' : '不可'} | ${row.reason} |`);
  }
  lines.push('');
  lines.push(`- findings 水準の比較: 不可。${result.findingComparison.reason}`);
  lines.push(`- 解消条件: ${result.findingComparison.unblockedBy}`);
  lines.push('');

  lines.push('### プロンプト水準（観測できる範囲）');
  lines.push(
    `- profile: \`${p.profileId}@${p.profileVersion}\` / compiler \`${p.compilerVersion}\``
  );
  lines.push(
    `- 推定長合計: legacy ${p.legacyPromptEstimateTotal} → compiled ${p.compiledPromptEstimateTotal}（差 ${p.estimateDeltaTotal}）`
  );
  lines.push(
    `- 指紋一致 ${p.identicalPromptRunCount} 件 / 相違 ${p.divergentPromptRunCount} 件（${p.observedRunCount} 件中）`
  );
  lines.push(`- ${p.note}`);
  lines.push('');

  lines.push((0,_paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__.formatPairedReplayMarkdown)(result.replay));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// #1880: 2 系統（legacy を送った run / compiled を送った run）の A/B 比較経路
// ---------------------------------------------------------------------------

/**
 * A/B 経路で観測できる受入基準と、できない基準の理由を 1 行ずつ持つ。
 *
 * 上の `ACCEPTANCE_COVERAGE`（observe 経路）と同じ metric 語彙を使う。ADR-006
 * の受入基準表がその語彙の出典であり、経路ごとに別名を作ると 2 つの表を突き
 * 合わせられなくなる。
 *
 * 観測可否は実装が実際に出す値だけで決める。`buildPairedReplay` は paired diff
 * の件数（追加 / 削除 / 変更 / critical 回帰）を出すため、`critical 回帰` は
 * **両側に LLM 応答を持つ run が揃っている場合に限り**観測できる。この条件は
 * 静的には決まらないので、`resolveAbAcceptanceCoverage()` が dataset ごとに
 * 解決する（#1880 B1）。一方 recall / precision には正解ラベル付きの
 * fixture dataset が要り、parse 成功率・Evidence 充足・invalid ArtifactRefs・
 * duplicate findings には findings 個々を検査する評価器が要る。latency / cost は
 * そもそも run レコードに所要時間も課金も記録されていない
 * （`buildRunRecord`、`src/lib/result-store.mjs`）。
 * 「2 系統が揃ったのだから段 2 は全部測れる」と書かないのは、そう書くと測って
 * いない基準が満たされたものとして読まれるためである。
 */
const PROMPT_AB_ACCEPTANCE_COVERAGE = Object.freeze(
  [
    {
      metric: 'should-detect recall',
      observable: false,
      reason:
        'candidate 側の findings は存在するが、should-detect の正解ラベルを持つ fixture dataset が無いため recall の分母を作れない',
      unblockedBy: 'ラベル付き fixture dataset の整備',
    },
    {
      metric: 'should-not-detect precision',
      observable: false,
      reason: 'recall と同じ理由で should-not-detect の正解ラベルが無い',
      unblockedBy: 'ラベル付き fixture dataset の整備',
    },
    {
      metric: 'parse 成功率',
      observable: false,
      reason:
        'parse の成否は run 実行時の事象であり、保存済み run レコードは parse 済みの findings しか持たない',
      unblockedBy: 'run レコードへの parse 結果の記録',
    },
    {
      metric: 'Evidence / Fix の充足',
      observable: false,
      reason:
        'findings は両側に存在するが、充足度を数える検査器は本経路に無い（paired diff は件数のみを出す）',
      unblockedBy: 'findings 品質の評価器',
    },
    {
      metric: 'invalid ArtifactRefs',
      observable: false,
      reason: 'Evidence / Fix の充足と同じ理由で、ArtifactRef を検査する評価器が本経路に無い',
      unblockedBy: 'findings 品質の評価器',
    },
    {
      metric: 'duplicate findings',
      observable: false,
      reason: 'Evidence / Fix の充足と同じ理由で、重複を数える評価器が本経路に無い',
      unblockedBy: 'findings 品質の評価器',
    },
    {
      metric: 'critical 回帰',
      // dataset 依存。resolveAbAcceptanceCoverage() が LLM 応答の有無で下げる。
      observable: true,
      reason:
        '両側の run が別レコードであり、かつ両側に LLM 応答を持つ run（debug.llmUsed === true）がある case では paired diff が成立し、buildPairedReplay の criticalRegressionCount（契約6 の floor）をそのまま観測できる',
      unblockedBy: null,
    },
    {
      metric: 'token（送信前のプロンプト推定長）',
      observable: true,
      reason: '各 run が実際に送ったプロンプトの推定長を記録しているため、側ごとに合計できる',
      unblockedBy: null,
    },
    {
      metric: 'latency / cost',
      observable: false,
      reason:
        'run レコードに所要時間も課金も記録されていない（buildRunRecord が持つのは tokenEstimate まで）',
      unblockedBy: LATENCY_COST_UNBLOCKED_BY,
    },
  ].map((row) => Object.freeze(row))
);

/**
 * manifest で pin できない実験条件（#1880）。
 *
 * 宣言しない条件を「同一だった」と書かないための行である。選択された skill は
 * run レコードに保存されていない（`buildRunRecord` の出力に skill 由来の
 * フィールドが無い）ため、同一性は phase / reviewMode と case key（同一 fixture）
 * から間接的にしか担保できない。
 */
const PROMPT_AB_UNPINNED_CONDITIONS = Object.freeze([
  '選択された skill の一覧（run レコードに保存されていないため manifest へ pin できない。phase / reviewMode と case key の一致で間接的に担保する）',
]);

/** `PROMPT_AB_ACCEPTANCE_COVERAGE` のうち LLM 応答の有無に従属する行。 */
const LLM_DEPENDENT_AB_METRICS = Object.freeze(['critical 回帰']);

/**
 * dataset ごとに A/B 経路の受入基準表を解決する（#1880 B1）。
 *
 * `token（送信前のプロンプト推定長）` は LLM 応答が無くても測れるため下げない。
 * 送信前の推定長は `debug.execution.promptCompiler` が記録済みだからである。
 * findings 水準の行だけが応答の有無に従属する。
 *
 * @param {{ findingsObservable: boolean }} input
 * @returns {ReadonlyArray<object>}
 */
function resolveAbAcceptanceCoverage({ findingsObservable }) {
  if (findingsObservable) return [...PROMPT_AB_ACCEPTANCE_COVERAGE];
  return PROMPT_AB_ACCEPTANCE_COVERAGE.map((row) =>
    LLM_DEPENDENT_AB_METRICS.includes(row.metric)
      ? Object.freeze({
          ...row,
          observable: false,
          reason:
            '両側に LLM 応答を持つ run（debug.llmUsed === true）が揃った case が 1 件も無い。paired diff は取れるが、その差は LLM 応答の差ではなく heuristics 由来の findings の差であり、critical 回帰として読めない',
          unblockedBy:
            'LLM 応答を持つ run を両側へ揃えること（dryRun / offline / provider 非対応 / API キー未設定では応答が発生しない）',
        })
      : row
  );
}

/**
 * 片側の LLM 応答の充足度をまとめる（#1880 B1）。
 *
 * `sentPrompt` は `src/prompt/compiler-stage.mjs` のコメントが明示するとおり
 * mode から決まる値であり、送信が起きたことを表さない。応答の有無を表すのは
 * `debug.llmUsed` である。実測（保存済みレコードの読み直し）でも、dryRun の run は
 * `sentPrompt: 'compiled'` と `llmUsed: false` / `llmSkipped: 'dry-run enabled'` を
 * 同時に持つ。
 *
 * 既存の `isLlmlessEmptyReview`（`src/cli/render.mjs`）は再利用しない。あちらは
 * (a) runner の result 形（`reviewDebug` / `comments`）を取り、(b) `llmSkipped` が
 * `/not set/i` に一致する「API キー未設定」だけを対象にし、(c) findings 0 件との
 * 複合判定である。dryRun / offline の run は false になるため、ここで必要な
 * 「その run の findings が LLM 応答に由来するか」とは意味論が異なる。ここは
 * 述語を新設するのではなく、review-engine が書いた `llmUsed` をそのまま読む。
 */
function summarizeLlmResponse(entries) {
  const skipReasons = new Map();
  for (const entry of entries) {
    if (entry.llmSkipped == null) continue;
    skipReasons.set(entry.llmSkipped, (skipReasons.get(entry.llmSkipped) ?? 0) + 1);
  }
  return {
    runCount: entries.length,
    llmUsedRunCount: entries.filter((entry) => entry.llmUsed === true).length,
    // 応答が無い run。呼び出しを飛ばした run と、呼び出したが応答を使えなかった
    // run の両方を含む（どちらも findings は heuristics 由来である）。
    llmUnusedRunCount: entries.filter((entry) => entry.llmUsed === false).length,
    // `llmUsed` を持たない古いレコード。false（応答が無い）と区別する。
    llmUnknownRunCount: entries.filter((entry) => entry.llmUsed == null).length,
    skipReasons: [...skipReasons.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([reason, runCount]) => ({ reason, runCount })),
  };
}

/**
 * findings 水準が観測できるか（#1880 B1）。
 *
 * 条件は「**両側とも** `debug.llmUsed === true` の run を持つ case が 1 件以上
 * あること」である。片側だけ応答がある case は、差分が構成の違いではなく
 * 「応答があるか無いか」の違いになるため数えない。
 */
function summarizeLlmResponseCoverage({ baseline, candidate, pairedCaseKeys }) {
  const respondedCaseKeys = pairedCaseKeys.filter(
    (key) =>
      baseline.some((entry) => entry.caseKey === key && entry.llmUsed === true) &&
      candidate.some((entry) => entry.caseKey === key && entry.llmUsed === true)
  );
  return {
    baseline: summarizeLlmResponse(baseline),
    candidate: summarizeLlmResponse(candidate),
    respondedCaseKeys,
    respondedCaseCount: respondedCaseKeys.length,
    findingsObservable: respondedCaseKeys.length > 0,
    note: 'sentPrompt は mode から決まる値であり送信の証拠ではない（src/prompt/compiler-stage.mjs）。応答の有無は debug.llmUsed が持つ。',
  };
}

/** 側ごとの label。取り違え防止のため sentPrompt を必ず併記する。 */
function sideLabel(sentPrompt, configuration) {
  return sentPrompt === 'legacy'
    ? 'legacy prompt を送った run（buildPrompt）'
    : `compiled prompt を送った run（profile ${configuration.profileId}@${configuration.profileVersion}）`;
}

/**
 * 観測付きの run を `sentPrompt` で 2 系統へ分け、構成が単一であることを確かめる。
 *
 * 分け方は「そのレコードが実際にどちらのプロンプトを送ったか」だけである。
 * 1 レコードが両側に入ることは構造上起こらない（`sentPrompt` は 1 値）。
 */
function collectAbSides(runRecords) {
  const { observed, withoutObservation } = collectObservationEntries(runRecords, {
    // m2: observe 専用の文言を出すと、指示どおり observe を走らせた利用者が
    // 「compiled を送った run が無い」で再度 exit 1 になる。2 段踏ませない。
    emptyDatasetMessage:
      'Prompt Compiler の観測を持つ run が 1 件も無い。`river evolve prompt-ab` は 2 系統を必要とするため、`review.promptCompiler.mode` を `observe` にした run と `active` にした run を同じ対象へ用意して保存すること（既定は off）。',
  });

  const known = ['legacy', 'compiled'];
  const unknown = observed.filter((entry) => !known.includes(entry.observation.sentPrompt));
  if (unknown.length) {
    throw new PromptComparisonError(
      `sentPrompt が ${known.join(' / ')} のいずれでもない run が ${unknown.length} 件ある（${[
        ...new Set(unknown.map((entry) => entry.observation.sentPrompt)),
      ]
        .sort(compareStrings)
        .join(' / ')}）。どちらのプロンプトを送ったか判別できない run は組にできない。`
    );
  }

  const baseline = observed.filter((entry) => entry.observation.sentPrompt === 'legacy');
  const candidate = observed.filter((entry) => entry.observation.sentPrompt === 'compiled');
  if (candidate.length === 0) {
    // observe だけの dataset を A/B として報告しない。ここを通すと、両側が同一
    // レコードの比較が「2 系統を測った」ものとして読まれる。
    throw new PromptComparisonError(
      `compiled prompt を送った run（sentPrompt: compiled）が 1 件も無い。observe だけの dataset は 2 系統にならないため、\`${PROMPT_COMPARE_ROUTE}\` で扱うこと。2 系統を作るには \`review.promptCompiler.mode\` を \`active\` にしたレビューを同じ対象へ実行して run を保存する。`
    );
  }
  if (baseline.length === 0) {
    throw new PromptComparisonError(
      `legacy prompt を送った run（sentPrompt: legacy）が 1 件も無い。baseline が無い比較は candidate 単独の観測でしかないため受理しない。\`review.promptCompiler.mode\` を \`observe\` にした run を同じ対象へ用意すること。`
    );
  }

  const configuration = {
    profileId: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.observation.profileId)),
      'profileId',
      '同一 profile の run だけを渡すこと。'
    ),
    profileVersion: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(String(entry.observation.profileVersion))),
      'profileVersion',
      '同一 profile version の run だけを渡すこと。'
    ),
    compilerVersion: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(String(entry.observation.compilerVersion))),
      'compilerVersion',
      '同一 compiler version の run だけを渡すこと。'
    ),
    provider: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.debug?.llmProvider)),
      'provider',
      '同一 provider の run だけを渡すこと。'
    ),
    model: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.debug?.llmModel)),
      'model',
      '同一モデルの run だけを渡すこと。'
    ),
    // context の条件。phase は skill 選択の、reviewMode は depth config の入力で
    // あり、混ざった集合は「同一 context」ではない。
    phase: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.phase)),
      'phase',
      '同一 phase の run だけを渡すこと。'
    ),
    reviewMode: requireSingleValue(
      observed.map((entry) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(entry.record?.reviewMode)),
      'reviewMode',
      '同一 reviewMode の run だけを渡すこと。'
    ),
  };

  // 同一 fixture であることの検査。case key は deriveCaseKey（SSoT）が出した値
  // をそのまま使う。共通 case が 0 件なら、両側は別の入力をレビューしており
  // paired diff は成立しない。
  const baselineKeys = new Set(baseline.map((entry) => entry.caseKey).filter(Boolean));
  const pairedCaseKeys = [
    ...new Set(
      candidate.map((entry) => entry.caseKey).filter((key) => key && baselineKeys.has(key))
    ),
  ].sort(compareStrings);
  if (pairedCaseKeys.length === 0) {
    throw new PromptComparisonError(
      'legacy 側と compiled 側で共通の case が 1 件も無い。同一 fixture を両モードで走らせた run だけが組になる（case key は reviewedTarget@mergeBase、または明示した caseId である）。'
    );
  }

  return {
    observed,
    baseline,
    candidate,
    withoutObservation,
    configuration,
    pairedCaseKeys,
    llmResponseCoverage: summarizeLlmResponseCoverage({ baseline, candidate, pairedCaseKeys }),
  };
}

/**
 * A/B 比較の experiment spec を組む（#1880）。
 *
 * observe 経路と違い、両側の `runs` は **別のレコード**である。baseline には
 * legacy を送った run、candidate には compiled を送った run だけが入る。
 *
 * `commitSha` は両側で同じ値にしてある。レビュー実行コードは 1 つで、違いは
 * 「どちらのプロンプトを送ったか」だけだからである。その差は `configId` が持ち、
 * `buildPairedReplay` の activation check は configId の差で
 * `configurationDiffers = true` を出す。
 *
 * @param {{ runRecords: object[], hypothesis?: string|null }} input
 * @returns {object} buildPairedReplay に渡せる spec
 */
function buildPromptAbSpec({ runRecords, hypothesis = null } = {}) {
  const { baseline, candidate, withoutObservation, configuration, pairedCaseKeys } =
    collectAbSides(runRecords);
  const { profileId, profileVersion, compilerVersion, provider, model, phase, reviewMode } =
    configuration;
  const commitSha = `river-prompt-compiler@${compilerVersion}`;
  const side = (configId, entries) => ({
    commitSha,
    configId,
    provider,
    model,
    temperature: null,
    runs: entries.map((entry) => entry.record),
  });
  return {
    hypothesis:
      hypothesis ??
      'compiled prompt を送ったレビューは、legacy prompt を送ったレビューに対して critical 回帰を出さない（ADR-006 段 2 の必須条件）。',
    baseline: side(LEGACY_CONFIG_ID, baseline),
    candidate: side(compiledConfigId({ profileId, profileVersion }), candidate),
    metrics: { denominator: 'paired-case' },
    activation: {
      expectedSignal:
        'compiled prompt を送った run の findings が legacy 側と異なること。両側は別レコードなので差分は実際の応答差である',
      declaredEvidence: [...baseline, ...candidate].map((entry) => entry.runId).filter(Boolean),
    },
    environment: {
      compilerVersion,
      profileId,
      profileVersion,
      phase,
      reviewMode,
      baselineModes: [...new Set(baseline.map((entry) => entry.observation.mode))].sort(
        compareStrings
      ),
      candidateModes: [...new Set(candidate.map((entry) => entry.observation.mode))].sort(
        compareStrings
      ),
      pairedCaseKeys,
      runsWithoutObservation: withoutObservation.length,
    },
    // 閾値は宣言しない。ADR-006 の段 2 の指標のうち本経路が観測できるのは
    // critical 回帰と推定長だけであり、残りを含む profile を宣言すると観測して
    // いない基準まで満たされたものとして読まれる。critical 回帰 0 は契約6 の
    // floor として buildPairedReplay が宣言に依らず常に評価する。
    acceptance: { profiles: [] },
    trials: { trialCount: 1 },
  };
}

/** 側ごとの「実際に送ったプロンプト」の行。observe が記録した値をそのまま使う。 */
function sentPromptRowOf(entry) {
  const o = entry.observation;
  const sent = o.sentPrompt;
  return {
    runId: entry.runId,
    caseKey: entry.caseKey,
    side: sent === 'legacy' ? 'baseline' : 'candidate',
    sentPrompt: sent,
    mode: o.mode,
    // 送った側の指紋と推定長だけを載せる。送っていない側の値をここに混ぜると、
    // observe 経路の行（1 run が両側を持つ）と見分けがつかなくなる。
    sentPromptHash: sent === 'legacy' ? o.legacyPromptHash : o.compiledPromptHash,
    sentPromptEstimate: sent === 'legacy' ? o.legacyPromptEstimate : o.compiledPromptEstimate,
  };
}

function summarizeAbPromptMetrics({
  baseline,
  candidate,
  withoutObservation,
  configuration,
  pairedCaseKeys,
}) {
  const rows = [...baseline, ...candidate]
    .map(sentPromptRowOf)
    .sort((a, b) => compareStrings(a.runId, b.runId));
  // M1: 合計は **対になった case の run だけ**を足す。observe 経路は両側が同一
  // レコードなので構造上ズレようがないが、A/B 経路では両側の run 数が違いうる。
  // 全 run を足すと、差は「プロンプト長の差」ではなく「母集団サイズの差」になる。
  const paired = (entries) => entries.filter((entry) => pairedCaseKeys.includes(entry.caseKey));
  const total = (entries) =>
    entries.reduce(
      (acc, entry) =>
        acc +
        (entry.observation.sentPrompt === 'legacy'
          ? entry.observation.legacyPromptEstimate
          : entry.observation.compiledPromptEstimate),
      0
    );
  const baselinePaired = paired(baseline);
  const candidatePaired = paired(candidate);
  const baselineTotal = total(baselinePaired);
  const candidateTotal = total(candidatePaired);
  // paired に絞っても、1 case あたりの run 数が両側で違えば合計は比較できない。
  // その場合は差を出さない。null は「観測できなかった」であり 0 ではない。
  const comparable = baselinePaired.length === candidatePaired.length;
  return {
    ...configuration,
    // 合計の対象範囲を成果物側で明示する。
    estimateScope: 'paired-case',
    baselineRunCount: baseline.length,
    candidateRunCount: candidate.length,
    baselinePairedRunCount: baselinePaired.length,
    candidatePairedRunCount: candidatePaired.length,
    unpairedRunCount: {
      baseline: baseline.length - baselinePaired.length,
      candidate: candidate.length - candidatePaired.length,
    },
    runsWithoutObservation: withoutObservation,
    baselineSentEstimateTotal: baselineTotal,
    candidateSentEstimateTotal: candidateTotal,
    estimateComparable: comparable,
    estimateDeltaTotal: comparable ? candidateTotal - baselineTotal : null,
    estimateDeltaUnavailableReason: comparable
      ? null
      : `対になった case の run 数が両側で異なる（baseline ${baselinePaired.length} 件 / candidate ${candidatePaired.length} 件）ため、合計の差はプロンプト長の差ではなく母集団サイズの差になる`,
    runs: rows,
    note: 'プロンプト推定長は送信前の推定であり、品質の代理指標ではない。「prompt token が減ったから採用」という判定は ADR-006 が禁じている。',
  };
}

/**
 * legacy を送った run と compiled を送った run の A/B 比較を組む（#1880）。
 *
 * 純関数である。I/O を持たず、時計は注入する。LLM も provider も呼ばない。
 * 突合・manifest・受入評価はすべて `./paired-replay.mjs`（#1574 P2）へ委譲する。
 *
 * @param {{ runRecords: object[], now?: Date, hypothesis?: string|null }} input
 * @returns {object}
 */
function buildPromptAbComparison({ runRecords, now = new Date(), hypothesis = null } = {}) {
  const collected = collectAbSides(runRecords);
  const { baseline, candidate, configuration, pairedCaseKeys, llmResponseCoverage } = collected;
  const spec = buildPromptAbSpec({ runRecords, hypothesis });
  const replay = (0,_paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__.buildPairedReplay)(spec, { now });
  // #1880 B1: findings 水準が観測できるのは、両側に LLM 応答を持つ run が揃った
  // case が 1 件以上あるときだけである。`sentPrompt: 'compiled'` は mode から
  // 決まる値であって送信の証拠ではない（src/prompt/compiler-stage.mjs）。
  const findingsObservable = llmResponseCoverage.findingsObservable;
  const runIdsOf = (entries) =>
    entries
      .map((entry) => entry.runId)
      .filter(Boolean)
      .sort(compareStrings);
  return {
    schemaVersion: PROMPT_AB_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    mode: 'prompt-compiler-ab',
    // observe 経路（`prompt-compiler-paired`）と取り違えないための宣言。
    route: PROMPT_AB_ROUTE,
    sameRecordOnBothSides: false,
    readOnly: true,
    sides: {
      baseline: {
        configId: spec.baseline.configId,
        sentPrompt: 'legacy',
        label: sideLabel('legacy', configuration),
        runCount: baseline.length,
        runIds: runIdsOf(baseline),
        modes: spec.environment.baselineModes,
      },
      candidate: {
        configId: spec.candidate.configId,
        sentPrompt: 'compiled',
        label: sideLabel('compiled', configuration),
        runCount: candidate.length,
        runIds: runIdsOf(candidate),
        modes: spec.environment.candidateModes,
      },
    },
    pairedCaseKeys,
    // 読む側が最初に見る位置に置く。findings 水準の数字より前である。
    llmResponseCoverage,
    promptMetrics: summarizeAbPromptMetrics(collected),
    findingComparison: {
      observable: findingsObservable,
      reason: findingsObservable
        ? `baseline は legacy prompt を送った run、candidate は compiled prompt を送った run であり、両側に LLM 応答を持つ run が揃った case が ${llmResponseCoverage.respondedCaseCount} 件ある。その case の paired diff の差分は実際の応答差である。`
        : '両側に LLM 応答を持つ run（debug.llmUsed === true）が揃った case が 1 件も無い。sentPrompt は mode から決まる値であって送信の証拠ではなく（src/prompt/compiler-stage.mjs）、dryRun / offline / provider 非対応 / API キー未設定では LLM 呼び出し自体が起きない。この dataset の paired diff は **実際の応答差ではない**ため、findings 水準の比較として読んではならない。',
      // 応答を持つ case のみが findings 水準の材料である。
      respondedCaseCount: llmResponseCoverage.respondedCaseCount,
      // 既存モジュール側の判定を再実装せず、その結論を指し示す。
      pairedCaseCount: replay.pairing.pairedCaseCount,
      unpairedCases: replay.pairing.unpairedCases,
      counts: replay.metrics.overall,
      // null は「観測できなかった」であり 0 でも false でもない。応答が無い
      // dataset で 0 / false を出すと、測っていない基準が満たされたものとして
      // 読まれる（`replay.acceptance.contract6` の tri-state と同じ扱い）。
      criticalRegressionCount: findingsObservable
        ? replay.acceptance.contract6.criticalRegressionCount
        : null,
      criticalRegressionZero: findingsObservable
        ? replay.acceptance.contract6.criticalRegressionZero
        : null,
      activationVerified: replay.activationCheck.verified,
      activationReasons: replay.activationCheck.reasons,
    },
    acceptanceCoverage: resolveAbAcceptanceCoverage({ findingsObservable }),
    unpinnedConditions: [...PROMPT_AB_UNPINNED_CONDITIONS],
    spec,
    replay,
    // 非ゴールを成果物側でも明示する（#1574 の採否コメントを踏襲）。
    decision: null,
    applied: false,
    autoPromotion: false,
    requiresHumanJudgment: true,
    writeEffects: [],
  };
}

/**
 * 人が読む Markdown（A/B 経路）。
 *
 * 先頭で経路と両側の `sentPrompt` を出す。observe 経路の出力と並べたときに、
 * どちらのモードで測ったかが 1 行目の表から読み取れるようにするためである。
 */
function formatPromptAbMarkdown(result) {
  const p = result.promptMetrics;
  const lines = ['## Prompt Compiler A/B comparison (read-only)', ''];
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Route | \`${result.route}\`（legacy 送信 run と compiled 送信 run の 2 系統） |`);
  lines.push(
    `| Baseline | \`${result.sides.baseline.configId}\`（sentPrompt legacy / ${result.sides.baseline.runCount} run） |`
  );
  lines.push(
    `| Candidate | \`${result.sides.candidate.configId}\`（sentPrompt compiled / ${result.sides.candidate.runCount} run） |`
  );
  lines.push('| 両側が同一レコードか | いいえ（送信したプロンプトで分けた別レコード） |');
  lines.push(`| Provider / Model | ${p.provider ?? '(未取得)'} / ${p.model ?? '(未取得)'} |`);
  lines.push(`| Phase / Review mode | ${p.phase ?? '(未取得)'} / ${p.reviewMode ?? '(未取得)'} |`);
  lines.push(`| Paired cases | ${result.findingComparison.pairedCaseCount} |`);
  lines.push(`| Runs without observation | ${p.runsWithoutObservation.length} |`);
  lines.push(`| Manifest | \`${result.replay.manifest.manifestId}\` |`);
  lines.push('');

  // LLM 応答の充足度を最初に出す。findings 水準の数字を先に見せると、応答が
  // 無い dataset の差分が「応答の差」として読まれる（#1880 B1）。
  const c = result.llmResponseCoverage;
  lines.push('### LLM 応答の充足度');
  lines.push('');
  lines.push('| Side | run | LLM 応答あり | 応答なし | 未取得 | skip 理由 |');
  lines.push('|---|---|---|---|---|---|');
  for (const [label, side] of [
    ['baseline', c.baseline],
    ['candidate', c.candidate],
  ]) {
    const reasons = side.skipReasons.length
      ? side.skipReasons.map((r) => `${r.reason} × ${r.runCount}`).join(' / ')
      : '—';
    lines.push(
      `| ${label} | ${side.runCount} | ${side.llmUsedRunCount} | ${side.llmUnusedRunCount} | ${side.llmUnknownRunCount} | ${reasons} |`
    );
  }
  lines.push('');
  lines.push(
    `- 両側に応答が揃った case: ${c.respondedCaseCount} 件 / findings 水準の比較: ${result.findingComparison.observable ? '可' : '不可'}`
  );
  lines.push(`- ${c.note}`);
  if (!result.findingComparison.observable) {
    lines.push(`- ${result.findingComparison.reason}`);
  }
  lines.push('');

  lines.push('### 受入基準の観測可否（ADR-006）');
  lines.push('');
  lines.push('| Metric | 観測 | 理由 |');
  lines.push('|---|---|---|');
  for (const row of result.acceptanceCoverage) {
    lines.push(`| ${row.metric} | ${row.observable ? '可' : '不可'} | ${row.reason} |`);
  }
  lines.push('');
  for (const condition of result.unpinnedConditions) {
    lines.push(`- manifest で pin していない条件: ${condition}`);
  }
  lines.push('');

  lines.push('### findings 水準（観測できる範囲）');
  lines.push(
    `- critical 回帰: ${result.findingComparison.criticalRegressionCount ?? '—(観測不可)'}`
  );
  const counts = result.findingComparison.counts;
  lines.push(
    `- paired diff: 追加 ${counts.addedFindingCount} / 削除 ${counts.removedFindingCount} / 変更 ${counts.changedFindingCount} / 不変 ${counts.unchangedFindingCount}`
  );
  lines.push('');

  lines.push('### プロンプト水準（各側が実際に送った推定長）');
  lines.push(
    `- profile: \`${p.profileId}@${p.profileVersion}\` / compiler \`${p.compilerVersion}\``
  );
  lines.push(
    `- 対象範囲: ${p.estimateScope}（対になった case の run のみ。baseline ${p.baselinePairedRunCount} 件 / candidate ${p.candidatePairedRunCount} 件、対象外 baseline ${p.unpairedRunCount.baseline} 件 / candidate ${p.unpairedRunCount.candidate} 件）`
  );
  lines.push(
    `- 推定長合計: baseline ${p.baselineSentEstimateTotal} → candidate ${p.candidateSentEstimateTotal}（差 ${
      p.estimateComparable
        ? p.estimateDeltaTotal
        : `—(比較不可: ${p.estimateDeltaUnavailableReason})`
    }）`
  );
  lines.push(`- ${p.note}`);
  lines.push('');

  lines.push((0,_paired_replay_mjs__WEBPACK_IMPORTED_MODULE_1__.formatPairedReplayMarkdown)(result.replay));
  return lines.join('\n');
}


/***/ })

};

//# sourceMappingURL=709.index.mjs.map