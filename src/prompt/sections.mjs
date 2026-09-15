// Review prompt sections (#1859 の前段) — レビュー用プロンプトの「節」を組み立てる純関数群。
//
// 背景:
//   これらはすべて review-engine.mjs の module-private 関数だった。ADR-006 の
//   Prompt Compiler は同じ節を別の順序・別の system/user 配分で描画するため、
//   節の生成規則を review-engine 側と compiler 側の 2 箇所へ複製することになる。
//   レビュー契約の文面が二重管理になるのは CLAUDE.md「Import the SSoT, never
//   re-derive it」が禁じる形なので、生成規則をこのモジュールへ集約し、双方が
//   import する。
//
// このモジュールの契約:
//   - 出力は buildPrompt が生成していた文字列と **バイト単位で同一**である。
//     tests/prompt-sections.test.mjs が golden で pin している。
//   - 副作用を持たない。I/O もプロセス状態の参照もしない。
//   - レビュー判断（severity の意味、GO/NO-GO、スキル選択）はここに置かない。
//     ここが持つのは「決まった判断をどう文字列にするか」だけである。
//
// 切り出していないもの:
//   sanitizeSkillName / resolveOpenAIConfig は prompt の節ではなく、それぞれ
//   fallback コメント生成と provider 設定解決に属するため review-engine に残す。
import {
  ASK_RELEVANCE,
  CRITIC_VERDICT,
  PROTOCOL_ID,
  REVIEWER_ACTION,
} from '../lib/finding-critic.mjs';
import { summarizeSkill } from '../lib/skill-planner.mjs';

/** PR 本文をプロンプトへ載せるときの上限。超過分は truncate する。 */
export const MAX_PR_BODY_CHARS = 4000;

export function buildSystemMessage(language) {
  return language === 'en'
    ? 'You are River Review, an expert code review assistant. Respond in English. You excel at spotting risky changes and explaining them briefly.'
    : 'You are River Review, an expert code review assistant. Respond in Japanese. You excel at spotting risky changes and explaining them briefly.';
}

export function buildLanguageInstruction(language) {
  return language === 'en'
    ? '- Write the <message> in English.'
    : '- <message>は日本語で記述すること。';
}

export function buildSeverityInstruction(severity, language) {
  const japanese = {
    strict: '軽微な懸念も含めて網羅的に指摘する',
    normal: '重要度と再現性のバランスを取り、主要なリスクを指摘する',
    relaxed: '重大・致命的な問題に限定し、軽微な指摘は省く',
  };
  const english = {
    strict: 'Capture even minor risks and style regressions',
    normal: 'Balance breadth with impact; focus on notable risks',
    relaxed: 'Limit findings to critical or high-impact issues; skip nits',
  };
  const map = language === 'en' ? english : japanese;
  const label = language === 'en' ? 'Severity focus' : '厳格度';
  return `- ${label} (${severity}): ${map[severity] ?? map.normal}`;
}

export function buildAdditionalSection(instructions, language) {
  if (!instructions?.length) return '';
  const header = language === 'en' ? 'Additional instructions:' : '追加指示:';
  // T64: additionalInstructions が単一行 "<file>:<line>: <message>" 形式と
  // 競合し、LLM出力のパース失敗を招いていたため、適用範囲を明示する。
  const formatNote =
    language === 'en'
      ? 'These additional instructions apply only to the content of each finding\'s <message>. Always keep the "<file>:<line>: <message>" line format above.'
      : 'これらの追加指示は各 finding の <message> 内容にのみ適用してください。上記の「<file>:<line>: <message>」という行フォーマット自体は常に維持してください。';
  const body = instructions.map((item) => `- ${item}`).join('\n');
  return `\n${header}\n${formatNote}\n${body}\n`;
}

export function buildSkillSummary(plan) {
  if (!plan?.selected?.length) return 'No skills selected; provide general review notes.';
  const summaries = plan.selected.map((skill) => summarizeSkill(skill));
  const top = summaries.slice(0, 6);
  const body = top
    .map(
      (s) =>
        `- ${s.id}: ${s.name} [phase=${s.phase}, severity=${s.severity ?? 'unknown'}, modelHint=${s.modelHint}]`
    )
    .join('\n');
  const truncated =
    summaries.length > top.length ? `\n...and ${summaries.length - top.length} more skills.` : '';
  return `${body}${truncated}`;
}

export function buildFileSummary(files = []) {
  if (!files.length) return 'No files changed';
  return files.map((file) => `- ${file.path} (hunks: ${file.hunks.length || 1})`).join('\n');
}

export function buildProjectRulesSection(rulesText) {
  if (!rulesText) return '';
  return `\n### Project-specific review rules\n\n以下は、このリポジトリ専用のレビューガイドラインです。必ず考慮してください。\n\n---\n${rulesText}\n---\n`;
}

export function buildPrDescriptionSection(prBody) {
  if (typeof prBody !== 'string' || !prBody.trim()) return '';
  const body =
    prBody.length > MAX_PR_BODY_CHARS
      ? `${prBody.slice(0, MAX_PR_BODY_CHARS)}\n...[truncated]`
      : prBody;
  return `\n### PR Description\n\n以下はこの変更の PR 本文です。差分そのものに加えて、PR 本文がレビュー可能な状態かを確認してください。\n\n- Why（変更理由）と What（変更内容）が書かれているか\n- 本文の説明が差分と一致しているか（説明にあるが差分に無い／差分にあるが説明に無い）\n- 影響範囲が書かれているか\n- テスト方針・確認方法が書かれているか\n- 関連 Issue / 仕様 / 設計へのリンクがあるか\n\nPR 本文に関する指摘は、対象を \`PR-DESCRIPTION:0\` として出力してください。\n\n---\n${body}\n---\n`;
}

function reviewObligationOneLine(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function reviewObligationList(values) {
  return (values ?? []).map(reviewObligationOneLine).filter(Boolean).join(', ');
}

/**
 * Render matched Review Obligations as questions that require evidence, never
 * as pre-asserted Findings. Activation details stay out of the prompt: they are
 * runtime provenance, not evidence that a violation exists.
 */
export function buildReviewObligationsSection(obligations = [], language = 'ja') {
  if (!obligations?.length) return '';

  const instruction =
    language === 'en'
      ? 'The following items are review obligations, not findings. Verify the required evidence in the diff and context. Emit a finding only when evidence supports a real issue; never invent missing evidence, and respect false-positive guards.'
      : '以下は「確認すべき観点」であり、問題の存在を示す Finding ではありません。差分と文脈から Required evidence を確認し、実際の問題を裏付ける証拠がある場合だけ Finding を出してください。証拠を推測・捏造せず、False-positive guards に該当する場合は指摘しないでください。';
  const lines = [];

  for (const obligation of obligations) {
    lines.push(
      `- [${reviewObligationOneLine(obligation.id)}] ${reviewObligationOneLine(obligation.title)}`
    );
    lines.push(`  - Question: ${reviewObligationOneLine(obligation.question)}`);
    lines.push(
      `  - Required evidence: ${reviewObligationList(obligation.requiredEvidence) || '(none)'}`
    );
    const hints = reviewObligationList(obligation.evidenceHints);
    if (hints) lines.push(`  - Evidence hints: ${hints}`);
    const guards = reviewObligationList(obligation.falsePositiveGuards);
    if (guards) lines.push(`  - False-positive guards: ${guards}`);
  }

  return `\n### Review Obligations\n\n${instruction}\n\n${lines.join('\n')}\n`;
}

// Opt-in (review.walkthrough). Asks the model to prepend a per-file walkthrough
// to its output so reviewers see what changed, the risk, and a reading order.
export function buildWalkthroughSection(enabled) {
  if (!enabled) return '';
  return `\n### File Walkthrough (output request)\n\nFindings の前に "## File Walkthrough" セクションを出力してください。変更ファイルごとに 1 行で:\n- 何がどう変わったか（要約）\n- 変更リスク（high/medium/low）\n- 読むべき順番（依存や影響の大きい順）\nを示してください。差分に無いファイルは含めないでください。\n`;
}

// Opt-in (review.agentHandoff). Asks the model to append provider-agnostic
// fix instructions another AI agent can act on. Distinct from per-finding
// `suggestion` (a human hint); this is an executable instruction set.
export function buildHandoffSection(enabled) {
  if (!enabled) return '';
  return `\n### Agent Handoff (output request)\n\nFindings の後に "## Agent Handoff" セクションを出力してください。blocking な指摘を別の AI エージェントが修正できるよう、特定のツール名・CLI 名を含めずに以下を記述してください:\n- 修正の目的\n- 対象ファイル\n- 制約（壊してはいけない挙動・後方互換）\n- 実装手順\n- テスト手順\n- 完了条件\n`;
}

export function buildADRContextSection(relatedADRs) {
  if (!relatedADRs?.length) return '';
  const lines = ['\n### Related ADRs/Specs\n'];
  for (const adr of relatedADRs.slice(0, 5)) {
    lines.push(`- ${adr.title} (${adr.path}) — ${adr.matchReason}`);
  }
  lines.push('\nこれらの設計文書との整合性を考慮してレビューしてください。\n');
  return lines.join('\n');
}

function sanitizePath(p) {
  return String(p)
    .replace(/[\n\r]/g, '')
    .slice(0, 200);
}

export function buildRiskAssessmentSection(riskAssessment) {
  if (!riskAssessment) return '';
  const { escalatedFiles, humanReviewFiles } = riskAssessment;
  if (!escalatedFiles?.length && !humanReviewFiles?.length) return '';
  const lines = ['\n### Risk Assessment\n'];
  if (humanReviewFiles?.length) {
    lines.push('以下のファイルは人間によるレビューが必須です:');
    for (const f of humanReviewFiles) lines.push('- ' + sanitizePath(f) + ': require_human_review');
  }
  if (escalatedFiles?.length) {
    lines.push('以下のファイルはエスカレーション対象です:');
    for (const f of escalatedFiles) lines.push('- ' + sanitizePath(f) + ': escalate');
  }
  lines.push('これらのファイルには特に注意してレビューしてください。\n');
  return lines.join('\n');
}

/**
 * findings の出力契約そのもの。severity 語彙・証跡の必須項目・件数上限・
 * ID 捏造の禁止が、この 1 箇所に集まっている。
 *
 * Prompt Compiler の renderer はこの文字列を **そのまま** 使い、置き場所
 * （system へ寄せるか user に残すか）だけを変える。文面を profile 側で
 * 書き換えることは ADR-006 の不変条件が禁じている。
 *
 * @param {object} params
 * @param {string} params.language      'ja' | 'en'
 * @param {string} params.severity      'strict' | 'normal' | 'relaxed'
 * @param {object} params.depthConfig   getReviewDepthConfig() の戻り値
 * @param {string[]=} params.additionalInstructions
 */
export function buildFindingContractSection({
  language,
  severity,
  depthConfig,
  additionalInstructions,
}) {
  return `Review the unified git diff below and produce concise findings.
${buildLanguageInstruction(language)}
- Output each finding on its own line using the format "<file>:<line>: <message>".
- In <message>, include short labels: "Finding:", "Evidence:", "Impact:", "Fix:", "Severity:", "Confidence:".
- Every finding MUST carry "Severity:" and "Confidence:". It MUST also carry "Evidence:" (>=5 chars) and "Fix:" (>=10 chars) — findings without them are discarded during verification. "Finding:" and "Impact:" are recommended.
- Use Severity: blocker|warning|nit and Confidence: high|medium|low.
- Optionally add "Scope: in-diff" (the added lines introduce the problem) or "Scope: pre-existing" (the problem is in a changed file but outside the added lines). Verification re-derives scope from the diff and overrides this label when it can.
- Optionally add "CriterionRefs: AC-4, TC-7" (acceptance-criterion or test-case identifiers) and/or "ArtifactRefs: plan.md#AC-4, todo.md#TASK-3" (artifact anchors) to link the finding back to the requirement it verifies. Separate values with a comma; a value must not contain spaces.
- Use ONLY identifiers that appear verbatim in an artifact supplied above (plan / requirements / PR description). If no such artifact was supplied, or you are not certain of the exact identifier, omit the label entirely — never invent, guess, abbreviate, or renumber an ID.
- Example finding line: src/app.ts:42: Finding: retry loop swallows errors Evidence: catch block at src/app.ts drops err Impact: failures are masked Fix: rethrow or log err with context Severity: warning Confidence: high
- Focus on correctness, safety, and maintainability risks in the changed code.
- Prefer commenting on changed lines; if a point depends on context not visible in the diff, set Confidence: low.
- Before flagging a line, read the comments and docblocks adjacent to it in the diff, and never repeat a suggestion one of them already answers. Omitting a finding because a comment states the design intent is allowed ONLY for nits, style, and design-preference points whose concern that intent fully resolves.
- Never omit a security, data-loss, or correctness risk because a comment calls it intentional: report it, cite that comment in <message>, and state the risk that remains. Lower the severity only when the stated intent genuinely mitigates part of the risk, and give that reason in <message>. A comment that contradicts the code it documents is itself a finding.
- Limit to ${depthConfig.maxFindings} findings. If there are no issues worth mentioning, reply with "NO_ISSUES".
- Keep messages brief (<=200 characters).
- ${depthConfig.focusHint}
${buildSeverityInstruction(severity, language)}
${buildAdditionalSection(additionalInstructions, language)}`;
}

// ---------------------------------------------------------------------------
// Evidence-Grounded Adversarial Review — Critic / Reviewer turns (#1978)
// ---------------------------------------------------------------------------
//
// この 2 節は finding-critic の状態機械へ供給する LLM ターンの文面である。
// 語彙（verdict / askRelevance / action）は src/lib/finding-critic.mjs が
// export する定数から組み立てる。文字列リテラルで書き写すと、語彙の変更が
// プロンプト側へ伝播しないためである（CLAUDE.md「Import the SSoT」）。
//
// レビュー判断はここに無い。ここにあるのは「決まった契約をどう文字列にするか」
// だけであり、verdict の意味づけも接地判定も finding-critic.mjs が持つ。

function joinList(values) {
  return values.map((v) => `\`${v}\``).join(' | ');
}

/**
 * 出力契約の JSON テンプレへ埋めるプレースホルダ。
 *
 * 許容値を `A | B | C` の形でテンプレ内へ直接展開すると、テンプレそのものが
 * 有効な JSON でなくなり、モデルがそれを写して壊れた JSON を返す誘因になる。
 * テンプレは常に `JSON.parse` を通る形に保ち、許容値は直後の行で列挙する。
 * 値の生成元は finding-critic.mjs の語彙定数のままで、ここでは並べ方だけを変える。
 */
const CHOICE_PLACEHOLDER = '<one of the values listed below>';

function bulletList(items, empty) {
  const list = (Array.isArray(items) ? items : []).map((v) => String(v).trim()).filter(Boolean);
  if (!list.length) return empty;
  return list.map((v) => `- ${v}`).join('\n');
}

function reasonLanguageInstruction(language) {
  return language === 'en'
    ? '- Write `reason` and `observation` in English.'
    : '- `reason` と `observation` は日本語で記述すること。';
}

/** Critic / Reviewer ターンの system message。 */
export function buildCriticSystemMessage(role, language) {
  const who =
    role === 'reviewer'
      ? 'the Reviewer who raised the finding, now answering the Critic'
      : 'an adversarial Critic auditing another reviewer finding';
  const lang = language === 'en' ? 'English' : 'Japanese';
  return `You are ${who} in River Review's ${PROTOCOL_ID} protocol. Reply with a single JSON object and nothing else. Prose inside the JSON is written in ${lang}.`;
}

/**
 * Critic ターンの user prompt。
 *
 * @param {object} params
 * @param {{ id?: string, severity?: string, message?: string }} params.finding
 * @param {string} params.diff
 * @param {string} [params.originalAsk]
 * @param {string[]} [params.acceptanceCriteria]
 * @param {string} [params.language] 'ja' | 'en'
 */
export function buildCriticPromptSection({
  finding,
  diff,
  originalAsk,
  acceptanceCriteria,
  language = 'ja',
}) {
  return `Audit the candidate finding below against the diff.

### Original ask

${String(originalAsk ?? '').trim() || '(not supplied)'}

### Acceptance criteria

${bulletList(acceptanceCriteria, '(none supplied)')}

### Candidate finding

- finding_id: ${String(finding?.id ?? '')}
- severity: ${String(finding?.severity ?? '')}

${String(finding?.message ?? '').trim()}

### Diff

${String(diff ?? '')}

### Output contract

Reply with ONE JSON object, no code fence, no commentary:

{"finding_id": "<the finding_id above, verbatim>", "verdict": "${CHOICE_PLACEHOLDER}", "reason": "<why>", "ask_relevance": "${CHOICE_PLACEHOLDER}", "evidence": [{"artifact": "<path from the diff>", "line_start": 0, "line_end": 0, "observation": "<what is there>"}]}

- \`verdict\` is one of: ${joinList(Object.values(CRITIC_VERDICT))}.
- \`ask_relevance\` is one of: ${joinList(Object.values(ASK_RELEVANCE))}.
- \`line_start\` / \`line_end\` are integers; replace the zeros with the real line numbers.

- \`verdict\`: \`${CRITIC_VERDICT.AGREE}\` when the finding holds, \`${CRITIC_VERDICT.DISAGREE_EVIDENCE}\` when the diff itself refutes it, \`${CRITIC_VERDICT.DISAGREE_CONCERN}\` when you doubt it but cannot cite a refutation.
- \`${CRITIC_VERDICT.DISAGREE_EVIDENCE}\` REQUIRES at least one \`evidence\` entry whose \`artifact\` is a file path that appears in the diff. Without it the verdict is downgraded to \`${CRITIC_VERDICT.DISAGREE_CONCERN}\`.
- \`ask_relevance\` judges the finding against the original ask only, not against the diff: \`${ASK_RELEVANCE.IN_ASK}\` when it bears on the ask, \`${ASK_RELEVANCE.OUT_OF_ASK}\` when it is a separate concern, \`${ASK_RELEVANCE.UNCERTAIN}\` when you cannot tell. An unreadable or missing value is read as \`${ASK_RELEVANCE.UNCERTAIN}\`.
- Never invent a path, a line number, or a finding_id.
${reasonLanguageInstruction(language)}`;
}

/**
 * Reviewer 反論ターンの user prompt。Critic が DISAGREE_* を返した回のみ使う。
 *
 * @param {object} params
 * @param {{ id?: string, message?: string }} params.finding
 * @param {unknown} params.criticResponse Critic の生出力（文字列 or オブジェクト）
 * @param {string} params.diff
 * @param {string} [params.language] 'ja' | 'en'
 */
export function buildReviewerRebuttalPromptSection({
  finding,
  criticResponse,
  diff,
  language = 'ja',
}) {
  const critic =
    typeof criticResponse === 'string' ? criticResponse : JSON.stringify(criticResponse ?? null);
  return `The Critic challenged your finding. Answer it.

### Your finding

- finding_id: ${String(finding?.id ?? '')}

${String(finding?.message ?? '').trim()}

### Critic response

${critic}

### Diff

${String(diff ?? '')}

### Output contract

Reply with ONE JSON object, no code fence, no commentary:

{"finding_id": "<the finding_id above, verbatim>", "action": "${CHOICE_PLACEHOLDER}", "response_to": "<the Critic verdict you are answering>", "evidence": [{"artifact": "<path from the diff>", "line_start": 0, "line_end": 0, "observation": "<what is there>"}]}

- \`action\` is one of: ${joinList(Object.values(REVIEWER_ACTION))}.
- \`line_start\` / \`line_end\` are integers; replace the zeros with the real line numbers.

- \`${REVIEWER_ACTION.KEEP}\` REQUIRES at least one \`evidence\` entry; a \`${REVIEWER_ACTION.KEEP}\` without evidence is not a valid answer and escalates to a human.
- \`${REVIEWER_ACTION.WITHDRAW}\` when the Critic is right. \`${REVIEWER_ACTION.REVISE}\` when the finding survives in a changed shape.
- Cite only paths and lines that appear in the diff above.
${reasonLanguageInstruction(language)}`;
}
