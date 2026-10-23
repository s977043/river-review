/**
 * High-confidence, path-only signals for review-depth escalation.
 * This heuristic is deliberately incomplete: it never grants permission,
 * downgrades a Risk Map requirement, or claims semantic change coverage.
 */
const SOURCE_ROOTS = new Set([
  'src',
  'runners',
  'apps',
  'app',
  'packages',
  'lib',
  'server',
  'services',
  'api',
]);
const SENSITIVE_PARTS = new Set([
  'auth',
  'authn',
  'authz',
  'authentication',
  'authorization',
  'permission',
  'permissions',
  'access-control',
  'rbac',
  'acl',
  'payment',
  'payments',
  'billing',
  'secret',
  'secrets',
  'privacy',
  'pii',
]);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|php|go|rs|rb|java|kt)$/i;
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|py|php|go|rs|rb|java|kt)$/i;
const NON_PRODUCT_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  'fixture',
  'fixtures',
  '__fixtures__',
  'docs',
  'documentation',
  'examples',
]);

/**
 * Find source-code paths whose directory or filename tokens explicitly name a
 * security/privacy/payment-sensitive area. This is a conservative review hint,
 * not a complete classifier or an approval decision.
 * @param {unknown} changedFiles
 * @returns {string[]}
 */
export function findSensitiveCodePaths(changedFiles) {
  if (!Array.isArray(changedFiles)) return [];
  return changedFiles.filter((file) => {
    if (typeof file !== 'string') return false;
    const segments = file.replaceAll('\\', '/').split('/');
    if (!SOURCE_ROOTS.has(segments[0])) return false;
    const basename = segments.at(-1);
    if (!basename || !SOURCE_EXT.test(basename) || TEST_FILE.test(basename)) return false;
    if (segments.slice(1, -1).some((segment) => NON_PRODUCT_DIRS.has(segment.toLowerCase()))) {
      return false;
    }
    // Token boundaries prevent 'author.ts' and 'authoring/' matching 'auth'.
    const stem = basename.replace(SOURCE_EXT, '');
    const nameTokens = stem.toLowerCase().split(/[._-]/);
    return [...segments.slice(1, -1).map((s) => s.toLowerCase()), ...nameTokens].some((token) =>
      SENSITIVE_PARTS.has(token)
    );
  });
}
