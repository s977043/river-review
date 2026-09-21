// Unified default config supporting both legacy and skill-based flows
export const defaultConfig = Object.freeze({
  version: '1.0',
  model: {
    provider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 600,
  },
  review: {
    language: 'ja',
    severity: 'normal',
    additionalInstructions: [],
    // ADR-006 / #1859: Prompt Compiler の既定は off。off のとき
    // review-engine は compiled プロンプトを組まず、挙動は導入前と同一になる。
    promptCompiler: { mode: 'off' },
    // #2252: Review Viewpoint Catalog is opt-in. observe records activation
    // without changing prompts; active injects matched Review Obligations.
    viewpoints: { mode: 'off' },
    // #2334 / #1978 Phase 3: Finding Critic の既定は off。off のとき
    // reviewer-orchestrator / review-engine は runFindingCritic を呼ばず、
    // findings は導入前と同一のまま下流へ渡る。
    findingCritic: { mode: 'off' },
  },
  exclude: {
    files: [],
    prLabelsToIgnore: [],
  },
  skills: [],
});

// Alias kept for compatibility with newer skill-only imports
export const defaultSkillConfig = defaultConfig;
