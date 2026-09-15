/**
 * ヒューリスティック検出器レジストリ（単一の真実 / SSoT）
 *
 * detector 1 本の追加・変更はこの配列の 1 エントリで完結する。以前は
 *   (a) 検出関数 `findXxx`
 *   (b) `SKILL_HEURISTIC_MAP` の関数名文字列配列（プログラム未消費の第2真実）
 *   (c) `buildHeuristicComments` の手書き dispatch
 *   (d) `review-engine.mjs` の kind→日本語メッセージ switch（別ファイル）
 * の最大4箇所・2ファイルを同期する必要があったが、それらをこのレジストリから
 * 導出することでドリフト源を解消した。
 *
 * エントリのフィールド:
 *   - skillId:     対応スキル ID（dry-run フィルタと配線に使用）
 *   - detect:      ({ diff }) => Array<{ file, line, kind }> の検出関数
 *   - skipIfSkill: （任意）指定スキルが plan に含まれる場合はこの detector を実行しない
 *   - findings:    kind → { finding, evidence, impact, fix, severity, confidence }
 *                  （review-engine の日本語メッセージ生成に使用）
 *
 * 配列順は `buildHeuristicComments` の出力順序（golden/fixtures が pin）と一致させる。
 */

// 生成物パスの判定は diff-processor の `isGeneratedArtifactPath` を唯一の実装として
// 参照する（再実装しない）。同関数は finding 出力段の抑制述語でもあり、検出段でも
// 同じ定義を使うことで「どこまでを生成物とみなすか」の二重定義を避ける。
import { isGeneratedArtifactPath } from './diff-processor.mjs';

// test-existence / coverage-gap は同一の 3 検出器を共有する。プレゼンテーションは
// 一度だけ定義して両スキルのエントリから参照し、二重定義を避ける。
const MISSING_TESTS_FINDING = {
  finding: '挙動変更に対するテスト差分が見当たらない',
  evidence: 'コード差分あり・テスト差分なし',
  impact: '回帰の検知漏れや仕様逸脱が起きやすい',
  fix: '新分岐/例外/境界の最小テストを1〜3件追加する',
  severity: 'warning',
  confidence: 'medium',
};
const FOCUSED_TEST_FINDING = {
  finding: 'フォーカス済みテスト（.only）がコミットされている',
  evidence: 'describe/it/test 等の .only が追加された',
  impact: '他のテストが CI で実行されず、回帰を見逃す',
  fix: '.only を外してから commit する（誤ってフォーカスを残さない）',
  severity: 'warning',
  confidence: 'high',
};
const DISABLED_TEST_FINDING = {
  finding: '無効化されたテスト（.skip / xit / xdescribe / xcontext）がコミットされている',
  evidence: '`.skip` または `xit`/`xdescribe`/`xcontext` が追加された',
  impact: 'テストが実行されず、対象の挙動が未検証のまま残る',
  fix: '修正してスキップを外す。意図的な保留なら理由（Issue 等）をコメントで残す',
  severity: 'nit',
  confidence: 'medium',
};

const HEURISTIC_REGISTRY = [
  {
    skillId: 'security-basic',
    detect: findHardcodedSecrets,
    findings: {
      'hardcoded-secret': {
        finding: '秘密情報（トークン/キー）の直書きの可能性がある',
        evidence: 'トークン/キーらしい文字列が追加されている',
        impact: '漏洩時に不正利用やインシデントにつながる',
        fix: '環境変数（GitHub Secrets等）へ移し、漏洩時はローテーションも検討する',
        severity: 'blocker',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'security-basic',
    detect: findGitHubActionsIssues,
    findings: {
      'gh-actions-pull-request-target': {
        finding: 'pull_request_targetイベントは権限昇格のリスクがある',
        evidence: 'pull_request_targetトリガーが追加されている',
        impact: 'フォークからのPRで任意コードが本リポジトリの権限で実行される可能性',
        fix: 'pull_requestイベントを使用するか、pull_request_targetの場合はチェックアウト前に入力を検証する',
        severity: 'blocker',
        confidence: 'high',
      },
      'gh-actions-excessive-permissions': {
        finding: '過剰な権限設定（write-all）が検出された',
        evidence: 'permissions: write-all が設定されている',
        impact: 'ワークフローが侵害された場合の影響範囲が最大化される',
        fix: '最小権限の原則に従い、必要な権限のみを個別に指定する（例: contents: read, pull-requests: write）',
        severity: 'warning',
        confidence: 'high',
      },
      'gh-actions-secret-in-run': {
        finding: 'runブロック内でsecretsを直接使用している',
        evidence: 'run: と secrets.* が同一行に存在',
        impact: 'ログ出力やエラーメッセージでシークレットが漏洩する可能性',
        fix: 'シークレットを環境変数として設定し、envブロック経由で参照する',
        severity: 'warning',
        confidence: 'medium',
      },
      'gh-actions-unsanitized-input': {
        finding: 'ユーザー入力がサニタイズされずに使用されている',
        evidence: 'github.event.*.title/body/name がrunブロックで直接使用',
        impact: 'コマンドインジェクション攻撃のリスクがある',
        fix: 'jqやtoJSONを使用して入力をサニタイズする、または環境変数経由で渡す',
        severity: 'blocker',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'security-basic',
    detect: findDangerousEval,
    findings: {
      'dangerous-eval': {
        finding: 'コード実行/インジェクションのリスクがある API が追加されている',
        evidence:
          'eval / new Function / dangerouslySetInnerHTML / document.write(ln) / 文字列引数の setTimeout・setInterval のいずれかが追加された',
        impact: '入力が信頼できない場合に任意コード実行や XSS につながる',
        fix: '動的評価を避ける（パース/ホワイトリスト化）、HTML はサニタイズして挿入し、タイマーには関数を渡す',
        severity: 'warning',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'security-basic',
    detect: findInsecureTls,
    findings: {
      'insecure-tls': {
        finding: 'TLS 証明書検証が無効化されている',
        evidence:
          '`rejectUnauthorized: false` または `NODE_TLS_REJECT_UNAUTHORIZED=0` が追加された',
        impact: '中間者攻撃に対して脆弱になる',
        fix: '証明書検証を有効に保つ。自己署名証明書は CA を信頼ストアへ追加して対応する',
        severity: 'blocker',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'security-basic',
    detect: findWeakHash,
    findings: {
      'weak-hash': {
        finding: '弱いハッシュアルゴリズム（MD5 / SHA-1）が使われている',
        evidence: "`createHash('md5')` または `createHash('sha1')` が追加された",
        impact: '衝突攻撃に弱く、署名やパスワード等の用途では安全でない',
        fix: 'SHA-256 以上を使う。パスワードは bcrypt/scrypt/argon2 を使う',
        severity: 'warning',
        confidence: 'medium',
      },
    },
  },
  {
    skillId: 'security-basic',
    detect: findCommandInjection,
    findings: {
      'command-injection': {
        finding: 'シェルコマンドが文字列補間で組み立てられている',
        evidence: '`exec`/`spawn` 系にテンプレートリテラルの `${...}` 補間が渡されている',
        impact: '補間値が信頼できない場合、コマンドインジェクションにつながる',
        fix: '引数配列を使う（例: `execFile(cmd, [args])`）、または入力を厳格に検証/エスケープする',
        severity: 'warning',
        confidence: 'medium',
      },
    },
  },
  {
    skillId: 'invisible-unicode-injection',
    detect: findInvisibleUnicode,
    findings: {
      'bidi-control': {
        finding: '双方向テキスト制御文字（Bidi control/mark）がコードに混入している',
        evidence:
          'U+061C / U+200E / U+200F / U+202A–202E / U+2066–2069 のいずれかが追加行に含まれる（Trojan Source / CVE-2021-42574）',
        impact: '表示上のコード順序と実際の実行順序が食い違い、悪意あるロジックを不可視化できる',
        fix: '該当文字を削除する。方向制御が本当に必要な場合は用途をレビューで明示し、コードでは使わない',
        severity: 'blocker',
        confidence: 'high',
      },
      'invisible-unicode': {
        finding: '不可視 Unicode 文字（ゼロ幅/異体字セレクター/タグ文字等）がコードに混入している',
        evidence:
          'タグ文字（U+E0000–E007F）・異体字セレクター（U+FE00–FE0F / U+E0100–E01EF）・ゼロ幅文字（U+200B/2060）・非先頭 BOM（U+FEFF）・ソフトハイフン（U+00AD）・不可視数学演算子（U+2061–2064）等（列挙集合に限定）が追加行に含まれる（GlassWorm 型のコード不可視化・ASCII smuggling）',
        impact:
          '目視できないコードが混入し、サプライチェーン経由で任意コード実行やレビュー回避につながる',
        fix: '該当の不可視文字を削除する。意図した装飾（絵文字）でない限りコードに不可視文字を残さない',
        severity: 'blocker',
        confidence: 'high',
      },
      'confusable-whitespace': {
        finding: '通常の空白に紛れる変則空白（NBSP 等）がコードに混入している',
        evidence:
          '文字列リテラル・コメント外に U+00A0 / U+2000–200A / U+3000 等の非 ASCII 空白が追加されている',
        impact: '見た目は空白だが解析・実行に影響し、貼り付けミスや難読化の温床になる',
        fix: '通常の半角スペースへ置き換える。全角空白等が必要なら文字列リテラル内に限定する',
        severity: 'warning',
        confidence: 'medium',
      },
    },
  },
  {
    skillId: 'logging-observability',
    detect: findSilentCatch,
    findings: {
      'silent-catch': {
        finding: 'catch で例外が握りつぶされる可能性がある',
        evidence: 'catch 内で return（ログ/再throwなし）',
        impact: '障害調査や失敗検知が困難になる',
        fix: 'ログ+再throw / 上位へ返す / 無視するなら理由コメント+計測を検討する',
        severity: 'nit',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'logging-observability',
    detect: findDebuggerLeftover,
    findings: {
      'debugger-leftover': {
        finding: 'デバッグ用 `debugger` 文がコミットされている',
        evidence: '`debugger;` が追加された',
        impact: '実行が一時停止する／本番に混入すると不具合や情報露出につながる',
        fix: 'commit 前に `debugger` 文を削除する',
        severity: 'warning',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'logging-observability',
    detect: findMergeConflict,
    findings: {
      'merge-conflict': {
        finding: '未解決のマージコンフリクトマーカーがコミットされている',
        evidence: '`<<<<<<<` / `>>>>>>>`（diff3 では `|||||||` も）マーカーが追加された',
        impact: 'コードが壊れ、ビルド/実行が失敗する',
        fix: 'コンフリクトを解消し、マーカーを完全に削除する',
        severity: 'blocker',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'typescript-strict',
    detect: findTsSuppression,
    findings: {
      'ts-suppression': {
        finding: '型チェックの抑制（@ts-ignore / @ts-nocheck）が追加されている',
        evidence: '`@ts-ignore` または `@ts-nocheck` が追加された',
        impact: '型エラーが隠れ、潜在的な不具合を見逃す',
        fix: '型を修正する。やむを得ない場合は範囲を限定した `@ts-expect-error` + 理由コメントを使う',
        severity: 'nit',
        confidence: 'medium',
      },
    },
  },
  {
    skillId: 'altitude-generalization',
    detect: findCallerSpecialCase,
    findings: {
      'caller-special-case': {
        finding: '共有関数に特定の呼び出し元専用の分岐（special-case）が追加されている',
        evidence: '呼び出し元判定の分岐（`.caller === ...`）が同種2つ以上存在する',
        impact: '呼び出し元が増えるたびに共有関数が肥大化し、保守が難化する',
        fix: '呼び出し元ごとの設定を宣言的マップ / strategy へ寄せ、下層機構を一般化する',
        severity: 'nit',
        confidence: 'high',
      },
    },
  },
  {
    skillId: 'closure-scope-retention',
    detect: findClosureScopeRetention,
    findings: {
      'closure-scope-retention': {
        finding:
          '長寿命オブジェクトが closure で enclosing scope の大きなデータを保持し続ける可能性がある',
        evidence:
          'module-level キャッシュへ代入される closure が readFile / parse 結果の変数を参照している',
        impact: 'オブジェクトの生存中、大きな元データが解放されずメモリを圧迫する',
        fix: '必要なフィールドだけを Map / 明示フィールドへ縮約し、closure に大きな元データを掴ませない',
        severity: 'warning',
        confidence: 'medium',
      },
    },
  },
  {
    skillId: 'test-existence',
    detect: findMissingTests,
    findings: { 'missing-tests': MISSING_TESTS_FINDING },
  },
  {
    skillId: 'test-existence',
    detect: findFocusedTests,
    findings: { 'focused-test': FOCUSED_TEST_FINDING },
  },
  {
    skillId: 'test-existence',
    detect: findDisabledTests,
    findings: { 'disabled-test': DISABLED_TEST_FINDING },
  },
  {
    skillId: 'coverage-gap',
    skipIfSkill: 'test-existence',
    detect: findMissingTests,
    findings: { 'missing-tests': MISSING_TESTS_FINDING },
  },
  {
    skillId: 'coverage-gap',
    skipIfSkill: 'test-existence',
    detect: findFocusedTests,
    findings: { 'focused-test': FOCUSED_TEST_FINDING },
  },
  {
    skillId: 'coverage-gap',
    skipIfSkill: 'test-existence',
    detect: findDisabledTests,
    findings: { 'disabled-test': DISABLED_TEST_FINDING },
  },
  {
    skillId: 'knowledge-to-code-alignment',
    detect: findTemporaryWithoutExit,
    findings: {
      'temporary-without-exit': {
        finding: '一時対応コメントに撤去条件が書かれていない',
        evidence:
          'TODO / FIXME / HACK / WORKAROUND / 暫定 等のコメントが追加されたが、同じコメント塊に Issue 参照・URL・期日/バージョン・条件節のいずれも無い',
        impact: 'いつ外せるか誰も判断できず、一時対応がそのまま恒久化して設計を固定する',
        fix: 'Issue 番号・期日・解消条件のいずれかをコメントへ書き足すか、その場で恒久対応する',
        // nit（出力スキーマの minor）。同じレジストリの silent-catch /
        // ts-suppression / caller-special-case と揃える。warning は
        // finding-factory で major へ写り run-gate の blockingFindings に
        // 計上されるため、一時対応コメントの書式不足で gate を NO_GO へ
        // 倒してしまう。
        severity: 'nit',
        confidence: 'medium',
      },
    },
  },
];

/**
 * スキルIDとヒューリスティック検出関数名のマッピング（レジストリから導出）。
 * dry-run 時はこのマッピングに含まれるスキルのみ実行される。
 * value（関数名配列）はドキュメント用途で、プログラムは keys のみ消費する。
 */
export const SKILL_HEURISTIC_MAP = HEURISTIC_REGISTRY.reduce((map, { skillId, detect }) => {
  (map[skillId] ??= []).push(detect.name);
  return map;
}, {});

/**
 * ヒューリスティック対応スキルIDの一覧（dry-run 時のフィルタリング用）
 */
export const HEURISTIC_SKILL_IDS = Object.keys(SKILL_HEURISTIC_MAP);

/**
 * kind → プレゼンテーション（finding/evidence/impact/fix/severity/confidence）の
 * ルックアップ（レジストリから導出）。review-engine の日本語メッセージ生成が消費する。
 */
export const HEURISTIC_KIND_PRESENTATIONS = new Map(
  HEURISTIC_REGISTRY.flatMap((entry) => Object.entries(entry.findings))
);

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getSkillId(skill) {
  return skill?.metadata?.id ?? skill?.id ?? null;
}

function hasSkill(plan, skillId) {
  const selected = ensureArray(plan?.selected);
  return selected.some((skill) => getSkillId(skill) === skillId);
}

function* iterateAddedLines(file) {
  const hunks = ensureArray(file?.hunks);
  for (const hunk of hunks) {
    let newLineNumber = hunk.newStart ?? 0;
    for (const rawLine of ensureArray(hunk.lines)) {
      if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
        yield { line: newLineNumber, text: rawLine.slice(1) };
        newLineNumber += 1;
        continue;
      }
      if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
        continue;
      }
      newLineNumber += 1;
    }
  }
}

function* iterateSingleHunkLines(hunk) {
  let newLineNumber = hunk?.newStart ?? 0;
  for (const rawLine of ensureArray(hunk?.lines)) {
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      yield { type: 'add', line: newLineNumber, text: rawLine.slice(1) };
      newLineNumber += 1;
      continue;
    }
    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      yield { type: 'del', line: null, text: rawLine.slice(1) };
      continue;
    }
    // context line (usually starts with a space)
    const text = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
    yield { type: 'ctx', line: newLineNumber, text };
    newLineNumber += 1;
  }
}

function* iterateHunkLines(file) {
  for (const hunk of ensureArray(file?.hunks)) {
    yield* iterateSingleHunkLines(hunk);
  }
}

function isEnvReference(code) {
  return /\b(process\.env|import\.meta\.env)\b/.test(code);
}

function looksLikeLogging(code) {
  return /\b(console\.(?:log|info|warn|error)|logger\.\w+|log\.\w+)\b/.test(code);
}

function matchesHardcodedSecretLine(code) {
  if (isEnvReference(code)) return false;

  // Typical high-signal tokens/keys
  const explicitPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/, // AWS Access Key ID
    /\bghp_[A-Za-z0-9]{36,}\b/, // GitHub token
    /\bsk-(?:live|test)?_[A-Za-z0-9]{16,}\b/, // Stripe-like
    /\bsk-[A-Za-z0-9]{16,}\b/, // OpenAI-like (generic)
  ];
  if (explicitPatterns.some((re) => re.test(code))) return true;

  // Heuristic: suspicious identifier name + long-ish string literal
  const assignMatch =
    /\b(?:export\s+)?(?:const|let|var)\s+(?<name>[A-Za-z0-9_]+)\s*=\s*(?<quote>['"`])(?<value>[^'"`]+)\k<quote>/.exec(
      code
    ) ||
    /['"](?<name>[A-Za-z0-9_]+)['"]\s*:\s*(?<quote>['"`])(?<value>[^'"`]+)\k<quote>/.exec(code) ||
    /\b(?<name>[A-Za-z0-9_]+)\s*:\s*(?<quote>['"`])(?<value>[^'"`]+)\k<quote>/.exec(code);
  if (!assignMatch) return false;

  const name = assignMatch.groups?.name ?? '';
  const value = assignMatch.groups?.value ?? '';
  if (!/(token|secret|api[_-]?key|password|passwd|private[_-]?key)/i.test(name)) return false;
  if (value.length < 10) return false;
  if (/^https?:\/\//i.test(value)) return false;
  return true;
}

function findHardcodedSecrets({ diff }) {
  // Avoid noisy output when many hardcoded values are introduced at once.
  const MAX_HARDCODED_SECRET_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);

  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (normalized.includes('/fixtures/') || normalized.includes('/__fixtures__/')) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesHardcodedSecretLine(text)) continue;
      comments.push({
        file: filePath,
        line,
        kind: 'hardcoded-secret',
      });
      if (comments.length >= MAX_HARDCODED_SECRET_COMMENTS) return comments;
    }
  }

  return comments;
}

function matchesSilentCatchLine(code) {
  const lower = code.toLowerCase();
  const hasCatch = lower.includes('catch (') || lower.includes('catch(') || /\bcatch\b/.test(lower);
  if (!hasCatch) return false;
  if (looksLikeLogging(code)) return false;
  if (/\bthrow\b/.test(code)) return false;
  if (/\breturn\s*;\s*(?:\/\/.*)?$/.test(code)) return true;
  if (/\breturn\s+(null|undefined)\s*;\s*(?:\/\/.*)?$/.test(code)) return true;
  if (/\bcatch\s*\([^)]*\)\s*\{\s*\}\s*$/.test(code)) return true;
  return false;
}

function findSilentCatch({ diff }) {
  const comments = [];
  const files = ensureArray(diff?.files);

  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    let catchAnchor = null;
    let window = 0;
    let sawLogOrThrow = false;

    for (const entry of iterateHunkLines(file)) {
      const text = entry.text ?? '';

      // One-liner: catch (...) {}
      if (matchesSilentCatchLine(text) && entry.line != null) {
        comments.push({ file: filePath, line: entry.line, kind: 'silent-catch' });
        if (comments.length >= 3) return comments;
        catchAnchor = null;
        window = 0;
        sawLogOrThrow = false;
        continue;
      }

      if (entry.line != null && /\bcatch\s*\(/.test(text)) {
        catchAnchor = entry.line;
        window = 8;
        sawLogOrThrow = false;
        continue;
      }

      if (window > 0) {
        if (entry.type === 'add') {
          if (looksLikeLogging(text) || /\bthrow\b/.test(text)) {
            sawLogOrThrow = true;
          }
          if (
            !sawLogOrThrow &&
            (/\breturn\s*;\s*(?:\/\/.*)?$/.test(text) ||
              /\breturn\s+(null|undefined)\s*;/.test(text))
          ) {
            comments.push({
              file: filePath,
              line: catchAnchor ?? entry.line ?? 1,
              kind: 'silent-catch',
            });
            if (comments.length >= 3) return comments;
            catchAnchor = null;
            window = 0;
            sawLogOrThrow = false;
            continue;
          }
        }
        window -= 1;
      }
    }
  }

  return comments;
}

function looksLikeTestFile(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  return (
    normalized.startsWith('test/') ||
    normalized.startsWith('tests/') ||
    normalized.startsWith('__tests__/') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.includes('/__tests__/') ||
    // E2E スイートのディレクトリ慣習（e2e/ / cypress/）。完全なパス片のみ
    // 一致させ、`e2e-utils/` のような別名ディレクトリは巻き込まない（#1797）。
    /(^|\/)(e2e|cypress)\//.test(normalized) ||
    // パス区切り直後（またはパス先頭）から始まる `test.` / `spec.` ファイル名
    // （`e2e/spec.ts` 等）。従来の /\.(test|spec)\./ は先行ドットを要求するため
    // この形が素通りしていた（#1797）。`protest.js` / `src/contest/` のような
    // 部分一致は境界条件（^ or /）で除外される。
    /(^|\/)(test|spec)\./.test(normalized) ||
    /\.(test|spec)\./.test(normalized)
  );
}

// Strip a trailing `//` line comment, but only when the `//` is NOT inside a
// string literal. A naive `/\/\/.*$/` strip would corrupt lines like
// `const u = "http://x"; eval(y)` (removing the real `eval`). We treat the
// first `//` whose preceding text has balanced quotes as the comment start.
function stripTrailingLineComment(code) {
  const s = String(code);
  let searchFrom = 0;
  for (;;) {
    const idx = s.indexOf('//', searchFrom);
    if (idx === -1) return s;
    const before = s.slice(0, idx);
    const dq = (before.match(/"/g) || []).length;
    const sq = (before.match(/'/g) || []).length;
    const bq = (before.match(/`/g) || []).length;
    if (dq % 2 === 0 && sq % 2 === 0 && bq % 2 === 0) {
      return before;
    }
    searchFrom = idx + 2;
  }
}

function looksLikeProductCodeFile(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (looksLikeTestFile(normalized)) return false;
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return false;
  return (
    normalized.startsWith('src/') ||
    normalized.startsWith('lib/') ||
    normalized.includes('/src/') ||
    normalized.includes('/lib/')
  );
}

function hasBehaviorChangeSignal({ diff }) {
  const files = ensureArray(diff?.files);
  for (const file of files) {
    for (const { text } of iterateAddedLines(file)) {
      if (/\bif\s*\(/.test(text) || /\bswitch\s*\(/.test(text) || /\bthrow\s+new\b/.test(text))
        return true;
    }
  }
  return false;
}

function findMissingTests({ diff }) {
  const files = ensureArray(diff?.files);
  const changedPaths = files
    .map((f) => f?.path)
    .filter(Boolean)
    .filter((p) => p !== '/dev/null');
  const touchesTests = changedPaths.some(looksLikeTestFile);
  const touchesCode = changedPaths.some(looksLikeProductCodeFile);
  if (!touchesCode || touchesTests) return [];
  if (!hasBehaviorChangeSignal({ diff })) return [];

  const firstCodeFile = files.find((f) => looksLikeProductCodeFile(f?.path));
  const filePath = firstCodeFile?.path;
  const line = firstCodeFile?.addedLines?.[0] || firstCodeFile?.hunks?.[0]?.newStart || 1;
  return [
    {
      file: filePath,
      line,
      kind: 'missing-tests',
    },
  ];
}

/**
 * Check if a file path is a GitHub Actions workflow file.
 * @param {string} filePath - File path to check
 * @returns {boolean} True if the file is a workflow YAML file in .github/workflows/
 */
function looksLikeGitHubWorkflowFile(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  return normalized.startsWith('.github/workflows/') && /\.(yml|yaml)$/.test(normalized);
}

/**
 * Detect GitHub Actions security issues in workflow files.
 * Checks for common security vulnerabilities including:
 * - pull_request_target privilege escalation risks
 * - Excessive permissions (write-all)
 * - Secrets exposed in run blocks
 * - Unsanitized user input in run blocks (command injection)
 * @param {{diff: {files?: Array}}} options - Diff object containing file changes
 * @returns {Array<{file: string, line: number, kind: string}>} Array of detected security issues
 */
function findGitHubActionsIssues({ diff }) {
  const MAX_WORKFLOW_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);

  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || !looksLikeGitHubWorkflowFile(filePath)) continue;

    for (const { line, text } of iterateAddedLines(file)) {
      // Check for pull_request_target usage (privilege escalation risk)
      if (
        /^\s*(-\s+)?pull_request_target\s*:?\s*$/.test(text) ||
        /\bon\s*:\s*\[[^\]]*\bpull_request_target\b[^\]]*\]/.test(text)
      ) {
        comments.push({
          file: filePath,
          line,
          kind: 'gh-actions-pull-request-target',
        });
        if (comments.length >= MAX_WORKFLOW_COMMENTS) return comments;
        continue;
      }

      // Check for excessive permissions
      if (/permissions\s*:\s*(write-all|'write-all'|"write-all")/.test(text)) {
        comments.push({
          file: filePath,
          line,
          kind: 'gh-actions-excessive-permissions',
        });
        if (comments.length >= MAX_WORKFLOW_COMMENTS) return comments;
        continue;
      }

      // Check for secrets in run blocks (potential exposure)
      if (/\$\{\{\s*secrets\.\w+\s*\}\}/.test(text) && /run\s*:/.test(text)) {
        comments.push({
          file: filePath,
          line,
          kind: 'gh-actions-secret-in-run',
        });
        if (comments.length >= MAX_WORKFLOW_COMMENTS) return comments;
        continue;
      }

      // Check for unsanitized user input in run blocks (command injection)
      if (
        /run\s*:/.test(text) &&
        /\$\{\{\s*github\.event\.(issue|pull_request|comment)\.(title|body)\s*\}\}/.test(text) &&
        !/\|\s*jq\b/.test(text) &&
        !/toJSON/.test(text)
      ) {
        comments.push({
          file: filePath,
          line,
          kind: 'gh-actions-unsanitized-input',
        });
        if (comments.length >= MAX_WORKFLOW_COMMENTS) return comments;
        continue;
      }
    }
  }

  return comments;
}

// High-confidence code-injection / XSS smells. Deliberately conservative
// (only patterns that are rarely intentional or safe) so the no-LLM path
// stays low-false-positive.
function matchesDangerousEval(code) {
  let trimmed = String(code).trim();
  // Skip comment lines and trailing comments so an `eval` in a comment is
  // not flagged.
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  trimmed = stripTrailingLineComment(trimmed).trim();
  if (/\beval\s*\(/.test(trimmed)) return true;
  if (/\bnew\s+Function\s*\(/.test(trimmed)) return true;
  if (/dangerouslySetInnerHTML/.test(trimmed)) return true;
  if (/\bdocument\.write(?:ln)?\s*\(/.test(trimmed)) return true;
  // A string first argument to a timer is an implicit eval.
  if (/\b(?:setTimeout|setInterval)\s*\(\s*['"`]/.test(trimmed)) return true;
  return false;
}

function findDangerousEval({ diff }) {
  const MAX_DANGEROUS_EVAL_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (normalized.includes('/fixtures/') || normalized.includes('/__fixtures__/')) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesDangerousEval(text)) continue;
      comments.push({ file: filePath, line, kind: 'dangerous-eval' });
      if (comments.length >= MAX_DANGEROUS_EVAL_COMMENTS) return comments;
    }
  }
  return comments;
}

// Accidental focused tests (`.only`) silently skip the rest of the suite in CI.
function matchesFocusedTest(code) {
  const trimmed = String(code).trim();
  // Skip comment lines so a commented-out `.only` is not flagged.
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  return /\b(?:describe|context|it|test|suite|bench)\.only\s*\(/.test(trimmed);
}

function findFocusedTests({ diff }) {
  const MAX_FOCUSED_TEST_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (!looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesFocusedTest(text)) continue;
      comments.push({ file: filePath, line, kind: 'focused-test' });
      if (comments.length >= MAX_FOCUSED_TEST_COMMENTS) return comments;
    }
  }
  return comments;
}

// Disabled tests (`.skip` / `xit` / `xdescribe`) committed into the suite.
// Advisory only (nit): sometimes intentional for known-pending tests.
function matchesDisabledTest(code) {
  const trimmed = String(code).trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  return (
    /\b(?:describe|context|it|test|suite|bench)\.skip\s*\(/.test(trimmed) ||
    /\b(?:xit|xdescribe|xtest|xcontext)\s*\(/.test(trimmed)
  );
}

function findDisabledTests({ diff }) {
  const MAX_DISABLED_TEST_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (!looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesDisabledTest(text)) continue;
      comments.push({ file: filePath, line, kind: 'disabled-test' });
      if (comments.length >= MAX_DISABLED_TEST_COMMENTS) return comments;
    }
  }
  return comments;
}

// Leftover `debugger;` statement (a near-zero-false-positive debug artifact).
function matchesDebuggerLeftover(code) {
  let trimmed = String(code).trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  // Drop a trailing line comment so `const x = 1; // debugger` is not flagged.
  trimmed = stripTrailingLineComment(trimmed).trim();
  return /\bdebugger\s*;/.test(trimmed) || /(?:^|[;{}\s])debugger\s*$/.test(trimmed);
}

function findDebuggerLeftover({ diff }) {
  const MAX_DEBUGGER_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesDebuggerLeftover(text)) continue;
      comments.push({ file: filePath, line, kind: 'debugger-leftover' });
      if (comments.length >= MAX_DEBUGGER_COMMENTS) return comments;
    }
  }
  return comments;
}

// Disabled TLS certificate verification — a near-zero-false-positive security smell.
function matchesInsecureTls(code) {
  const trimmed = String(code).trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  if (/rejectUnauthorized\s*:\s*false/.test(trimmed)) return true;
  // Only when NODE_TLS_REJECT_UNAUTHORIZED is being SET to 0 (which disables
  // verification) — not when it is merely read or set to 1.
  if (/NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*['"`]?0\b/.test(trimmed)) return true;
  return false;
}

function findInsecureTls({ diff }) {
  const MAX_INSECURE_TLS_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesInsecureTls(text)) continue;
      comments.push({ file: filePath, line, kind: 'insecure-tls' });
      if (comments.length >= MAX_INSECURE_TLS_COMMENTS) return comments;
    }
  }
  return comments;
}

// Weak hash algorithm via the Node crypto idiom (near-zero false positive).
function matchesWeakHash(code) {
  let trimmed = String(code).trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  trimmed = stripTrailingLineComment(trimmed).trim();
  return /createHash\s*\(\s*['"`](?:md5|sha1)['"`]/i.test(trimmed);
}

function findWeakHash({ diff }) {
  const MAX_WEAK_HASH_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesWeakHash(text)) continue;
      comments.push({ file: filePath, line, kind: 'weak-hash' });
      if (comments.length >= MAX_WEAK_HASH_COMMENTS) return comments;
    }
  }
  return comments;
}

// Shell command built from a template literal with interpolation — a command
// injection smell when the interpolated value can be attacker-controlled.
function matchesCommandInjection(code) {
  let trimmed = String(code).trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  trimmed = stripTrailingLineComment(trimmed).trim();
  // execSync / spawn / spawnSync are unambiguous child_process APIs. Bare `exec`
  // is matched only when NOT a method call (negative lookbehind) so that
  // `regex.exec(`...`)` and `db.exec(`...`)` are not false-flagged.
  return (
    /(?<![.\w])exec\s*\(\s*`[^`]*\$\{/.test(trimmed) ||
    /\b(?:execSync|spawnSync|spawn)\s*\(\s*`[^`]*\$\{/.test(trimmed)
  );
}

function findCommandInjection({ diff }) {
  const MAX_COMMAND_INJECTION_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesCommandInjection(text)) continue;
      comments.push({ file: filePath, line, kind: 'command-injection' });
      if (comments.length >= MAX_COMMAND_INJECTION_COMMENTS) return comments;
    }
  }
  return comments;
}

// Unresolved git conflict markers committed into a file. The `<<<<<<<` /
// `>>>>>>>` markers are unambiguous; `=======` is intentionally excluded
// (it collides with Markdown h1 underlines).
function matchesMergeConflict(code) {
  // <<<<<<< / >>>>>>> are always present; ||||||| is the diff3/zdiff3 base
  // marker. ======= is intentionally excluded (Markdown h1-underline collision).
  return /^<{7}(?:\s|$)/.test(code) || /^>{7}(?:\s|$)/.test(code) || /^\|{7}(?:\s|$)/.test(code);
}

function findMergeConflict({ diff }) {
  const MAX_MERGE_CONFLICT_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesMergeConflict(text)) continue;
      comments.push({ file: filePath, line, kind: 'merge-conflict' });
      if (comments.length >= MAX_MERGE_CONFLICT_COMMENTS) return comments;
    }
  }
  return comments;
}

// `@ts-ignore` / `@ts-nocheck` suppress type checking. `@ts-expect-error` is
// the recommended, scoped form and is intentionally NOT flagged.
function matchesTsSuppression(code) {
  return /@ts-ignore\b/.test(code) || /@ts-nocheck\b/.test(code);
}

function findTsSuppression({ diff }) {
  const MAX_TS_SUPPRESSION_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      if (!matchesTsSuppression(text)) continue;
      comments.push({ file: filePath, line, kind: 'ts-suppression' });
      if (comments.length >= MAX_TS_SUPPRESSION_COMMENTS) return comments;
    }
  }
  return comments;
}

// Per-caller special-case branch ("bandaid") on a shared function, e.g.
// `if (options.caller === 'markdown-exporter') { ... }`. Keyed strictly on a
// caller-identity comparison so a first-class public option (host opt-in,
// e.g. `if (options.compact)`) is never flagged.
function matchesCallerSpecialCase(code) {
  let trimmed = String(code).trim();
  // Skip comment lines and trailing comments so a mention in a comment is
  // not counted as a branch.
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  trimmed = stripTrailingLineComment(trimmed).trim();
  return /\bif\s*\(\s*[\w$.]+\.caller\s*===\s*['"`]/.test(trimmed);
}

// Altitude: fires only when the diff ADDS a caller-identity branch AND the
// SAME hunk shows two or more same-kind branches in total (added +
// surrounding context). Counting is per hunk, not per file: two unrelated
// functions each carrying a single branch are different contexts and must
// not add up to a finding (FP-first, #1070). A single branch is not enough
// evidence to propose generalizing the lower-level mechanism (see
// skills/midstream/altitude-generalization).
function findCallerSpecialCase({ diff }) {
  const MAX_CALLER_SPECIAL_CASE_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (normalized.includes('/fixtures/') || normalized.includes('/__fixtures__/')) continue;

    for (const hunk of ensureArray(file?.hunks)) {
      let sameKindCount = 0;
      let firstAddedLine = null;
      for (const { type, line, text } of iterateSingleHunkLines(hunk)) {
        if (type === 'del') continue;
        if (!matchesCallerSpecialCase(text)) continue;
        sameKindCount += 1;
        if (type === 'add' && firstAddedLine === null) firstAddedLine = line;
      }
      if (firstAddedLine === null || sameKindCount < 2) continue;
      comments.push({ file: filePath, line: firstAddedLine, kind: 'caller-special-case' });
      if (comments.length >= MAX_CALLER_SPECIAL_CASE_COMMENTS) return comments;
    }
  }
  return comments;
}

// Long-lived singleton built from closures that keep large enclosing-scope
// data (file contents / parsed documents) reachable. Conservative 3-signal
// conjunction (all required) to stay low-false-positive:
//   A. a cache-like slot is assigned an object literal (`cachedX = {`). The
//      slot name is extracted from the assignment itself, so the detector
//      also fires when the declaration (`let cachedX = null`) already exists
//      outside the diff — the common "add a closure to an existing cache
//      variable" change (gemini review on #1465)
//   B. large-data locals bound from readFile / parse* / flatMap-map pipelines
//   C. a shorthand method inside that object references one of the large-data
//      locals on a line after the assignment (the closure capture)
// The recommended "reduce immediately into a small Map and return it" pattern
// has no cache-slot assignment (A) and therefore never fires.
function findClosureScopeRetention({ diff }) {
  const MAX_CLOSURE_RETENTION_COMMENTS = 3;
  // Plain assignment only (no let/var/const): the cache slot is declared
  // elsewhere (module level), which is what makes the object long-lived.
  const SLOT_ASSIGN_RE = /^\s*(\w*(?:cache|cached|memo|singleton|lookup)\w*)\s*=\s*\{/i;
  const LARGE_DATA_RE =
    /\bconst\s+(\w+)\s*=\s*(?:await\s+)?(?:readFile(?:Sync)?\s*\(|parse\w*\s*\(|[\w$.]+\.(?:flatMap|map)\s*\()/;
  const METHOD_SHORTHAND_RE = /^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/;
  const comments = [];
  const files = ensureArray(diff?.files);

  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (normalized.includes('/fixtures/') || normalized.includes('/__fixtures__/')) continue;

    // Comment-stripped view of the added lines (checklist §1).
    const codeLines = [];
    for (const { line, text } of iterateAddedLines(file)) {
      const trimmed = String(text).trim();
      const isComment =
        trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
      codeLines.push({ line, code: isComment ? '' : stripTrailingLineComment(String(text)) });
    }

    // A. cache-like slot assigned an object literal (slot name taken from
    // the assignment itself; the declaration may live outside the diff)
    let assignLine = null;
    let assignIndex = -1;
    for (let i = 0; i < codeLines.length; i += 1) {
      if (SLOT_ASSIGN_RE.test(codeLines[i].code)) {
        assignLine = codeLines[i].line;
        assignIndex = i;
        break;
      }
    }
    if (assignLine === null) continue;

    // B. large-data locals (file contents / parsed structures)
    const largeDataNames = [];
    for (const { code } of codeLines) {
      const m = LARGE_DATA_RE.exec(code);
      if (m) largeDataNames.push(m[1]);
    }
    if (!largeDataNames.length) continue;

    // C. a method in the object references a large-data local (closure capture)
    let sawMethod = false;
    let capturesLargeData = false;
    for (let i = assignIndex + 1; i < codeLines.length; i += 1) {
      const { code } = codeLines[i];
      if (METHOD_SHORTHAND_RE.test(code)) sawMethod = true;
      if (sawMethod && largeDataNames.some((name) => new RegExp(`\\b${name}\\b`).test(code))) {
        capturesLargeData = true;
        break;
      }
    }
    if (!capturesLargeData) continue;

    comments.push({ file: filePath, line: assignLine, kind: 'closure-scope-retention' });
    if (comments.length >= MAX_CLOSURE_RETENTION_COMMENTS) return comments;
  }
  return comments;
}

// ---- Invisible / dangerous Unicode injection (GlassWorm-type, #1631) ----
// Detects non-rendering or deceptive Unicode characters newly added to source
// CODE lines. This is the vector behind 2026's "GlassWorm" supply-chain
// campaign (variation selectors / zero-width characters hiding executable
// payloads) and Trojan Source / CVE-2021-42574 (bidirectional-control
// reordering). Deterministic and canary-guarded (see #1070 responsibility
// split). Documentation (.md) legitimately uses zero-width joiners for emoji
// sequences and is out of scope, so detection is restricted to source-code
// extensions. Character classes are expressed as NUMERIC code points (not raw
// characters or \u escapes) so this detector file stays pure ASCII and never
// self-triggers.

// Bidirectional control characters (Trojan Source / CVE-2021-42574). Near-zero
// false positive in source code: U+202A..U+202E (LRE/RLE/PDF/LRO/RLO) and
// U+2066..U+2069 (LRI/RLI/FSI/PDI).
const BIDI_CONTROL_RANGES = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
// Bidirectional marks: ARABIC LETTER MARK (U+061C), LEFT-TO-RIGHT MARK
// (U+200E), RIGHT-TO-LEFT MARK (U+200F). Part of the CVE-2021-42574 detection
// set — invisible and abusable for display/execution reordering.
const BIDI_MARK_CPS = new Set([0x061c, 0x200e, 0x200f]);

// Zero-width / invisible format characters that have no legitimate use in code.
// Enumerated set (detection is limited to these code points, not exhaustive of
// all Unicode invisibles): ZERO WIDTH SPACE (U+200B), WORD JOINER (U+2060),
// SOFT HYPHEN (U+00AD), MONGOLIAN VOWEL SEPARATOR (U+180E), COMBINING GRAPHEME
// JOINER (U+034F), invisible math operators (U+2061..U+2064), HANGUL FILLERS
// (U+115F/U+1160/U+3164), BRAILLE PATTERN BLANK (U+2800), interlinear
// annotation anchors (U+FFF9..U+FFFB).
const INVISIBLE_FORMAT_CPS = new Set([
  0x200b, 0x2060, 0x00ad, 0x180e, 0x034f, 0x2061, 0x2062, 0x2063, 0x2064, 0x115f, 0x1160, 0x3164,
  0x2800, 0xfff9, 0xfffa, 0xfffb,
]);

// Confusable / unusual whitespace masquerading as an ASCII space: NBSP
// (U+00A0), OGHAM SPACE MARK (U+1680), EN..HAIR spaces (U+2000..U+200A),
// NARROW NO-BREAK (U+202F), MEDIUM MATH SPACE (U+205F), IDEOGRAPHIC SPACE
// (U+3000).
const CONFUSABLE_WS_CPS = new Set([0x00a0, 0x1680, 0x202f, 0x205f, 0x3000]);
const CONFUSABLE_WS_RANGE = [0x2000, 0x200a];

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const BOM = 0xfeff;
const VS_LOW = 0xfe00;
const VS_HIGH = 0xfe0f;
const KEYCAP = 0x20e3;
// Variation selectors supplement (VS17..VS256). Same GlassWorm data-hiding
// vector as the BMP selectors, on the supplementary plane.
const VS_SUP_LOW = 0xe0100;
const VS_SUP_HIGH = 0xe01ef;
// Tag characters (U+E0000..U+E007F). The primary GlassWorm / ASCII-smuggling
// and LLM prompt-injection vector. Legitimate only as an emoji tag sequence
// (subdivision flags: a pictographic base + tag chars + U+E007F CANCEL TAG).
const TAG_LOW = 0xe0000;
const TAG_HIGH = 0xe007f;

// Built from an ASCII source string, so no raw character appears in this file.
const EXTENDED_PICTOGRAPHIC_RE = new RegExp('\\p{Extended_Pictographic}', 'u');

function cpInRanges(cp, ranges) {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function isConfusableWhitespaceCp(cp) {
  return (
    CONFUSABLE_WS_CPS.has(cp) || (cp >= CONFUSABLE_WS_RANGE[0] && cp <= CONFUSABLE_WS_RANGE[1])
  );
}

// A ZWJ/ZWNJ or variation selector next to one of these is a legitimate emoji
// sequence, not injection: an Extended_Pictographic code point, a ZWJ, a
// variation selector, or the combining enclosing keycap.
function isEmojiAdjacentChar(ch) {
  if (!ch) return false;
  const cp = ch.codePointAt(0);
  if (cp === ZWJ || (cp >= VS_LOW && cp <= VS_HIGH) || (cp >= VS_SUP_LOW && cp <= VS_SUP_HIGH))
    return true;
  if (cp === KEYCAP) return true;
  return EXTENDED_PICTOGRAPHIC_RE.test(ch);
}

/**
 * Classify the dangerous Unicode present on a single (added) code line.
 * Returns a Set of kinds among 'bidi-control' | 'invisible-unicode' |
 * 'confusable-whitespace'. Conservative by construction (emoji sequences,
 * leading BOM, and in-string confusable whitespace are treated as legitimate).
 * @param {string} line
 * @returns {Set<string>}
 */
function detectInvisibleUnicodeKinds(line) {
  const kinds = new Set();
  const cps = Array.from(String(line));

  for (let idx = 0; idx < cps.length; idx += 1) {
    const ch = cps[idx];
    const cp = ch.codePointAt(0);
    const prev = cps[idx - 1] ?? '';
    const next = cps[idx + 1] ?? '';

    if (cpInRanges(cp, BIDI_CONTROL_RANGES) || BIDI_MARK_CPS.has(cp)) {
      kinds.add('bidi-control');
      continue;
    }

    if (INVISIBLE_FORMAT_CPS.has(cp)) {
      kinds.add('invisible-unicode');
      continue;
    }

    // Non-leading BOM / ZERO WIDTH NO-BREAK SPACE. A leading BOM at column 0 is
    // legitimate; anywhere else it is an invisible injection.
    if (cp === BOM) {
      if (idx > 0) kinds.add('invisible-unicode');
      continue;
    }

    // Bare ZERO WIDTH (NON-)JOINER: legitimate only inside an emoji sequence.
    if (cp === ZWJ || cp === ZWNJ) {
      if (!(isEmojiAdjacentChar(prev) || isEmojiAdjacentChar(next))) {
        kinds.add('invisible-unicode');
      }
      continue;
    }

    // Tag characters (U+E0000..U+E007F): the primary ASCII-smuggling /
    // prompt-injection vector. Legitimate only as an emoji tag sequence, whose
    // tag run is anchored to an Extended_Pictographic base (e.g. subdivision
    // flags). A tag run NOT anchored to a pictographic base is an injection.
    if (cp >= TAG_LOW && cp <= TAG_HIGH) {
      let j = idx - 1;
      while (j >= 0) {
        const pcp = cps[j].codePointAt(0);
        if (pcp >= TAG_LOW && pcp <= TAG_HIGH) {
          j -= 1;
          continue;
        }
        break;
      }
      const anchor = j >= 0 ? cps[j] : '';
      if (!(anchor && EXTENDED_PICTOGRAPHIC_RE.test(anchor))) {
        kinds.add('invisible-unicode');
      }
      continue;
    }

    // Variation selectors — BMP (U+FE00..FE0F) and supplement (U+E0100..E01EF).
    // A single selector right after a pictographic base is legitimate emoji
    // presentation; a chained run of selectors, or a selector on a
    // non-pictographic base, is data-hiding.
    const isVsBmp = cp >= VS_LOW && cp <= VS_HIGH;
    const isVsSup = cp >= VS_SUP_LOW && cp <= VS_SUP_HIGH;
    if (isVsBmp || isVsSup) {
      const nextCp = next ? next.codePointAt(0) : -1;
      const nextIsVs =
        (nextCp >= VS_LOW && nextCp <= VS_HIGH) || (nextCp >= VS_SUP_LOW && nextCp <= VS_SUP_HIGH);
      const prevIsPictographic = prev && EXTENDED_PICTOGRAPHIC_RE.test(prev);
      // A single selector after a pictographic base (emoji presentation) or one
      // immediately followed by a combining enclosing keycap (e.g. "1<FE0F><20E3>")
      // is legitimate. A chained run of selectors, or a selector on a plain
      // non-pictographic base, is data-hiding.
      const legitimatePresentation = prevIsPictographic || nextCp === KEYCAP;
      if (nextIsVs || !legitimatePresentation) {
        kinds.add('invisible-unicode');
      }
    }
  }

  // Confusable whitespace, but only OUTSIDE string literals and comment lines
  // (i18n text legitimately uses NBSP inside strings).
  const trimmed = String(line).trim();
  const isCommentLine =
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('#');
  if (!isCommentLine) {
    let inStr = null;
    for (let idx = 0; idx < cps.length; idx += 1) {
      const ch = cps[idx];
      if (inStr) {
        if (ch === inStr && cps[idx - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (isConfusableWhitespaceCp(ch.codePointAt(0))) {
        kinds.add('confusable-whitespace');
        break;
      }
    }
  }

  return kinds;
}

// Source-code file extensions. Documentation (.md, .txt) is intentionally
// excluded: it legitimately carries emoji ZWJ sequences and typographic spaces
// (#1631 out-of-scope). Config/markup text that can carry executable intent
// (yaml/json/toml/shell) is included.
function looksLikeSourceCodeFile(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|kts|php|c|h|cc|cpp|hpp|cs|swift|scala|sh|bash|zsh|lua|pl|sql|vue|svelte|yml|yaml|json|toml)$/.test(
    normalized
  );
}

function findInvisibleUnicode({ diff }) {
  const MAX_INVISIBLE_UNICODE_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);
  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    if (!looksLikeSourceCodeFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (normalized.includes('/fixtures/') || normalized.includes('/__fixtures__/')) continue;
    for (const { line, text } of iterateAddedLines(file)) {
      const kinds = detectInvisibleUnicodeKinds(text);
      // One finding per line, highest severity first.
      let kind = null;
      if (kinds.has('bidi-control')) kind = 'bidi-control';
      else if (kinds.has('invisible-unicode')) kind = 'invisible-unicode';
      else if (kinds.has('confusable-whitespace')) kind = 'confusable-whitespace';
      if (!kind) continue;
      comments.push({ file: filePath, line, kind });
      if (comments.length >= MAX_INVISIBLE_UNICODE_COMMENTS) return comments;
    }
  }
  return comments;
}

// ---- TEMPORARY_WITHOUT_EXIT (#1783 Phase 2) ----
// 一時対応（TODO / FIXME / HACK / WORKAROUND / 暫定 …）を示すコメントのうち、
// 「いつ・何が起きたら消せるか」= 撤去条件が書かれていないものを検出する。
// Taxonomy と severity の定義は docs/review/rationale-traceability.md（§2 / §7）
// が SSoT で、本検出器はその決定論チェック側の実装にあたる。
//
// 撤去条件は次のいずれか 1 つで充足とみなす（充足の証拠を広く取る FP-first 設計）。
//   1. Issue / チケット参照（`#123` / `GH-123` / `ABC-123` / `see issue 1234`）
//   2. URL（Issue・PR・上流バグ票へのリンク）
//   3. 期日 / バージョン（`2026-09-01` / `2026年9月` / `2026Q3` / `v2.1.0`）
//   4. 条件節（`until` / `once` / `when` / `after` / `unless` / `if` / `next release` /
//      `〜たら` / `〜まで` / `次第` / `〜後に` / `来月` …）
//   5. 恒久宣言（`keep forever` / `by design` / `permanent` / 恒久 …）。撤去条件そのもの
//      ではないが、「撤去しない」という意思表示であり、撤去条件を書き足す提案が
//      噛み合わないため許容する（#1797 項目 2）。
// 探索範囲は「マーカー行を含むコメント塊」であり、撤去条件が次行に折り返していても、
// ブロックコメント（`/* … */`）や HTML コメントの継続行にあっても、空行を挟んだ次の
// コメント行にあっても、既存の（context 行の）コメント塊にあっても発火しない。
//
// 実効範囲: 本検出器は配線先スキル `knowledge-to-code-alignment` が plan に選ばれた
// ときだけ動く。同スキルの applyTo（SKILL.md）は
// `src/**/*.{ts,tsx,js,jsx,mjs}` / `app/**/…` / `lib/**/…` の 3 パターンなので、
// 検出器も**リポジトリ直下の `src/` `app/` `lib/` 配下にある上記 5 拡張子のファイル
// だけ**を走査する（`TEMPORARY_SCOPE_PATH_RE`）。`scripts/` やリポジトリ直下の
// config、`tools/` / `migrations/` は applyTo の対象外なので、同じ PR で `src/**` が
// 変わって plan に載っても検出器側では発火しない。
// `.py` / `.sh` / `.yml` や別のディレクトリを対象にしたい場合は applyTo と検出器の
// 双方を広げる必要があり、別 issue とする（#1783 Phase 2 のスコープ外）。共有ヘルパー
// `looksLikeSourceCodeFile` は applyTo が `**/*` の invisible-unicode-injection と共用
// なので、そちらは絞らない。
//
// マーカーの ASCII 語は大文字表記に限定する。`workaround` のような小文字の散文的
// 言及（`// workaround for the Safari layout bug` 等）は一時対応の宣言とは限らず、
// 拾うと warning の誤検出になるため、意図的に取りこぼす（FN 側へ倒す）。
// 同じ理由で「一時的」「とりあえず」は対象外とする（`// 一時的にバッファへ退避する`
// のように、恒久的な実装の説明として日常的に使われるため）。
const TEMPORARY_MARKER_RE =
  /\b(?:TODO|FIXME|HACK|WORKAROUND|TEMPORARY)\b|暫定|一時対応|ワークアラウンド/;

// 配線先スキル `knowledge-to-code-alignment` の applyTo
// （`src/**/*.{ts,tsx,js,jsx,mjs}` / `app/**/…` / `lib/**/…`）と同じ条件。
// ディレクトリ接頭辞と拡張子の両方を見て、宣言（SKILL.md）と実効（検出器）を
// 一致させる。広げるときは SKILL.md の applyTo と同時に変える。
const TEMPORARY_SCOPE_PATH_RE = /^(?:src|app|lib)\/(?:.*\/)?[^/]+\.(?:ts|tsx|js|jsx|mjs)$/;

// 撤去条件の候補。過剰抑制（本来指摘すべきものを見逃す方向）は意図的に許容している:
// 例えば `\b[A-Z][A-Z0-9]{1,9}-\d+\b` は `UTF-8` / `SHA-1` / `RFC-3339` にも一致し、
// `\bv?\d+\.\d+\b` は `0.5 threshold` のような任意の小数にも一致する。誤って発火する
// （撤去条件が書いてあるのに指摘する）ほうが実害が大きいため、FP-first でこの緩さを
// 選んでいる。厳格化するときは negative canary を先に増やすこと。
const EXIT_CRITERIA_RES = [
  /#\d+\b/, // Issue / PR 番号
  /\bGH-\d+\b/i, // GH-123
  /\b[A-Z][A-Z0-9]{1,9}-\d+\b/, // JIRA 風のチケット ID（UTF-8 等にも一致する。上記参照）
  /\b(?:issues?|tickets?)\s*[#:]?\s*\d+/i, // `#` の無い `see issue 1234`
  /https?:\/\/\S/, // Issue / 上流バグ票へのリンク
  /\b20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/, // 2026-09-01 / 2026/9
  /20\d{2}\s*年\s*\d{1,2}\s*月/,
  /(?:^|[^A-Za-z])Q[1-4]\b/, // 2026Q3 / Q3（`\b` は 6Q 間に立たないため境界を自前で書く）
  /\bv?\d+\.\d+(?:\.\d+)?\b/, // バージョン（任意の小数にも一致する。上記参照）
  /\b(?:until|once|when|after|unless|if|as soon as|as of|pending|blocked on|blocked by|revisit|next release|next major|next version)\b/i,
  /たら|まで|次第|以降|後に|後は|解消|解決|修正され|リリースされ|対応され|移行後|廃止後|撤去条件|来月|来週|次のリリース/,
];

// 恒久宣言（#1797 項目 2）。恒久的な `HACK:` 注記（`// HACK: required by the DOM spec,
// keep forever`）に「撤去条件を書き足せ」と指摘しても噛み合わないため、撤去条件と
// 同等の許容リストとして扱う。担当者記法（`TODO(alice):`）は恒久宣言ではないので
// 引き続き指摘対象とする（同 issue のメンテナ決定）。
// `by design` は `by design review` / `by design team` のような名詞複合の偶然の並びを
// 除くため、直後に review / team / doc / spec / system が続く形を negative lookahead で
// 外す。bare な `permanent` / 恒久 は `// TODO: permanent fix が要る` のような一時対応の
// 説明文にも一致するが、EXIT_CRITERIA_RES と同じ FP-first の判断で過剰抑制側に倒す。
// 厳格化するときは negative canary を先に増やすこと。
const PERMANENT_DECLARATION_RES = [
  /\bkeep(?:s|ing)?\s+(?:this\s+|it\s+)?forever\b/i,
  /\bby[- ]design\b(?!\s+(?:reviews?|teams?|docs?|specs?|systems?)\b)/i,
  /\bpermanent(?:ly)?\b/i,
  /恒久/,
];

// vendored / 取り込み物。生成物（`dist/`）の判定は diff-processor の
// `isGeneratedArtifactPath` に委ね、ここでは重複させない。
const VENDORED_PATH_RE = /(?:^|\/)(?:node_modules|vendor|third_party|generated|__generated__)\//;

// テストデータとテンプレート置き場。fixtures に加えて examples / samples を除外する:
// これらの配下にあるのは利用者が埋める前提の placeholder（`// TODO: Process new order`
// 等）で、撤去条件が書かれることは原理的にない。`src/templates/` を一律除外しない判断は
// 既存テストで固定されており、ここでは変えない。
const TEMPORARY_EXCLUDED_DIR_RE = /\/(?:fixtures|__fixtures__|examples|example|samples)\//;

function countUnescapedBackticks(text) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === '`') count += 1;
  }
  return count;
}

/**
 * hunk の行を上から走査し、各行のコメント本文と「コメント塊として連結してよいか」
 * （`joinable`）を返す。行頭 prefix だけを見る素朴な判定では、ブロックコメント
 * （`/* … *\/`）や HTML コメントの継続行が prefix を持たないときに塊が切れ、そこに
 * 書かれた撤去条件を読み落として誤検出になる。そのため開いたブロックの状態を持ち回る。
 * 併せてテンプレートリテラルの内側も追跡し、擬似コードとして文字列に埋め込まれた
 * コメント（`const stub = \`\n  // ...\n\`;`）を対象から外す。
 * 行末コメントの切り出しは quote-aware な `stripTrailingLineComment` を使うので、
 * 文字列リテラル内の `//`（例: `const u = 'http://x'; // TODO`）で誤判定しない。
 * @param {Array<{text?: string}>} rows
 * @returns {Array<{comment: string, joinable: boolean}>}
 */
function scanCommentTexts(rows) {
  const scanned = [];
  let openBlock = null; // 'block' | 'html' | null
  let inTemplate = false;

  for (const row of rows) {
    const text = String(row?.text ?? '');

    if (openBlock) {
      const terminator = openBlock === 'block' ? '*/' : '-->';
      const idx = text.indexOf(terminator);
      if (idx === -1) {
        scanned.push({ comment: text.trim(), joinable: true });
        continue;
      }
      openBlock = null;
      scanned.push({ comment: text.slice(0, idx).trim(), joinable: true });
      continue;
    }

    if (inTemplate) {
      if (countUnescapedBackticks(text) % 2 === 1) inTemplate = false;
      scanned.push({ comment: '', joinable: false });
      continue;
    }

    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      scanned.push({ comment: trimmed, joinable: true });
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) openBlock = 'block';
      scanned.push({ comment: trimmed, joinable: true });
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) openBlock = 'html';
      scanned.push({ comment: trimmed, joinable: true });
      continue;
    }

    // コード行。行末コメントは「その行だけの単位」であり、隣の行末コメントとは
    // 連結しない（無関係なコメント同士がつながって過剰抑制になるのを防ぐ）。
    const code = stripTrailingLineComment(text);
    const trailing = code.length < text.length ? text.slice(code.length).trim() : '';
    const blockIdx = code.indexOf('/*');
    if (blockIdx !== -1 && code.indexOf('*/', blockIdx + 2) === -1) {
      openBlock = 'block';
      scanned.push({ comment: code.slice(blockIdx).trim(), joinable: true });
      continue;
    }
    if (countUnescapedBackticks(code) % 2 === 1) inTemplate = true;
    scanned.push({ comment: trailing, joinable: false });
  }

  return scanned;
}

/**
 * マーカー行 `index` を含むコメント塊の行番号一覧を返す。連結対象は full-line の
 * コメント（`joinable`）だけで、間に挟まる空行は透過する。
 */
function commentBlockIndexes(scanned, rows, index) {
  const indexes = [index];
  const isBlank = (i) => String(rows[i]?.text ?? '').trim() === '';

  for (let i = index - 1; i >= 0; i -= 1) {
    if (scanned[i].joinable && scanned[i].comment) {
      indexes.unshift(i);
      continue;
    }
    if (isBlank(i)) continue;
    break;
  }
  for (let i = index + 1; i < rows.length; i += 1) {
    if (scanned[i].joinable && scanned[i].comment) {
      indexes.push(i);
      continue;
    }
    if (isBlank(i)) continue;
    break;
  }
  return indexes;
}

function findTemporaryWithoutExit({ diff }) {
  const MAX_TEMPORARY_WITHOUT_EXIT_COMMENTS = 3;
  const comments = [];
  const files = ensureArray(diff?.files);

  for (const file of files) {
    const filePath = file?.path;
    if (!filePath || filePath === '/dev/null') continue;
    if (looksLikeTestFile(filePath)) continue;
    const normalized = String(filePath).replaceAll('\\', '/');
    if (!TEMPORARY_SCOPE_PATH_RE.test(normalized)) continue;
    if (isGeneratedArtifactPath(filePath)) continue;
    if (TEMPORARY_EXCLUDED_DIR_RE.test(normalized)) continue;
    if (VENDORED_PATH_RE.test(normalized)) continue;

    for (const hunk of ensureArray(file?.hunks)) {
      // 削除行を除いた「新しいファイルの姿」を hunk 単位で並べる。撤去条件が
      // 既存行（context）に書かれている場合も充足として扱うため context を残す。
      const rows = [...iterateSingleHunkLines(hunk)].filter((row) => row.type !== 'del');
      const scanned = scanCommentTexts(rows);

      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].type !== 'add') continue;
        if (!scanned[i].comment || !TEMPORARY_MARKER_RE.test(scanned[i].comment)) continue;

        const indexes = commentBlockIndexes(scanned, rows, i);
        const block = indexes.map((j) => scanned[j].comment).join('\n');
        const last = indexes[indexes.length - 1];

        if (
          EXIT_CRITERIA_RES.some((re) => re.test(block)) ||
          PERMANENT_DECLARATION_RES.some((re) => re.test(block))
        ) {
          i = last;
          continue;
        }

        comments.push({ file: filePath, line: rows[i].line, kind: 'temporary-without-exit' });
        if (comments.length >= MAX_TEMPORARY_WITHOUT_EXIT_COMMENTS) return comments;
        // 同じコメント塊に複数のマーカーが並んでも 1 件に留める。
        i = last;
      }
    }
  }

  return comments;
}

/**
 * Execute the heuristic detectors selected by the existing Skill plan.
 *
 * This is the detector adapter boundary for Review Viewpoints. It deliberately
 * returns uncapped detector signals in HEURISTIC_REGISTRY order so downstream
 * observe-mode consumers do not lose activation evidence behind the existing
 * eight-comment presentation limit. Routing remains owned by the selected
 * Skill plan and HEURISTIC_REGISTRY remains the detector SSoT.
 *
 * @param {{diff: {files?: Array}, plan: {selected?: Array}}} options
 * @returns {Array<{file?: string, line?: number, kind: string, skillId: string}>}
 */
export function collectHeuristicDetections({ diff, plan }) {
  const detections = [];

  for (const { skillId, detect, skipIfSkill } of HEURISTIC_REGISTRY) {
    if (!hasSkill(plan, skillId)) continue;
    // skipIfSkill: 上位スキルが選択されている場合は重複実行を避ける
    // （test-existence が選択されていれば coverage-gap の同一検出器は実行しない）。
    if (skipIfSkill && hasSkill(plan, skipIfSkill)) continue;
    for (const detection of detect({ diff })) {
      detections.push({ ...detection, skillId });
    }
  }

  return detections;
}

/**
 * Generate deterministic review comments from heuristics.
 * These comments are used as a fallback when LLM is not available.
 * The existing eight-comment presentation cap intentionally stays here rather
 * than in collectHeuristicDetections so observe-mode activation can inspect all
 * detector evidence without changing user-visible heuristic output.
 * @param {{diff: {files?: Array}, plan: {selected?: Array}}} options
 */
export function buildHeuristicComments({ diff, plan }) {
  return collectHeuristicDetections({ diff, plan }).slice(0, 8);
}
