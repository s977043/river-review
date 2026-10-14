// Module-scope regexes to avoid re-creation per call
const RE_TEST_EXT = /\.(?:test|spec)\.(?:[jt]sx?|mjs)$/;
const RE_SCHEMA_EXT = /\.schema\.[jt]s$/;
const RE_MIGRATION = /(?:^|\/)migrations?\//;
const RE_MIGRATE = /(?:^|\/)migrate/;
const RE_CONFIG_EXT = /\.config\.(?:[jt]sx?|mjs)$/;
const RE_RC_FILE = /^\.[a-z]+rc(?:\.[a-z]+)?$/;
const RE_TSCONFIG = /^tsconfig.*\.json$/;
// Named textlint configs (e.g. `docs.textlintrc.json`) are not dotfiles, so
// RE_RC_FILE does not reach them. Keep them classified as `config`.
const RE_TEXTLINTRC = /(?:^|\.)textlintrc(?:\.[a-z]+)?$/;
const RE_DOCKERFILE = /^Dockerfile/;
const RE_DOCKER_COMPOSE = /^docker-compose/;
const RE_DEPENDENCY_FILE = /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const RE_CI_WORKFLOW = /\.github\/workflows\//;

const CONFIG_NAMES = new Set([
  'package.json',
  '.river-review.json',
  '.lychee.toml',
  '.markdownlint.json',
  '.markdownlint-cli2.yaml',
  '.textlintrc.json',
  '.textlintignore',
]);

/** Path classifier shared by review-depth routing and specialist selection. */
export function isDependencyFile(file) {
  if (typeof file !== 'string') return false;
  const basename = file.replaceAll('\\', '/').split('/').pop() ?? '';
  return RE_DEPENDENCY_FILE.test(basename);
}

/** CI workflow paths are inspected independently from generic infra files. */
export function isCIWorkflowFile(file) {
  return typeof file === 'string' && RE_CI_WORKFLOW.test(file.replaceAll('\\', '/'));
}

/**
 * Classify changed files by type for routing and evidence collection.
 * Complementary to impact-scope.mjs which classifies by quality domain.
 *
 * @param {string[]} files - Array of file paths (relative to repo root)
 * @returns {{ config: string[], schema: string[], migration: string[], app: string[], test: string[], infra: string[], docs: string[], unknown: string[] }}
 */
export function classifyChangedFiles(files) {
  const result = {
    config: [],
    schema: [],
    migration: [],
    app: [],
    test: [],
    infra: [],
    docs: [],
    unknown: [],
  };

  for (const file of files) {
    result[classifyFile(file)].push(file);
  }

  return result;
}

// Priority: test > schema > migration > config > infra > docs > app > unknown
function classifyFile(file) {
  const normalized = file.replaceAll('\\', '/');
  const basename = normalized.split('/').pop() ?? '';

  if (isTest(normalized, basename)) return 'test';
  if (isSchema(normalized, basename)) return 'schema';
  if (isMigration(normalized)) return 'migration';
  if (isConfig(normalized, basename)) return 'config';
  if (isInfra(normalized, basename)) return 'infra';
  if (isDocs(normalized, basename)) return 'docs';
  if (isApp(normalized)) return 'app';
  return 'unknown';
}

function isTest(file, basename) {
  return file.startsWith('tests/') || file.includes('/__tests__/') || RE_TEST_EXT.test(basename);
}

function isSchema(file, basename) {
  return (
    file.startsWith('schemas/') || RE_SCHEMA_EXT.test(basename) || basename.endsWith('.schema.json')
  );
}

function isMigration(file) {
  return RE_MIGRATION.test(file) || RE_MIGRATE.test(file) || file.startsWith('db/');
}

function isConfig(file, basename) {
  if (isDependencyFile(file)) return true;
  if (RE_CONFIG_EXT.test(basename)) return true;
  if (RE_RC_FILE.test(basename)) return true;
  if (CONFIG_NAMES.has(basename) || basename.startsWith('.env')) return true;
  if (RE_TSCONFIG.test(basename)) return true;
  if (RE_TEXTLINTRC.test(basename)) return true;
  return false;
}

function isInfra(file, basename) {
  return (
    file.startsWith('.github/') ||
    file.startsWith('.husky/') ||
    file.startsWith('scripts/') ||
    RE_DOCKERFILE.test(basename) ||
    RE_DOCKER_COMPOSE.test(basename)
  );
}

function isDocs(file, basename) {
  if (basename.endsWith('.md') || basename.endsWith('.mdx')) return true;
  if (file.startsWith('docs/') || file.startsWith('pages/')) return true;
  return false;
}

function isApp(file) {
  return file.startsWith('src/') || file.startsWith('runners/');
}
